/**
 * The decider: one call = one state + many typed questions. Answers come back under the
 * same keys. The client validates the response, retries transient failures,
 * tracks spend, and refuses to exceed a per-run spend cap.
 *
 * Two backends answer. JEV, through the OpenRouter Decisions API, needs an OPENROUTER_API_KEY.
 * Claude (`claude.ts`) needs no OpenRouter key: it is reached the way the writer is, through
 * Claude Code or the Claude API. `deciderBackend()` in config.ts picks one.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DECIDER, deciderBackend, JEV, PATHS, type DeciderBackend } from "../config.js";
import type { CallOptions, WriterCall } from "../answers/resolve.js";
import { decisionPrompt, DECIDER_SYSTEM, parseDecisions } from "./claude.js";
import { DecisionResponse, type Answer, type Questions, type State, type Usage } from "./types.js";

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** How the Claude backend reaches Claude. The real one is `callClaude` in the writer; tests give their own. */
export type ClaudeCaller = (prompt: string, system: string, meta: { purpose: WriterCall["purpose"]; jobId: string }, opts: CallOptions) => Promise<string>;

export type JevClientOptions = {
  /** Which backend answers. The default is `deciderBackend()`. */
  backend?: DeciderBackend;
  /** Reaches Claude for the Claude backend. Tests give a fake. */
  claude?: ClaudeCaller;
  apiKey?: string;
  fetchImpl?: FetchLike;
  endpoint?: string;
  model?: string;
  spendCapUsd?: number;
  /** When set, every call's usage is appended as JSON lines here. */
  usageLog?: string | null;
  siteUrl?: string;
  siteName?: string;
};

export class JevError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "JevError";
  }
}

export class JevClient {
  readonly backend: DeciderBackend;
  private readonly claude: ClaudeCaller | undefined;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly endpoint: string;
  private readonly model: string;
  private readonly spendCapUsd: number;
  private readonly usageLog: string | null;
  private readonly siteUrl: string | undefined;
  private readonly siteName: string | undefined;
  readonly usage: Usage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  constructor(opts: JevClientOptions = {}) {
    // A key or a fetch given outright means JEV was asked for; otherwise the environment decides.
    this.backend = opts.backend ?? (opts.apiKey || opts.fetchImpl ? "openrouter" : deciderBackend());
    this.claude = opts.claude;
    const key = opts.apiKey ?? process.env.OPENROUTER_API_KEY;
    if (this.backend === "openrouter" && !key) throw new JevError("OPENROUTER_API_KEY is not set. Add your key to .env, or leave it out and Claude will answer instead (JEV_BACKEND=claude).");
    this.apiKey = key ?? "";
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.endpoint = opts.endpoint ?? JEV.endpoint;
    this.model = opts.model ?? JEV.model;
    this.spendCapUsd = opts.spendCapUsd ?? (this.backend === "claude" ? DECIDER.runSpendCapUsd : JEV.runSpendCapUsd);
    this.usageLog = opts.usageLog === undefined ? PATHS.jevUsage : opts.usageLog;
    this.siteUrl = opts.siteUrl ?? process.env.OPENROUTER_SITE_URL;
    this.siteName = opts.siteName ?? process.env.OPENROUTER_SITE_NAME;
  }

  /** Asks every question against one state. Throws JevError on a non-recoverable failure. */
  async decide(state: State, questions: Questions, label = "decide"): Promise<Record<string, Answer>> {
    if (Object.keys(questions).length === 0) return {};
    if (this.usage.costUsd >= this.spendCapUsd) {
      throw new JevError(`the spend cap of $${this.spendCapUsd} was reached for this run`);
    }
    if (this.backend === "claude") return this.decideWithClaude(state, questions, label);
    const body = JSON.stringify({ model: this.model, state, questions });
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;
    if (this.siteName) headers["X-OpenRouter-Title"] = this.siteName;

    let lastError: JevError | undefined;
    for (let attempt = 0; attempt <= JEV.maxRetries; attempt++) {
      if (attempt > 0) await sleep(JEV.retryBaseMs * 2 ** (attempt - 1));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), JEV.timeoutMs);
      try {
        const res = await this.fetchImpl(this.endpoint, { method: "POST", headers, body, signal: controller.signal });
        const text = await res.text();
        if (res.status === 429 || res.status >= 500) {
          lastError = new JevError(`JEV ${res.status} on ${label}`, res.status, redact(text));
          continue;
        }
        if (!res.ok) throw new JevError(`JEV ${res.status} on ${label}: ${redact(text)}`, res.status, redact(text));
        const parsed = DecisionResponse.safeParse(JSON.parse(text));
        if (!parsed.success) throw new JevError(`JEV returned an unexpected shape on ${label}: ${parsed.error.message}`);
        this.record(parsed.data, label);
        this.assertAllAnswered(questions, parsed.data.answers, label);
        return parsed.data.answers;
      } catch (err) {
        if (err instanceof JevError) {
          if (err.status === undefined || (err.status !== 429 && err.status < 500)) throw err;
          lastError = err;
          continue;
        }
        const name = (err as { name?: string }).name;
        lastError = new JevError(`${name === "AbortError" ? "JEV timeout" : "JEV network error"} on ${label}: ${String(err)}`);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new JevError(`JEV failed on ${label}`);
  }

  /** Asks Claude every question against one state. A reply that does not fit is asked again, and told what was wrong. */
  private async decideWithClaude(state: State, questions: Questions, label: string): Promise<Record<string, Answer>> {
    const call = this.claude ?? (await import("../answers/resolve.js")).callClaude;
    const prompt = decisionPrompt(state, questions);
    let correction = "";
    let lastError: JevError | undefined;
    for (let attempt = 0; attempt < DECIDER.attempts; attempt++) {
      if (attempt > 0) await sleep(JEV.retryBaseMs * 2 ** (attempt - 1));
      let used: WriterCall | undefined;
      try {
        const text = await call(prompt + correction, DECIDER_SYSTEM, { purpose: "decide", jobId: label }, { model: DECIDER.model, effort: DECIDER.effort, maxTokens: DECIDER.maxOutputTokens, onCall: (c) => (used = c) });
        const answers = parseDecisions(text, questions);
        this.record({ answers, model: used?.model ?? DECIDER.model, usage: usageOf(used) }, label);
        return answers;
      } catch (err) {
        // A call that was paid for is counted even when its reply could not be used.
        if (used) this.record({ answers: {}, model: used.model, usage: usageOf(used) }, label);
        const message = err instanceof Error ? err.message : String(err);
        lastError = new JevError(`Claude could not answer ${label}: ${message}`);
        // A reply that did not fit is shown what was wrong. A call that failed is simply tried again.
        correction = /^(no answer for|"|the reply)/.test(message) ? `\n\nYour last reply could not be used: ${message}. Reply again with one valid JSON object and nothing else.` : "";
        if (/ANTHROPIC_API_KEY is not set|could not run /.test(message)) break;
      }
    }
    throw lastError ?? new JevError(`Claude could not answer ${label}`);
  }

  private record(res: DecisionResponse, label: string): void {
    const u = res.usage ?? {};
    this.usage.calls += 1;
    this.usage.inputTokens += u.input_tokens ?? 0;
    this.usage.outputTokens += u.output_tokens ?? 0;
    this.usage.costUsd += u.cost ?? 0;
    if (!this.usageLog) return;
    try {
      mkdirSync(path.dirname(this.usageLog), { recursive: true });
      appendFileSync(
        this.usageLog,
        JSON.stringify({ at: new Date().toISOString(), label, id: res.id, model: res.model, ...u }) + "\n",
      );
    } catch {
      /* usage logging is best effort */
    }
  }

  private assertAllAnswered(questions: Questions, answers: Record<string, Answer>, label: string): void {
    const missing = Object.keys(questions).filter((k) => !(k in answers));
    if (missing.length) throw new JevError(`JEV left questions unanswered on ${label}: ${missing.join(", ")}`);
    for (const [key, q] of Object.entries(questions)) {
      const a = answers[key];
      if (a && a.type !== q.type) throw new JevError(`JEV answered ${key} as ${a.type}, expected ${q.type}`);
    }
  }
}

function usageOf(call: WriterCall | undefined): { input_tokens: number; output_tokens: number; cost: number } {
  return { input_tokens: call ? call.inputTokens + call.cacheWriteTokens + call.cacheReadTokens : 0, output_tokens: call?.outputTokens ?? 0, cost: call?.costUsd ?? 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Strips anything that looks like a bearer token from an error body before it is surfaced. */
function redact(text: string): string {
  return text.replace(/sk-or-v1-[A-Za-z0-9]+/g, "sk-or-v1-[redacted]").slice(0, 500);
}

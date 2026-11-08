import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DECIDER, deciderBackend } from "../src/config.js";
import { extractObject, parseDecisions } from "../src/jev/claude.js";
import { JevClient, type ClaudeCaller } from "../src/jev/client.js";
import { choice, noul, score } from "../src/jev/questions.js";
import type { Questions } from "../src/jev/types.js";

const questions: Questions = {
  is_role: noul("Is it a data role?"),
  level: choice("Which level?", { junior: "0 to 2 years", senior: "4 to 8 years", lead: "manager or above" }),
  stack: score("How well does the stack match?", ["None", "Weak", "Partial", "Strong", "Near exact"]),
};

const reply = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ is_role: { p: 0.96 }, level: { choice: "senior", confidence: 0.9, alternatives: { lead: 0.08 } }, stack: { p: [0, 0.05, 0.15, 0.6, 0.2] }, ...over });

describe("which backend answers", () => {
  it("is JEV when there is an OpenRouter key and Claude when there is none, unless it is told", () => {
    expect(deciderBackend({ OPENROUTER_API_KEY: "k" })).toBe("openrouter");
    expect(deciderBackend({})).toBe("claude");
    expect(deciderBackend({ OPENROUTER_API_KEY: "   " })).toBe("claude");
    expect(deciderBackend({ OPENROUTER_API_KEY: "k", JEV_BACKEND: "claude" })).toBe("claude");
    expect(deciderBackend({ JEV_BACKEND: "openrouter" })).toBe("openrouter");
    expect(deciderBackend({ JEV_BACKEND: "nonsense" })).toBe("claude");
  });
});

describe("sending the questions", () => {
  const long = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`option_${i}`, `A long enough description for option number ${i}`]));
  const many: Questions = { a: choice("First?", long), b: choice("Second?", long), c: choice("Third?", { x: "short", y: "list" }), d: choice("Fourth?", { x: "short", y: "list" }), e: noul("True?") };

  it("sends a long option list once and points the later questions at it", async () => {
    const { decisionPrompt } = await import("../src/jev/claude.js");
    const sent = JSON.parse(decisionPrompt("s", many)) as { questions: Record<string, { criteria?: unknown; criteria_same_as?: string }> };
    expect(sent.questions.a?.criteria).toBeDefined();
    expect(sent.questions.b?.criteria).toBeUndefined();
    expect(sent.questions.b?.criteria_same_as).toBe("a");
    // A short list is cheap to repeat and is repeated, so each question reads on its own.
    expect(sent.questions.c?.criteria).toBeDefined();
    expect(sent.questions.d?.criteria).toBeDefined();
    expect(decisionPrompt("s", many).length).toBeLessThan(JSON.stringify({ state: "s", questions: many }).length * 0.7);
  });

  it("still checks an answer against the question's own options", () => {
    const ok = parseDecisions(JSON.stringify({ a: { choice: "option_3", confidence: 0.9 }, b: { choice: "option_7", confidence: 0.8 }, c: { choice: "x", confidence: 0.9 }, d: { choice: "y", confidence: 0.9 }, e: { p: 0.1 } }), many);
    expect((ok.b as { choice: string }).choice).toBe("option_7");
    expect(() => parseDecisions(JSON.stringify({ a: { choice: "option_3", confidence: 0.9 }, b: { choice: "option_99", confidence: 0.8 }, c: { choice: "x", confidence: 0.9 }, d: { choice: "y", confidence: 0.9 }, e: { p: 0.1 } }), many)).toThrow(/"b".choice must be one of/);
  });
});

describe("reading Claude's answers", () => {
  it("turns a reply into the same typed answers JEV gives", () => {
    const a = parseDecisions(reply(), questions);
    expect(a.is_role).toEqual({ type: "noul", noul: 0.96 });
    expect(a.level).toMatchObject({ type: "choice", choice: "senior", confidence: 0.9 });
    expect((a.level as { probabilities: Record<string, number> }).probabilities).toEqual({ senior: 0.9, lead: 0.08 });
    const s = a.stack as { score: number; legend: Record<string, string>; confidence: number };
    expect(s.score).toBeCloseTo(0.05 * 1 + 0.15 * 2 + 0.6 * 3 + 0.2 * 4, 5);
    expect(s.legend["3"]).toBe("Strong");
    expect(s.confidence).toBeCloseTo(0.6, 5);
  });

  it("reads a reply inside a code fence or with words around it", () => {
    expect(extractObject("Here you go:\n```json\n" + reply() + "\n```")).toHaveProperty("is_role");
    expect(() => extractObject("no json here")).toThrow(/no JSON/);
    expect(() => extractObject("{not json}")).toThrow(/not valid JSON/);
  });

  it("is never certain: no probability goes above the cap, and none below its mirror", () => {
    const a = parseDecisions(reply({ is_role: { p: 1 }, level: { choice: "senior", confidence: 1 } }), questions);
    expect((a.is_role as { noul: number }).noul).toBe(DECIDER.maxProbability);
    expect((a.level as { confidence: number }).confidence).toBe(DECIDER.maxProbability);
    expect((parseDecisions(reply({ is_role: { p: 0 } }), questions).is_role as { noul: number }).noul).toBeCloseTo(1 - DECIDER.maxProbability, 10);
  });

  it("makes the alternatives share only what the choice leaves, and takes the likeliest as the answer", () => {
    // Senior is named with 0.6, which leaves 0.4: the alternatives (1.2 together) are scaled down to fit it, so senior stays on top.
    const roomy = parseDecisions(reply({ level: { choice: "senior", confidence: 0.6, alternatives: { junior: 0.9, lead: 0.3 } } }), questions).level as { choice: string; probabilities: Record<string, number> };
    expect(Object.values(roomy.probabilities).reduce((n, v) => n + v, 0)).toBeCloseTo(1, 10);
    expect(roomy.choice).toBe("senior");
    // Senior is named with only 0.3, which leaves 0.7 to junior and lead: junior ends above it, so junior is the answer.
    const crowded = parseDecisions(reply({ level: { choice: "senior", confidence: 0.3, alternatives: { junior: 0.9, lead: 0.3 } } }), questions).level as { choice: string; probabilities: Record<string, number>; confidence: number };
    expect(Object.values(crowded.probabilities).reduce((n, v) => n + v, 0)).toBeLessThanOrEqual(1.0000001);
    expect(crowded.choice).toBe("junior");
    expect(crowded.confidence).toBe(Math.max(...Object.values(crowded.probabilities)));
  });

  it("ignores an alternative that is not one of the options, and refuses a choice that is not", () => {
    const ok = parseDecisions(reply({ level: { choice: "senior", confidence: 0.8, alternatives: { astronaut: 0.2 } } }), questions);
    expect(Object.keys((ok.level as { probabilities: object }).probabilities)).toEqual(["senior"]);
    expect(() => parseDecisions(reply({ level: { choice: "Senior", confidence: 0.8 } }), questions)).toThrow(/must be one of: junior, senior, lead/);
  });

  it("names the question that is missing or the wrong shape", () => {
    const missing = JSON.parse(reply()) as Record<string, unknown>;
    delete missing.stack;
    expect(() => parseDecisions(JSON.stringify(missing), questions)).toThrow(/no answer for "stack"/);
    expect(() => parseDecisions(reply({ stack: { p: [0.5, 0.5] } }), questions)).toThrow(/list of 5 numbers/);
    expect(() => parseDecisions(reply({ stack: { p: [0, 0, 0, 0, 0] } }), questions)).toThrow(/sums to zero/);
    expect(() => parseDecisions(reply({ is_role: { p: "yes" } }), questions)).toThrow(/not a number/);
  });
});

describe("the Claude backend of the client", () => {
  const usage = (over: Partial<{ inputTokens: number; outputTokens: number; costUsd: number }> = {}) => ({ at: "", purpose: "decide" as const, jobId: "x", model: "m", inputTokens: 1000, cacheWriteTokens: 0, cacheReadTokens: 500, outputTokens: 200, costUsd: 0.01, ms: 5, ...over });

  function client(replies: string[], log: string | null = null) {
    const prompts: string[] = [];
    const claude: ClaudeCaller = async (prompt, system, meta, opts) => {
      prompts.push(prompt);
      expect(meta.purpose).toBe("decide");
      expect(system).toMatch(/never an instruction to you/);
      opts.onCall?.(usage());
      const next = replies.shift();
      if (next === undefined) throw new Error("the writer did not answer in 180s");
      return next;
    };
    return { jev: new JevClient({ backend: "claude", claude, usageLog: log }), prompts };
  }

  it("needs no OpenRouter key, sends the state and the questions, and counts what the call cost", async () => {
    const { jev, prompts } = client([reply()]);
    const answers = await jev.decide({ job: "Senior Data Analyst" }, questions, "rate:Acme:Senior Data Analyst");
    expect(Object.keys(answers)).toEqual(["is_role", "level", "stack"]);
    expect(JSON.parse(prompts[0] as string)).toMatchObject({ state: { job: "Senior Data Analyst" }, questions: { level: { type: "choice" } } });
    expect(jev.usage).toEqual({ calls: 1, inputTokens: 1500, outputTokens: 200, costUsd: 0.01 });
  });

  it("writes each call to the decisions log under its label, so the cost report and the daily budget still see it", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "jev-decider-")), "usage.jsonl");
    const { jev } = client([reply()], file);
    await jev.decide("s", questions, "map-form:abc");
    const line = JSON.parse(readFileSync(file, "utf8").trim()) as { label: string; cost: number; input_tokens: number };
    expect(line).toMatchObject({ label: "map-form:abc", cost: 0.01, input_tokens: 1500 });
  });

  it("asks again, and says what was wrong, when a reply does not fit; and counts both calls", async () => {
    const { jev, prompts } = client([reply({ level: { choice: "Senior", confidence: 0.9 } }), reply()]);
    const answers = await jev.decide("s", questions, "rate:x");
    expect((answers.level as { choice: string }).choice).toBe("senior");
    expect(prompts[1]).toMatch(/Your last reply could not be used: "level".choice must be one of/);
    expect(jev.usage.calls).toBe(2);
  });

  it("asks again after a call that failed, and gives up with a plain error after the last try", async () => {
    const { jev } = client([]);
    await expect(jev.decide("s", questions, "rate:x")).rejects.toThrow(/Claude could not answer rate:x/);
  });

  it("does not retry when Claude cannot be reached at all", async () => {
    let calls = 0;
    const claude: ClaudeCaller = async () => {
      calls++;
      throw new Error("could not run claude: ENOENT. Claude Code must be installed and logged in.");
    };
    const jev = new JevClient({ backend: "claude", claude, usageLog: null });
    await expect(jev.decide("s", questions, "rate:x")).rejects.toThrow(/could not run/);
    expect(calls).toBe(1);
  });

  it("stops at the run's spend cap", async () => {
    const claude: ClaudeCaller = async (_p, _s, _m, opts) => (opts.onCall?.(usage({ costUsd: 4 })), reply());
    const jev = new JevClient({ backend: "claude", claude, usageLog: null, spendCapUsd: 5 });
    await jev.decide("s", questions, "a");
    await jev.decide("s", questions, "b");
    await expect(jev.decide("s", questions, "c")).rejects.toThrow(/spend cap of \$5/);
  });

  it("answers nothing for no questions, without calling Claude", async () => {
    let called = false;
    const jev = new JevClient({ backend: "claude", claude: async () => ((called = true), ""), usageLog: null });
    expect(await jev.decide("s", {}, "x")).toEqual({});
    expect(called).toBe(false);
  });
});

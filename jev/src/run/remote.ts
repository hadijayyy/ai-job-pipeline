/**
 * A notice to the person's phone, for a tool that runs on a server. On a Mac the notice is a
 * desktop notification (`assist.ts`); a server has no screen, so a form that waits for a human
 * check, a code or a sign-in is sent to a Telegram chat instead, with the link to open by hand,
 * and the daily summary is sent when a run ends.
 *
 * Off unless both JEV_TELEGRAM_BOT_TOKEN and JEV_TELEGRAM_CHAT_ID are in the environment. The text
 * is scrubbed and holds a job's company, role and link (origin and path only), never a password,
 * a code or an email. A notice that cannot be sent is dropped without a word: help that cannot be
 * given is not an error, and the token is never printed.
 */
import { REMOTE } from "../config.js";
import { scrub } from "../util/redact.js";

type Target = { token: string; chat: string };
type Fetcher = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean }>;

/** Where notices go, or null when the person has not set it up. */
export function remoteTarget(env: NodeJS.ProcessEnv = process.env): Target | null {
  const token = env.JEV_TELEGRAM_BOT_TOKEN?.trim();
  const chat = env.JEV_TELEGRAM_CHAT_ID?.trim();
  return token && chat ? { token, chat } : null;
}

const pending = new Set<Promise<unknown>>();

/** Sends one notice. Resolves true when Telegram accepted it, false for anything else. */
export async function notifyRemote(text: string, env: NodeJS.ProcessEnv = process.env, fetcher: Fetcher = fetch as unknown as Fetcher): Promise<boolean> {
  const target = remoteTarget(env);
  if (!target) return false;
  const body = JSON.stringify({ chat_id: target.chat, text: scrub(text).slice(0, REMOTE.maxChars), disable_web_page_preview: true });
  try {
    const res = await fetcher(`${REMOTE.apiBase}/bot${target.token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(REMOTE.timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Sends a notice without making the caller wait. `flushRemote` waits for every one before the process ends. */
export function notifyRemoteLater(text: string, env: NodeJS.ProcessEnv = process.env, fetcher?: Fetcher): void {
  if (!remoteTarget(env)) return;
  const p = notifyRemote(text, env, fetcher).finally(() => pending.delete(p));
  pending.add(p);
}

export async function flushRemote(): Promise<void> {
  await Promise.allSettled([...pending]);
}

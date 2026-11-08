import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { chromeFlags, resolveChromePath } from "../src/config.js";
import { notifyRemote, notifyRemoteLater, flushRemote, remoteTarget } from "../src/run/remote.js";

const SCRIPT = path.join(__dirname, "..", "cloud", "entrypoint.sh");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A folder standing in for /app, with a `jev` that only writes down how it was called. */
function fakeHome(): { home: string; log: string } {
  const home = mkdtempSync(path.join(tmpdir(), "jev-cloud-"));
  mkdirSync(path.join(home, "bin"));
  const log = path.join(home, "calls.log");
  writeFileSync(
    path.join(home, "bin", "jev.js"),
    `const fs = require("node:fs");
const a = process.argv.slice(2).join(" ");
fs.appendFileSync(${JSON.stringify(log)}, a + "\\n");
if (a === "daily") setTimeout(() => { fs.appendFileSync(${JSON.stringify(log)}, "daily finished\\n"); }, 1500);
else process.exit(0);
`,
  );
  chmodSync(path.join(home, "bin", "jev.js"), 0o755);
  // `node bin/jev.js` must find a node that runs a .js file as CommonJS.
  return { home, log };
}

const env = (home: string, extra: Record<string, string> = {}) => ({ PATH: process.env.PATH ?? "", HOME: home, TZ: "Asia/Jakarta", JEV_HOME: home, ...extra });
const calls = (log: string) => (existsSync(log) ? readFileSync(log, "utf8").trim().split("\n") : []);
async function until(cond: () => boolean, ms = 8000) {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await sleep(50);
  expect(cond()).toBe(true);
}

describe("the cloud entrypoint", () => {
  it("says how long until the next run, and refuses a time that is not HH:MM", () => {
    const { home } = fakeHome();
    const ok = spawnSync("sh", [SCRIPT, "next"], { env: env(home, { JEV_DAILY_AT: "09:00" }), encoding: "utf8" });
    expect(ok.status).toBe(0);
    const secs = Number(ok.stdout.trim());
    expect(secs).toBeGreaterThan(0);
    expect(secs).toBeLessThanOrEqual(86_400);
    const bad = spawnSync("sh", [SCRIPT, "next"], { env: env(home, { JEV_DAILY_AT: "9am" }), encoding: "utf8" });
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/HH:MM/);
  });

  it("writes a file given as base64 once, and never over one that is already there", () => {
    const { home } = fakeHome();
    const b64 = (s: string) => Buffer.from(s).toString("base64");
    const run = (profile: string) => spawnSync("sh", [SCRIPT, "true"], { env: env(home, { JEV_PROFILE_B64: b64(profile), JEV_POLICY_B64: b64("{}") }), encoding: "utf8" });
    expect(run('{"first":true}').status).toBe(0);
    expect(readFileSync(path.join(home, "data", "profile.json"), "utf8")).toBe('{"first":true}');
    expect(readFileSync(path.join(home, "data", "policy.json"), "utf8")).toBe("{}");
    run('{"second":true}');
    expect(readFileSync(path.join(home, "data", "profile.json"), "utf8")).toBe('{"first":true}');
  });

  it("clears a lock a stopped container left on Chrome's profile", () => {
    const { home } = fakeHome();
    const dir = path.join(home, "data", "runs", "chrome-profile");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "SingletonLock"), "x");
    spawnSync("sh", [SCRIPT, "true"], { env: env(home), encoding: "utf8" });
    expect(existsSync(path.join(dir, "SingletonLock"))).toBe(false);
  });

  it("runs the checks, runs the day once on start, and waits for the next", async () => {
    const { home, log } = fakeHome();
    const child = spawn("sh", [SCRIPT], { env: env(home, { JEV_RUN_ON_START: "1" }), stdio: "ignore" });
    await until(() => calls(log).includes("daily finished"));
    expect(calls(log)[0]).toBe("doctor");
    expect(calls(log).filter((c) => c === "daily")).toHaveLength(1);
    child.kill("SIGTERM");
    await until(() => child.exitCode !== null);
    expect(child.exitCode).toBe(0);
    expect(calls(log).filter((c) => c === "daily")).toHaveLength(1);
  });

  it("asks a run that is working to stop after its application when the container is stopped", async () => {
    const { home, log } = fakeHome();
    const child = spawn("sh", [SCRIPT], { env: env(home, { JEV_RUN_ON_START: "1" }), stdio: "ignore" });
    await until(() => calls(log).includes("daily"));
    child.kill("SIGTERM");
    await until(() => child.exitCode !== null);
    expect(child.exitCode).toBe(0);
    expect(calls(log)).toContain("daily --stop");
    // It waited for the run to end instead of cutting it off.
    expect(calls(log)).toContain("daily finished");
  });
});

describe("running Chrome on a server", () => {
  it("takes the path from JEV_CHROME_PATH, else the first install found for the system", () => {
    expect(resolveChromePath({ JEV_CHROME_PATH: "/x/chrome" }, "linux", () => false)).toBe("/x/chrome");
    expect(resolveChromePath({}, "linux", (f) => f === "/usr/bin/chromium-browser")).toBe("/usr/bin/chromium-browser");
    expect(resolveChromePath({}, "linux", () => false)).toBe("/usr/bin/chromium");
    expect(resolveChromePath({}, "darwin", () => false)).toMatch(/Google Chrome/);
  });

  it("is headless on Linux with no display, headed on a Mac, and sandbox-free as root or when asked", () => {
    expect(chromeFlags({}, "linux", 1000)).toEqual(["--headless=new", "--disable-gpu", "--disable-dev-shm-usage"]);
    expect(chromeFlags({}, "linux", 0)).toContain("--no-sandbox");
    expect(chromeFlags({ DISPLAY: ":0" }, "linux", 1000)).not.toContain("--headless=new");
    expect(chromeFlags({}, "darwin", 501)).toEqual([]);
    expect(chromeFlags({ JEV_HEADLESS: "1" }, "darwin", 501)).toContain("--headless=new");
    expect(chromeFlags({ JEV_HEADLESS: "0" }, "linux", 1000)).not.toContain("--headless=new");
    expect(chromeFlags({ JEV_NO_SANDBOX: "1" }, "linux", 1000)).toContain("--no-sandbox");
    expect(chromeFlags({ JEV_NO_SANDBOX: "0" }, "linux", 0)).not.toContain("--no-sandbox");
  });
});

describe("notices to the phone", () => {
  const set = { JEV_TELEGRAM_BOT_TOKEN: "123:secret-token", JEV_TELEGRAM_CHAT_ID: "42" };

  it("is off unless both the token and the chat are set", async () => {
    expect(remoteTarget({})).toBeNull();
    expect(remoteTarget({ JEV_TELEGRAM_BOT_TOKEN: "t" })).toBeNull();
    let called = false;
    expect(await notifyRemote("hi", {}, async () => ((called = true), { ok: true }))).toBe(false);
    expect(called).toBe(false);
  });

  it("posts the text to the bot's chat, trimmed, and says whether it was accepted", async () => {
    const seen: { url: string; body: Record<string, unknown> }[] = [];
    const fetcher = async (url: string, init: { body: string }) => (seen.push({ url, body: JSON.parse(init.body) }), { ok: true });
    expect(await notifyRemote("x".repeat(9000), set, fetcher)).toBe(true);
    expect(seen[0]?.url).toBe("https://api.telegram.org/bot123:secret-token/sendMessage");
    expect(seen[0]?.body.chat_id).toBe("42");
    expect(String(seen[0]?.body.text).length).toBeLessThanOrEqual(3500);
    expect(await notifyRemote("no", set, async () => ({ ok: false }))).toBe(false);
  });

  it("drops a notice that cannot be sent, and never lets the token out in the error", async () => {
    const result = await notifyRemote("hi", set, async (url) => {
      throw new Error(`fetch failed for ${url}`);
    });
    expect(result).toBe(false);
  });

  it("sends without making the caller wait, and flush waits for every one", async () => {
    let done = 0;
    const fetcher = async () => (await sleep(30), done++, { ok: true });
    notifyRemoteLater("a", set, fetcher);
    notifyRemoteLater("b", set, fetcher);
    expect(done).toBe(0);
    await flushRemote();
    expect(done).toBe(2);
  });
});

describe("the dashboard on a server", () => {
  it("answers a request that names localhost and its port, and refuses any other host", async () => {
    const { serveReport } = await import("../src/report/server.js");
    const port = 45_000 + Math.floor(Math.random() * 2_000);
    const server = await serveReport(port, "127.0.0.1");
    try {
      const get = (host: string) => new Promise<number>((resolve, reject) => {
        const req = require("node:http").request({ host: "127.0.0.1", port, path: "/", method: "GET", headers: { host } }, (res: { statusCode: number; resume: () => void }) => { res.resume(); resolve(res.statusCode); });
        req.on("error", reject);
        req.end();
      });
      expect(await get(`localhost:${port}`)).toBe(200);
      expect(await get(`127.0.0.1:${port}`)).toBe(200);
      expect(await get("evil.example.com")).toBe(403);
      expect(await get(`203.0.113.9:${port}`)).toBe(403);
    } finally {
      await server.close();
    }
  });
});

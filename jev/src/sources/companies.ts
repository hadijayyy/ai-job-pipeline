/**
 * Company boards worth polling directly: remote-friendly companies with analytics teams, and
 * employers in Asia Pacific. Every slug here was checked against the board's own API and
 * answered. A company that moves to another board, or closes its board, simply returns nothing
 * and the run goes on; `npx jev doctor` is the place to notice a board that has gone quiet.
 * Boards that a posting links to are added on top of these at run time.
 */
import { greenhouseSlug } from "./ats/greenhouse.js";
import { leverSlug } from "./ats/lever.js";
import { ashbySlug } from "./ats/ashby.js";
import type { Job } from "../jobs/normalize.js";

export type Board = { ats: "greenhouse" | "lever" | "ashby"; slug: string; company: string };

/** Boards polled on every discover run regardless of what other sources mention. */
export const SEED_BOARDS: Board[] = [
  // Remote-friendly companies with analytics teams.
  { ats: "greenhouse", slug: "gitlab", company: "GitLab" },
  { ats: "greenhouse", slug: "stripe", company: "Stripe" },
  { ats: "greenhouse", slug: "datadog", company: "Datadog" },
  { ats: "greenhouse", slug: "elastic", company: "Elastic" },
  { ats: "greenhouse", slug: "mongodb", company: "MongoDB" },
  { ats: "greenhouse", slug: "airbnb", company: "Airbnb" },
  { ats: "greenhouse", slug: "figma", company: "Figma" },
  { ats: "greenhouse", slug: "cloudflare", company: "Cloudflare" },
  { ats: "greenhouse", slug: "coinbase", company: "Coinbase" },
  { ats: "greenhouse", slug: "databricks", company: "Databricks" },
  { ats: "greenhouse", slug: "reddit", company: "Reddit" },
  { ats: "greenhouse", slug: "pinterest", company: "Pinterest" },
  { ats: "greenhouse", slug: "asana", company: "Asana" },
  { ats: "greenhouse", slug: "instacart", company: "Instacart" },
  { ats: "greenhouse", slug: "samsara", company: "Samsara" },
  { ats: "greenhouse", slug: "anthropic", company: "Anthropic" },
  { ats: "greenhouse", slug: "canonical", company: "Canonical" },
  { ats: "greenhouse", slug: "wikimedia", company: "Wikimedia Foundation" },
  { ats: "greenhouse", slug: "twilio", company: "Twilio" },
  // Asia Pacific employers and companies that hire across the region.
  { ats: "greenhouse", slug: "thunes", company: "Thunes" },
  { ats: "greenhouse", slug: "xendit", company: "Xendit" },
  { ats: "lever", slug: "spotify", company: "Spotify" },
  { ats: "lever", slug: "crypto", company: "Crypto.com" },
  { ats: "lever", slug: "palantir", company: "Palantir" },
  { ats: "lever", slug: "nium", company: "Nium" },
  { ats: "ashby", slug: "openai", company: "OpenAI" },
  { ats: "ashby", slug: "cohere", company: "Cohere" },
  { ats: "ashby", slug: "supabase", company: "Supabase" },
  { ats: "ashby", slug: "notion", company: "Notion" },
  { ats: "ashby", slug: "ramp", company: "Ramp" },
  { ats: "ashby", slug: "airwallex", company: "Airwallex" },
  { ats: "ashby", slug: "zapier", company: "Zapier" },
];

/** Every board the given jobs point at, merged with the seed list, deduped by ats+slug. */
export function boardsFromJobs(jobs: Job[], seeds: Board[] = SEED_BOARDS): Board[] {
  const map = new Map<string, Board>();
  for (const b of seeds) map.set(`${b.ats}:${b.slug.toLowerCase()}`, b);
  for (const j of jobs) {
    let b: Board | null = null;
    if (j.ats === "greenhouse") {
      const s = greenhouseSlug(j.url);
      if (s) b = { ats: "greenhouse", slug: s, company: j.company };
    } else if (j.ats === "lever") {
      const s = leverSlug(j.url);
      if (s) b = { ats: "lever", slug: s, company: j.company };
    } else if (j.ats === "ashby") {
      const s = ashbySlug(j.url);
      if (s) b = { ats: "ashby", slug: s, company: j.company };
    }
    if (b && !map.has(`${b.ats}:${b.slug.toLowerCase()}`)) map.set(`${b.ats}:${b.slug.toLowerCase()}`, b);
  }
  return [...map.values()];
}

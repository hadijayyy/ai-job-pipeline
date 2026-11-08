/**
 * The fit rating. One JEV call per job with every question the pipeline
 * might need (speculative fan-out). Code turns the typed answers into a
 * composite score, hard skips, and human-readable reasons.
 */
import { FIT_WEIGHTS, HOME, LOCATION_MULTIPLIER, RECENCY_FLOOR, DISCOVER } from "../config.js";
import type { JevClient } from "../jev/client.js";
import { choice, noul, score, scoreToUnit } from "../jev/questions.js";
import type { Answer, ChoiceAnswer, NoulAnswer, Questions, ScoreAnswer } from "../jev/types.js";
import { usStatus, type Profile } from "../profile/schema.js";
import { locationTier, type LocationTier } from "./hardFilters.js";
import { ageDays, type Job } from "./normalize.js";
import { hashOf, type KeyedCache } from "../util/cache.js";

const LEVELS5 = ["None", "Weak", "Partial", "Strong", "Near exact"];

/** Every question for one posting. They are the same for every candidate; the candidate's side goes in the state. */
export function fitQuestions(_profile?: Pick<Profile, "education">): Questions {
  return FIT_QUESTIONS;
}

export const FIT_QUESTIONS: Questions = {
  is_target_role: noul("Is this a data analyst, analytics, business intelligence, analytics engineering, revenue or product analytics, or data science role (analysing data, building reports and dashboards, writing SQL or Python, answering business questions with data)?", {
    true: "The day-to-day work is analysing data and turning it into reports, models or recommendations",
    false: "Pure software or data engineering, sales, marketing, finance, operations, support, or anything else",
  }),
  level: choice("What level is this posting?", {
    junior: "Internship, trainee, graduate, entry level, or junior with 0 to 2 years",
    mid: "Mid level, 2 to 4 years of experience",
    senior: "Senior, or 4 to 8 years of professional experience",
    lead_manager: "Lead, staff, principal, manager, head or director",
    other: "Unclear or not a job posting",
  }),
  is_unpaid: noul("Does the posting say the role is unpaid, volunteer, or for academic credit only?"),
  needs_advanced_degree: noul("Does the posting require (not merely prefer) a Master's degree or PhD?"),
  work_auth: choice("What does the posting require for work authorization or residence?", {
    remote_global: "Remote and open to candidates in any country, or hiring through an employer of record",
    home_ok: `The role is in ${HOME.country}, or open to candidates living there with no other restriction`,
    apac_ok: "Open to candidates in Asia Pacific, or the role is in an Asia Pacific country and the posting offers sponsorship or relocation",
    other_country_required: `Residence or the right to work in a specific country other than ${HOME.country} is required, with no sponsorship`,
    us_no_sponsorship: "The role is in the United States and the posting says no sponsorship, or must be authorized without sponsorship",
    us_citizenship_required: "US citizenship, a security clearance, or ITAR eligibility is required",
    unclear: "Not stated and not inferable",
  }),
  stack_match: score("How well do the candidate's tools and skills (SQL, Python, BI and warehouse tools, statistics) match what the posting asks for?", LEVELS5),
  experience_match: score("How well does the candidate's experience level, industry and background match what the posting asks for?", LEVELS5),
  location_tier: choice("Where is the role?", {
    home: `In ${HOME.country}`,
    apac: "In Asia Pacific outside Indonesia, or remote within Asia Pacific",
    remote: "Remote, open to candidates anywhere, or not restricted to one country",
    us: "In the United States, or remote restricted to the United States",
    international: "In another country, or remote restricted to another country",
    unclear: "Not stated",
  }),
  timezone_fit: choice("How well do the required working hours fit a candidate in Western Indonesia (UTC+7) who can overlap with UTC-8 to UTC+3?", {
    good: "No set hours, asynchronous, or hours that overlap UTC-8 to UTC+3 or Asia Pacific",
    partial: "Some overlap needed with a time zone that is a stretch (for example US Eastern mornings)",
    poor: "Fixed hours in a time zone with almost no overlap",
    unclear: "Not stated",
  }),
  interview_practical: noul("Does the posting describe a practical interview process (case study, take-home, SQL exercise, project review) rather than algorithm puzzles?"),
  callback_likelihood: score("Given everything, how likely is this candidate to be invited to interview if they apply?", [
    "Very unlikely", "Unlikely", "Possible", "Likely", "Very likely",
  ]),
  needs_account: noul("Does applying require creating an account or logging in on the company's own careers portal (as opposed to a single form)?"),
  requires_references: noul("Does the posting say references are required with the application?"),
};

export type FitResult = {
  score: number;
  decision: "apply" | "below_threshold" | "skip";
  skipReason: string | null;
  reasons: string[];
  components: Record<string, number>;
  locationTier: LocationTier;
  answers: Record<string, Answer>;
};

export function buildFitState(job: Job, profile: Profile, now = new Date()): Record<string, unknown> {
  const age = ageDays(job, now);
  return {
    job: {
      company: job.company,
      title: job.title,
      locations: job.locations,
      posted_days_ago: age,
      sponsorship_flag_from_source: job.sponsorship,
      description: job.description || "(no description available; judge from the title and company)",
    },
    candidate: {
      summary: profile.summary,
      skills: profile.skills,
      facts: profile.facts,
      years_of_experience: profile.preferences.yearsOfExperience ?? "not given",
      home_country: HOME.country,
      timezone: profile.preferences.timezone ?? "not given",
      citizenship: profile.workAuthorization.citizenships,
      authorized_to_work_in: profile.workAuthorization.authorizedCountries,
      preferred_locations: profile.preferences.preferredLocations,
    },
  };
}

/**
 * What a rating depends on: the posting as JEV sees it, the candidate, and the questions. The
 * posting's age is left out. It changes every day, it is not what the questions are about, and
 * the score takes it from the date, not from JEV.
 */
export function ratingKey(job: Job, profile: Profile): string {
  const state = buildFitState(job, profile, new Date(0)) as { job: Record<string, unknown>; candidate: unknown };
  const { posted_days_ago: _age, ...posting } = state.job;
  return hashOf({ id: job.id, posting, candidate: state.candidate, questions: fitQuestions(profile) });
}

/** Rates a posting. With a cache, an unchanged posting gets the answers JEV gave before, and the score is worked out afresh for today. */
export async function rateJob(jev: JevClient, job: Job, profile: Profile, now = new Date(), cache?: KeyedCache<Record<string, Answer>>): Promise<FitResult> {
  const key = cache ? ratingKey(job, profile) : "";
  let answers = cache?.get(key);
  if (!answers) {
    answers = await jev.decide(buildFitState(job, profile, now), fitQuestions(profile), `rate:${job.company}:${job.title}`);
    cache?.set(key, answers);
  }
  return scoreFromAnswers(job, answers, now, usStatus(profile));
}

export function scoreFromAnswers(job: Job, answers: Record<string, Answer>, now = new Date(), us: { authorized: boolean; citizen: boolean } = { authorized: false, citizen: false }): FitResult {
  // A rating saved before a question existed simply lacks it; that reads as "no".
  const n = (k: string) => (answers[k] as NoulAnswer | undefined)?.noul ?? 0;
  const c = (k: string) => answers[k] as ChoiceAnswer;
  const s = (k: string) => answers[k] as ScoreAnswer;
  const reasons: string[] = [];

  const codeTier = locationTier(job.locations);
  const tier: LocationTier = codeTier !== "unclear" ? codeTier : (c("location_tier").choice as LocationTier);

  let skipReason: string | null = null;
  if (n("is_target_role") < 0.5) skipReason = "not a data or analytics role";
  else if (c("level").choice === "junior" && c("level").confidence >= 0.6) skipReason = "entry level, below the candidate's seniority";
  else if (n("is_unpaid") > 0.7) skipReason = "unpaid";
  else if (n("needs_advanced_degree") > 0.7) skipReason = "advanced degree required";
  else if (c("work_auth").choice === "us_no_sponsorship" && c("work_auth").confidence >= 0.5 && !us.authorized) skipReason = "US role, no sponsorship";
  else if (c("work_auth").choice === "us_citizenship_required" && c("work_auth").confidence >= 0.5 && !us.citizen) skipReason = "US citizenship or clearance required";
  else if (c("work_auth").choice === "other_country_required" && c("work_auth").confidence >= 0.6) skipReason = "requires the right to work in another country";
  else if (job.ats === "other" && n("needs_account") > 0.9) skipReason = "needs an account to apply";
  else if (n("requires_references") > 0.85) skipReason = "references required";

  const levelFit = { senior: 1, mid: 0.8, lead_manager: 0.5, junior: 0.1, other: 0.4 }[c("level").choice] ?? 0.4;
  const timezoneFit = { good: 1, partial: 0.6, poor: 0.1, unclear: 0.7 }[c("timezone_fit")?.choice] ?? 0.7;
  const components = {
    stackMatch: scoreToUnit(s("stack_match").score, LEVELS5.length),
    experienceMatch: scoreToUnit(s("experience_match").score, LEVELS5.length),
    callbackLikelihood: scoreToUnit(s("callback_likelihood").score, 5),
    levelFit,
    timezoneFit,
    interviewPractical: n("interview_practical"),
  };
  let base = 0;
  for (const [k, w] of Object.entries(FIT_WEIGHTS)) base += w * (components[k as keyof typeof components] ?? 0);
  const age = ageDays(job, now);
  const recency = age === null ? 0.85 : 1 - (1 - RECENCY_FLOOR) * Math.min(1, age / DISCOVER.maxAgeDays);
  const scoreValue = Math.round(base * LOCATION_MULTIPLIER[tier] * recency * 1000) / 1000;

  if (c("work_auth").choice === "unclear" && tier === "us" && !us.authorized) reasons.push("US role, sponsorship not stated");
  if (c("level").choice === "lead_manager") reasons.push("lead or manager level, above a senior analyst");
  if (c("timezone_fit")?.choice === "poor") reasons.push("working hours barely overlap");
  if (n("interview_practical") > 0.6) reasons.push("practical interview process");
  reasons.push(`stack ${LEVELS5[Math.round(s("stack_match").score)] ?? ""}`.toLowerCase());
  reasons.push(`callback ${s("callback_likelihood").legend[String(Math.round(s("callback_likelihood").score))] ?? ""}`.toLowerCase());

  const decision: FitResult["decision"] = skipReason ? "skip" : scoreValue >= DISCOVER.applyThreshold ? "apply" : "below_threshold";
  return { score: scoreValue, decision, skipReason, reasons, components, locationTier: tier, answers };
}

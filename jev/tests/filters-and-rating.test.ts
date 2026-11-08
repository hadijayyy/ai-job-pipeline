import { describe, expect, it } from "vitest";
import { DISCOVER } from "../src/config.js";
import { countryOfLocations, locationTier, preFilter } from "../src/jobs/hardFilters.js";
import type { Job } from "../src/jobs/normalize.js";
import { FIT_QUESTIONS, fitQuestions, scoreFromAnswers } from "../src/jobs/rate.js";
import { usStatus } from "../src/profile/schema.js";
import type { Answer } from "../src/jev/types.js";

const now = new Date("2026-10-02T12:00:00Z");
const job = (over: Partial<Job> = {}): Job => ({
  id: "j", source: "t", company: "Acme", title: "Senior Data Analyst", url: "https://job-boards.greenhouse.io/acme/jobs/1", ats: "greenhouse",
  locations: ["Remote - Worldwide"], postedAt: "2026-10-01", terms: [], sponsorship: "unknown", degrees: [], category: null, ...over,
});

describe("locationTier", () => {
  it.each([
    [["Jakarta, Indonesia"], "home"],
    [["Remote - Indonesia"], "home"],
    [["Bali"], "home"],
    [["Singapore"], "apac"],
    [["Remote - APAC"], "apac"],
    [["Sydney, Australia"], "apac"],
    [["Remote"], "remote"],
    [["Worldwide"], "remote"],
    [["Remote in USA"], "us"],
    [["SF"], "us"],
    [["NYC"], "us"],
    [["Palo Alto, CA"], "us"],
    [["San Francisco, CA", "Remote"], "us"],
    [["Berlin", "Remote"], "international"],
    [["San Francisco, CA", "Remote - Worldwide"], "remote"],
    [["Singapore", "Remote"], "apac"],
    [["London, UK"], "international"],
    [["Remote - Germany"], "international"],
    [["Toronto, ON"], "international"],
    [["Berlin", "Jakarta"], "home"],
    [[], "unclear"],
  ])("%j → %s", (locs, tier) => {
    expect(locationTier(locs)).toBe(tier);
  });
  it("reads two-letter state codes only when they are upper case", () => {
    expect(countryOfLocations(["Remote, in a team of ten"])).toBeNull();
    expect(countryOfLocations(["Austin, TX"])).toBe("United States");
    expect(countryOfLocations(["Toronto, ON"])).toBe("Canada");
    expect(countryOfLocations(["Jakarta Selatan"])).toBe("Indonesia");
    expect(countryOfLocations(["KOHO (CAN), Remote"])).toBe("Canada");
  });
});

describe("preFilter", () => {
  it("passes a fresh remote senior data analyst role", () => {
    expect(preFilter(job(), now)).toBeNull();
  });
  it("rejects account-walled ATSs", () => {
    expect(preFilter(job({ ats: "workday" }), now)).toMatch(/workday/);
    expect(preFilter(job({ ats: "icims" }), now)).toMatch(/account/);
    expect(preFilter(job({ ats: "amazon" }), now)).toMatch(/account/);
  });
  it("rejects stale postings but keeps undated ones", () => {
    expect(preFilter(job({ postedAt: "2026-08-01" }), now)).toMatch(/days ago/);
    expect(preFilter(job({ postedAt: null }), now)).toBeNull();
  });
  it("keeps the roles the search is for and drops the rest", () => {
    for (const title of ["Data Analyst", "Senior Data Analyst, Growth", "Analytics Engineer", "Business Intelligence Analyst", "BI Developer", "Revenue Analyst", "Data Scientist, Product", "Product Analyst"]) {
      expect(preFilter(job({ title }), now), title).toBeNull();
    }
    for (const title of ["Software Engineer", "Data Engineer", "Account Executive", "Machine Learning Engineer", "Financial Analyst"]) {
      expect(preFilter(job({ title }), now), title).toMatch(/not a data or analytics role/);
    }
  });
  it("drops levels the candidate is past or far above", () => {
    for (const title of ["Data Analyst Intern", "Junior Data Analyst", "Graduate Data Analyst", "Director of Analytics", "Head of Data Analytics", "Principal Data Scientist"]) {
      expect(preFilter(job({ title }), now), title).toMatch(/level does not fit/);
    }
    expect(preFilter(job({ title: "Staff Data Analyst" }), now)).toBeNull();
    expect(preFilter(job({ title: "Analytics Manager" }), now)).toBeNull();
  });
  it("rejects US roles with no sponsorship or citizenship flags, but not roles elsewhere", () => {
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "none" }), now)).toMatch(/no sponsorship/);
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "citizenship" }), now)).toMatch(/citizenship/);
    // A candidate who may work in the United States is not ruled out by "no sponsorship"; only a citizen passes a citizenship flag.
    const resident = { authorized: true, citizen: false };
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "none" }), now, () => false, resident)).toBeNull();
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "citizenship" }), now, () => false, resident)).toMatch(/citizenship/);
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "citizenship" }), now, () => false, { authorized: true, citizen: true })).toBeNull();
    expect(preFilter(job({ locations: ["Austin, TX"], sponsorship: "unknown" }), now)).toBeNull();
    expect(preFilter(job({ locations: ["Jakarta"], sponsorship: "none" }), now)).toBeNull();
  });
  it("rejects advanced-degree-only, French and unpaid postings", () => {
    expect(preFilter(job({ degrees: ["Master's", "PhD"] }), now)).toMatch(/advanced degree/);
    expect(preFilter(job({ degrees: ["Bachelor's", "Master's"] }), now)).toBeNull();
    expect(preFilter(job({ title: "Stagiaire Data Analyst" }), now)).toMatch(/non-English|level/);
    expect(preFilter(job({ title: "Unpaid Data Analyst" }), now)).toMatch(/unpaid/);
  });
});

function answers(over: Record<string, Partial<Answer>> = {}): Record<string, Answer> {
  const base: Record<string, Answer> = {
    is_target_role: { type: "noul", noul: 0.98 },
    level: { type: "choice", choice: "senior", probabilities: { senior: 1 }, confidence: 1 },
    is_unpaid: { type: "noul", noul: 0.02 },
    needs_advanced_degree: { type: "noul", noul: 0.02 },
    work_auth: { type: "choice", choice: "remote_global", probabilities: { remote_global: 1 }, confidence: 1 },
    stack_match: { type: "score", score: 3, legend: {}, probabilities: {}, confidence: 0.8 },
    experience_match: { type: "score", score: 3, legend: {}, probabilities: {}, confidence: 0.8 },
    location_tier: { type: "choice", choice: "remote", probabilities: {}, confidence: 1 },
    timezone_fit: { type: "choice", choice: "good", probabilities: { good: 1 }, confidence: 1 },
    interview_practical: { type: "noul", noul: 0.3 },
    callback_likelihood: { type: "score", score: 3, legend: { "3": "Likely" }, probabilities: {}, confidence: 0.7 },
    needs_account: { type: "noul", noul: 0.1 },
    requires_references: { type: "noul", noul: 0.05 },
  };
  for (const [k, v] of Object.entries(over)) base[k] = { ...(base[k] as Answer), ...v } as Answer;
  return base;
}

describe("scoreFromAnswers", () => {
  it("asks every question the scorer reads", () => {
    for (const k of Object.keys(answers())) expect(FIT_QUESTIONS).toHaveProperty(k);
    expect(fitQuestions()).toBe(FIT_QUESTIONS);
  });
  it("queues a strong, fresh, remote senior role", () => {
    const fit = scoreFromAnswers(job(), answers(), now);
    expect(fit.decision).toBe("apply");
    expect(fit.score).toBeGreaterThan(DISCOVER.applyThreshold);
    expect(fit.locationTier).toBe("remote");
  });
  it("ranks home and remote above the US, senior above mid, good hours above poor, and fresh above stale", () => {
    const remote = scoreFromAnswers(job(), answers(), now).score;
    const home = scoreFromAnswers(job({ locations: ["Jakarta"] }), answers(), now).score;
    const us = scoreFromAnswers(job({ locations: ["Austin, TX"] }), answers({ work_auth: { choice: "us_sponsors" } }), now).score;
    const mid = scoreFromAnswers(job(), answers({ level: { choice: "mid" } }), now).score;
    const poorHours = scoreFromAnswers(job(), answers({ timezone_fit: { choice: "poor" } }), now).score;
    const stale = scoreFromAnswers(job({ postedAt: "2026-09-12" }), answers(), now).score;
    expect(home).toBeGreaterThanOrEqual(remote);
    expect(remote).toBeGreaterThan(us);
    expect(remote).toBeGreaterThan(mid);
    expect(remote).toBeGreaterThan(poorHours);
    expect(remote).toBeGreaterThan(stale);
  });
  it("skips on the hard rules regardless of score", () => {
    expect(scoreFromAnswers(job(), answers({ is_target_role: { noul: 0.2 } }), now).skipReason).toBe("not a data or analytics role");
    expect(scoreFromAnswers(job(), answers({ level: { choice: "junior", confidence: 0.9 } }), now).skipReason).toMatch(/entry level/);
    expect(scoreFromAnswers(job(), answers({ level: { choice: "lead_manager", confidence: 0.9 } }), now).skipReason).toBeNull();
    expect(scoreFromAnswers(job(), answers({ is_unpaid: { noul: 0.9 } }), now).skipReason).toBe("unpaid");
    expect(scoreFromAnswers(job(), answers({ needs_advanced_degree: { noul: 0.9 } }), now).skipReason).toMatch(/degree/);
    expect(scoreFromAnswers(job({ locations: ["SF"] }), answers({ work_auth: { choice: "us_no_sponsorship", confidence: 0.8 } }), now).skipReason).toMatch(/no sponsorship/);
    expect(scoreFromAnswers(job({ locations: ["SF"] }), answers({ work_auth: { choice: "us_citizenship_required", confidence: 0.8 } }), now).skipReason).toMatch(/citizenship/);
    expect(scoreFromAnswers(job({ locations: ["SF"] }), answers({ work_auth: { choice: "us_no_sponsorship", confidence: 0.8 } }), now, { authorized: true, citizen: false }).skipReason).toBeNull();
    expect(scoreFromAnswers(job({ locations: ["SF"] }), answers({ work_auth: { choice: "us_citizenship_required", confidence: 0.8 } }), now, { authorized: true, citizen: true }).skipReason).toBeNull();
    expect(scoreFromAnswers(job(), answers({ work_auth: { choice: "other_country_required", confidence: 0.8 } }), now).skipReason).toMatch(/another country/);
    expect(scoreFromAnswers(job(), answers({ work_auth: { choice: "other_country_required", confidence: 0.3 } }), now).skipReason).toBeNull();
    expect(scoreFromAnswers(job(), answers({ requires_references: { noul: 0.95 } }), now).skipReason).toMatch(/references/);
  });
  it("only trusts the account signal when the ATS is unknown", () => {
    expect(scoreFromAnswers(job({ ats: "greenhouse" }), answers({ needs_account: { noul: 0.95 } }), now).skipReason).toBeNull();
    expect(scoreFromAnswers(job({ ats: "other" }), answers({ needs_account: { noul: 0.95 } }), now).skipReason).toMatch(/account/);
  });
  it("uses JEV's location only when the code cannot tell", () => {
    const fit = scoreFromAnswers(job({ locations: [] }), answers({ location_tier: { choice: "apac" } }), now);
    expect(fit.locationTier).toBe("apac");
  });
  it("reads a rating saved before the hours question existed as unclear, not poor", () => {
    const old = answers();
    delete old.timezone_fit;
    const fit = scoreFromAnswers(job(), old, now);
    expect(fit.decision).toBe("apply");
    expect(fit.reasons).not.toContain("working hours barely overlap");
  });
});

describe("account walls", () => {
  it("skips careers sites that need an account and boards whose forms cannot be read", () => {
    expect(preFilter(job({ url: "https://acme.eightfold.ai/careers/job/1", ats: "other" }), now, () => true)).toMatch(/account/);
    // An older posting passes when one search asks for more days.
    const old = job({ postedAt: new Date(now.getTime() - DISCOVER.maxAgeDays * 86_400_000 - 5 * 86_400_000).toISOString().slice(0, 10) });
    expect(preFilter(old, now, () => false)).toMatch(/posted \d+ days ago/);
    expect(preFilter(old, now, () => false, { authorized: false, citizen: false }, 90)).toBeNull();
    // Jobvite's forms run over several pages, which the runner walks. SmartRecruiters' cannot be read yet.
    expect(preFilter(job({ ats: "jobvite" }), now, () => false)).toBeNull();
    expect(preFilter(job({ ats: "smartrecruiters" }), now, () => false)).toMatch(/cannot be read/);
    expect(preFilter(job(), now, () => false)).toBeNull();
  });
});

describe("usStatus", () => {
  const wa = (authorizedCountries: string[], citizenships: string[]) => ({ workAuthorization: { citizenships, authorizedCountries, requiresSponsorshipElsewhere: true, statement: "" } });
  it("reads the candidate's standing in the United States from the profile, however the country is written", () => {
    expect(usStatus(wa(["Canada"], ["Canada"]))).toEqual({ authorized: false, citizen: false });
    expect(usStatus(wa(["United States"], ["India"]))).toEqual({ authorized: true, citizen: false });
    expect(usStatus(wa(["USA", "Canada"], ["U.S."]))).toEqual({ authorized: true, citizen: true });
  });
});


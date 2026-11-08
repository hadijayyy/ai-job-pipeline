/**
 * Pure-code filters that run before JEV so the model never sees a job we
 * would refuse anyway. Each returns a reason string or null. The reasons
 * end up in the CSV so a skipped job is explainable.
 */
import { DISCOVER, HOME, SEARCH } from "../config.js";
import { ageDays, type Job } from "./normalize.js";
import { isWalled } from "./walled.js";

const FRENCH_TITLE = /\b(stagiaire|développeur|developpeur|ingénieur|ingenieur|stage\b|alternance|poste)\b/i;

const US_STATE = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/;
const US_CITY = /united states|\bUSA?\b|\bSF\b|\bNYC\b|\bLA\b|new york|san francisco|south san francisco|seattle|austin|boston|chicago|los angeles|bay area|palo alto|menlo park|mountain view|sunnyvale|san jose|redwood city|san mateo|santa clara|cupertino|oakland|berkeley|denver|atlanta|dallas|houston|miami|washington|arlington|bellevue|redmond|kirkland|portland|phoenix|philadelphia|pittsburgh|detroit|minneapolis|salt lake|las vegas|san diego|irvine|raleigh|durham|charlotte|nashville|columbus|cambridge, ma|jersey city|brooklyn|manhattan/i;
/** Province codes are upper case on purpose: "on" and "pe" are words. */
const CA_CODE = /\b(AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/;
const CA_WORDS = /\bCanada\b|Toronto|Vancouver|Montreal|Montréal|Calgary|Edmonton|Ottawa|Waterloo|Kitchener|Victoria|Winnipeg|Halifax|Québec|Quebec|Mississauga|Burnaby|Markham/i;

/** Countries other than the United States and Canada that postings name. Checked in this order, before the US pattern, whose two-letter state codes can match inside other places. */
type Matcher = { test(text: string): boolean };
const COUNTRIES: Array<[string, Matcher]> = [
  ["Indonesia", HOME.pattern],
  ["Singapore", /singapore/i],
  ["Malaysia", /malaysia|kuala lumpur/i],
  ["Philippines", /philippines|manila|makati|cebu/i],
  ["Thailand", /thailand|bangkok/i],
  ["Vietnam", /vietnam|ho chi minh|hanoi/i],
  ["Australia", /australia|sydney|melbourne|brisbane|perth/i],
  ["New Zealand", /new zealand|auckland|wellington/i],
  ["India", /\bindia\b|bangalore|bengaluru|mumbai|new delhi|delhi|hyderabad|pune|chennai|gurgaon|gurugram|noida/i],
  ["Japan", /japan|tokyo|osaka/i],
  ["South Korea", /south korea|korea|seoul/i],
  ["Hong Kong", /hong kong/i],
  ["Taiwan", /taiwan|taipei/i],
  ["China", /\bchina\b|shanghai|beijing|shenzhen/i],
  ["United Kingdom", /united kingdom|\bUK\b|england|scotland|london|manchester|edinburgh|cambridge, uk/i],
  ["Ireland", /ireland|dublin/i],
  ["Germany", /germany|berlin|munich|münchen|hamburg|frankfurt|cologne/i],
  ["France", /\bfrance\b|paris|lyon/i],
  ["Netherlands", /netherlands|amsterdam|rotterdam|utrecht/i],
  ["Spain", /\bspain\b|madrid|barcelona/i],
  ["Portugal", /portugal|lisbon|porto/i],
  ["Poland", /poland|warsaw|krakow|kraków/i],
  ["Sweden", /sweden|stockholm/i],
  ["Switzerland", /switzerland|zurich|zürich|geneva/i],
  ["Israel", /israel|tel aviv/i],
  ["United Arab Emirates", /united arab emirates|\bUAE\b|dubai|abu dhabi/i],
  ["Brazil", /brazil|brasil|são paulo|sao paulo/i],
  ["Mexico", /mexico|méxico/i],
  ["Canada", { test: (t) => CA_CODE.test(t) || CA_WORDS.test(t) }],
  ["United States", { test: (t) => US_STATE.test(t) || US_CITY.test(t) }],
];

/** Countries close enough to the candidate's time zone to rank above the rest of the world. */
const APAC = new Set(["Singapore", "Malaysia", "Philippines", "Thailand", "Vietnam", "Australia", "New Zealand", "India", "Japan", "South Korea", "Hong Kong", "Taiwan", "China"]);
const APAC_WORDS = /\bapac\b|asia[- ]pacific|southeast asia|\bsea\b|\basia\b/i;
const OPEN_REMOTE = /\b(worldwide|anywhere|global|any ?where in the world|international)\b/i;

export type LocationTier = "home" | "apac" | "remote" | "us" | "international" | "unclear";

const TIER_RANK: Record<LocationTier, number> = { home: 0, remote: 1, apac: 2, international: 3, us: 4, unclear: 5 };

/** The country one location string names, when it names one. "San Francisco, Remote" is the United States, "KOHO (CAN), Remote" is Canada. */
function countryOfOne(location: string): string | null {
  if (/\bCAN\b/.test(location)) return "Canada";
  for (const [name, pattern] of COUNTRIES) if (pattern.test(location)) return name;
  return null;
}

/** The country a posting's locations name, when one of them does. The first location that names a country wins. */
export function countryOfLocations(locations: string[]): string | null {
  for (const l of locations) {
    const c = countryOfOne(l);
    if (c) return c;
  }
  return countryOfOne(locations.join(" | "));
}

function tierOfOne(location: string): LocationTier {
  if (location.trim() === "") return "unclear";
  const country = countryOfOne(location);
  if (country === HOME.country) return "home";
  if (country && APAC.has(country)) return "apac";
  if (country === "United States") return "us";
  if (country) return "international";
  if (APAC_WORDS.test(location)) return "apac";
  if (OPEN_REMOTE.test(location) || /remote/i.test(location)) return "remote";
  return "international";
}

/**
 * The best tier among a posting's locations: a role listed in several places counts for the place
 * that suits the candidate most. One exception: a bare "Remote" listed next to cities in a country
 * ("San Francisco; Remote") is remote within that country, not open to the world, unless some
 * location says worldwide, anywhere or global.
 */
export function locationTier(locations: string[]): LocationTier {
  const places = locations.filter((l) => l.trim() !== "");
  if (!places.length) return "unclear";
  const isBareRemote = (l: string) => /remote/i.test(l) && !countryOfOne(l) && !OPEN_REMOTE.test(l) && !APAC_WORDS.test(l);
  const bare = places.filter(isBareRemote);
  const openWorld = places.some((l) => OPEN_REMOTE.test(l));
  const rest = bare.length && !openWorld ? places.filter((l) => !isBareRemote(l)) : places;
  const named = rest.length ? rest : places;
  return named.map(tierOfOne).reduce((best, t) => (TIER_RANK[t] < TIER_RANK[best] ? t : best));
}

/** us: the candidate's standing in the United States. A candidate who may work there is not ruled out by "no sponsorship". */
export function preFilter(
  job: Job,
  now = new Date(),
  walled: (url: string) => boolean = isWalled,
  us: { authorized: boolean; citizen: boolean } = { authorized: false, citizen: false },
  maxAgeDays: number = DISCOVER.maxAgeDays,
  /** True for a job on an account board where the person has an account, or let the tool make one. */
  mayApplyWithAccount: (url: string) => boolean = () => false,
): string | null {
  if (job.ats === "workday" && !mayApplyWithAccount(job.url)) return "workday (needs an account per company)";
  if (job.ats === "taleo" || job.ats === "oracle" || job.ats === "successfactors" || job.ats === "icims" || job.ats === "amazon") {
    return `${job.ats} (needs an account)`;
  }
  if (walled(job.url)) return "careers site needs an account";
  if ((DISCOVER.unreadableAts as readonly string[]).includes(job.ats)) return `${job.ats} (its form cannot be read yet)`;
  const age = ageDays(job, now);
  if (age !== null && age > maxAgeDays) return `posted ${age} days ago`;
  if (!SEARCH.titleInclude.test(job.title)) return "title is not a data or analytics role";
  if (SEARCH.titleExclude.test(job.title)) return "level does not fit (intern, junior or executive)";
  if (FRENCH_TITLE.test(job.title)) return "non-English posting";
  if (job.degrees.length && !job.degrees.some((d) => /bachelor|associate|bootcamp|certificate/i.test(d))) {
    return "advanced degree required";
  }
  const tier = locationTier(job.locations);
  if (tier === "us" && job.sponsorship === "none" && !us.authorized) return "US role, no sponsorship";
  if (tier === "us" && job.sponsorship === "citizenship" && !us.citizen) return "US citizenship required";
  if (/\bunpaid\b|volunteer/i.test(job.title)) return "unpaid";
  return null;
}

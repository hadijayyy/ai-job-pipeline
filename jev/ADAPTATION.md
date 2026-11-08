# Adaptation for a data analyst search

This folder is a copy of [qbeka/jev-job-search](https://github.com/qbeka/jev-job-search)
(MIT, see `LICENSE`), taken at commit `3e3c9db`. The upstream tool is built for
software internships and new-grad roles in Canada and the United States. This
copy is changed to look for senior data and analytics roles from Jakarta,
remote or in Asia Pacific. The form filling, verification and safety rules are
unchanged. See `docs/SAFETY.md`.

## What changed

| Area | Upstream | This copy | Where |
|---|---|---|---|
| Job sources | SimplifyJobs and other student GitHub lists, plus company boards | Company boards only. 32 Greenhouse, Lever and Ashby boards, each checked against the board's API. The GitHub lists are off (`DISCOVER.useGithubLists`) | `src/sources/companies.ts`, `src/discover.ts`, `src/config.ts` |
| Title filter | Keeps software titles | Keeps data and analytics titles, drops intern, junior and executive titles | `SEARCH` in `src/config.ts`, `src/jobs/hardFilters.ts` |
| Location | vancouver, canada, remote, us, international | home (Indonesia), apac, remote, us, international. A bare "Remote" next to cities in one country counts as remote in that country | `HOME` and `LOCATION_MULTIPLIER` in `src/config.ts`, `locationTier` |
| Countries | Canada and United States | About 30 countries are recognised, so the right-to-work answer on a form follows the posting's country | `countryOfLocations`, `src/forms/mapForm.ts` |
| Rating questions | Software role, student level, term, graduation window | Data role, seniority (junior to lead), country restriction, working hours against UTC+7 | `src/jobs/rate.ts` |
| Score weights | `termFit` 0.10 | `timezoneFit` 0.10 | `FIT_WEIGHTS` |
| Freshness | 14 days | 30 days | `DISCOVER.maxAgeDays` |
| Daily policy | `levels`: internship, new_grad. `where`: vancouver, canada, ... | `levels`: junior, mid, senior, lead_manager. `where`: home, apac, remote, us, international | `src/run/policy.ts`, `data/policy.example.json` |
| Profile | | New optional `preferences.timezone` and `preferences.yearsOfExperience`, read by the rating | `src/profile/schema.ts`, `data/profile.analyst.example.json` |

## Not changed yet

- The skill texts in `.claude/skills/` and the prose in `README.md` and `docs/` still describe the student
  workflow. The code is what was adapted.
- `HOME` in `src/config.ts` is set to Indonesia. The upstream rule is that nothing about one candidate lives in
  source, so a cleaner version would read the home country from `data/profile.json`.
- Workday, iCIMS, Taleo and similar boards that want an account stay filtered out, as upstream.
- JEV and the form filling were not run against a live key or a live form in this session. The tests are offline,
  and a live check covered fetching the boards and the code filters only.

## Using it

Needs Node 22, Google Chrome on a Mac (upstream's requirement), Claude Code, and an OpenRouter key for JEV.

```bash
cd jev
npm install
cp data/profile.analyst.example.json data/profile.json   # then fill in your own details; the file is git-ignored
cp .env.example .env                                      # add the OpenRouter key; also git-ignored
claude                                                    # then /setup, /discover, /apply
```

`data/profile.json`, `.env`, `applications/` and `documents/` are git-ignored by `jev/.gitignore`, so
personal data does not reach this repository.

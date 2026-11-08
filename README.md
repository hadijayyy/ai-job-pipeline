# 🎯 AI Job Pipeline

Automated job hunting system powered by Hermes Agent. Scans, verifies, scores, and drafts tailored applications for remote Data Analyst roles globally.

## Architecture

```
Daily Cron → Scout → Analyst → Scorer → Telegram Notification
                                                  ↓
User: "write 1" → Writer (CV + CL + email) → Critic (blind review) → Deliver
```

## Quick Start

1. **Profile**: Edit `profile.json` with your details
2. **Skills**: Import Hermes skills from `skills/` directory
3. **Cron**: Set up daily scout cron job via Hermes
4. **Chat**: Talk to your Hermes agent on Telegram

## Commands

| Command | Action |
|---|---|
| `scout` | Run job search now |
| `score` | Score all unprocessed jobs |
| `write <N>` | Generate CV + CL + email for job #N |
| `status` | Show pipeline status |

## Data Flow

```
data/jobs.json      → Raw discovered jobs
data/scored.json    → Scored + verified jobs  
data/applications.json → Track what's been applied
output/             → Generated documents
```

## Profile

Edit `profile.json` to update your target role, tech stack, salary range, and preferences. The scoring engine uses this to match jobs against your profile.

## GitHub Sync

Jobs and scores auto-commit to this repo daily. Your profile and application history are version-controlled.

## Form filling (`jev/`)

`jev/` is a copy of [qbeka/jev-job-search](https://github.com/qbeka/jev-job-search) (MIT), adapted for senior
data and analytics roles from Jakarta. It finds roles on company boards, rates them against the profile, fills the
application forms in Chrome, reads every answer back from the page, and sends only what you approve. It sits
beside the Hermes pipeline above and does not change it. See `jev/ADAPTATION.md` for what was changed and how to start,
and `jev/docs/CLOUD.md` to run it on a server with Docker, headless, with a daily auto-apply run.

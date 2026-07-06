# 📐 Architecture

## Overview

AI Job Pipeline is a Hermes Agent-powered job hunting system. It uses Hermes skills + cron jobs to automate the job search process while keeping humans in the loop for key decisions.

## Design Principles

1. **Human-in-the-loop** — Agent suggests, human decides
2. **Quality over quantity** — 5 good jobs > 50 random ones  
3. **Blind review** — Critic never sees Writer's reasoning
4. **Offline-first** — All data in JSON files, works without internet
5. **Transparent** — Every decision logged, scores explained

## Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Hermes Agent (Telegram)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Scout      │  │  Analyst    │  │   Scorer    │         │
│  │  (Cron)      │→ │  (Auto)     │→ │  (Auto)     │         │
│  │              │  │             │  │             │         │
│  │ web_search   │  │ web_extract │  │ LLM reasoning│         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                              ↓               │
│                                    ┌─────────────┐          │
│                                    │  Telegram    │          │
│                                    │  Notify      │          │
│                                    └──────┬──────┘          │
│                                           ↓                  │
│                                    ┌─────────────┐          │
│                                    │   Writer     │← User:   │
│                                    │  (On-demand) │  "write 1"│
│                                    └──────┬──────┘          │
│                                           ↓                  │
│                                    ┌─────────────┐          │
│                                    │   Critic     │          │
│                                    │  (Auto)      │          │
│                                    └──────┬──────┘          │
│                                           ↓                  │
│                                    ┌─────────────┐          │
│                                    │   Deliver    │          │
│                                    │  (Telegram)  │          │
│                                    └─────────────┘          │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                    Data Layer (JSON files)                     │
│  jobs.json → scored.json → applications.json → output/       │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### Stage 1: Discovery (Daily Cron)
```
Cron 09:00 → scout.py context → Agent runs Scout skill
  → web_search multiple queries
  → filter duplicates + spam
  → append to data/jobs.json (status: "new")
```

### Stage 2: Verification (Auto after Scout)
```
Agent runs Analyst skill on new jobs
  → web_extract each job URL
  → extract structured data
  → company verification
  → update status to "checked" or "excluded"
```

### Stage 3: Scoring (Auto after Analyst)
```
Agent runs Scorer skill
  → load profile.json
  → compare each job vs profile
  → calculate weighted score (0-100)
  → save to data/scored.json
```

### Stage 4: Notification
```
Agent sends Telegram message:
  "3 high-scored jobs found:
   1. Senior Data Analyst @ Stripe (87)
   2. BI Analyst @ Cloudflare (83)
   3. Revenue Analyst @ Vercel (81)
   
   Reply 'write 1' to generate application docs"
```

### Stage 5: Application (On-demand)
```
User: "write 1"
  → Agent runs Writer skill
  → Load job + profile
  → Generate tailored CV (markdown)
  → Generate cover letter
  → Generate email draft
  → Save to output/
  → Agent runs Critic skill (blind)
  → If PASS: deliver to user
  → If NEEDS_WORK: auto-fix + re-review (max 2 cycles)
```

### Stage 6: Tracking
```
User submits application manually
  → Updates data/applications.json (status: "applied")
  → Optionally: track responses
```

## File Structure

```
ai-job-pipeline/
├── README.md              # This file
├── profile.json           # User's job profile (source of truth)
├── skills/                # Hermes skills
│   ├── job-scout.md       # Discovery
│   ├── job-analyst.md     # Verification
│   ├── job-scorer.md      # Scoring
│   ├── job-writer.md      # Document generation
│   └── job-critic.md      # Quality review
├── scripts/               # Helper scripts
│   └── scout.py           # Scout context generator
├── data/                  # Pipeline state
│   ├── jobs.json          # All discovered jobs
│   ├── scored.json        # Scored jobs
│   └── applications.json  # Application tracking
├── output/                # Generated documents
│   ├── CV_*.md
│   ├── CL_*.md
│   └── Email_*.md
└── docs/
    └── ARCHITECTURE.md    # This file
```

## Cron Setup

```bash
# Daily job scout (09:00 user timezone)
hermes cronjob create \
  --name "job-scout-daily" \
  --schedule "0 9 * * *" \
  --prompt "Load skills/job-scout.md and skills/job-analyst.md. Run the full scout → analyze pipeline for Data Analyst remote jobs. Update data/jobs.json. Send summary to Telegram." \
  --deliver "telegram"

# Weekly score refresh (Monday 10:00)
hermes cronjob create \
  --name "job-score-weekly" \
  --schedule "0 10 * * 1" \
  --prompt "Load skills/job-scorer.md. Score all unchecked jobs in data/jobs.json against profile.json. Send high-priority results to Telegram." \
  --deliver "telegram"
```

## Scoring Algorithm

```python
score = (
    stack_match × 0.30 +      # Tech stack alignment
    remote_fit × 0.25 +       # Remote/work preference match
    salary_fit × 0.20 +       # Salary range compatibility  
    experience_fit × 0.15 +   # Experience level match
    strategic_fit × 0.10      # Company/industry fit
)

# Classification
if score >= 80: "high"      # Apply immediately
elif score >= 60: "medium"   # Worth considering
else: "low"                  # Skip
```

## Blind Review Protocol

The Critic skill implements blind review:
1. Loads ONLY the final CV/CL output
2. Loads the original JD for comparison
3. Does NOT see Writer's prompt, reasoning, or draft iterations
4. Scores on: accuracy, relevance, clarity, impact, completeness
5. Verdict: PASS (80+) / NEEDS_WORK (60-79) / REJECT (<60)

This prevents confirmation bias and ensures quality.

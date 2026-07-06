# 🔎 Job Analyst Skill

## Purpose
Verify and enrich job listings — confirm the position is real, extract full details, check company legitimacy.

## Trigger
- After scout completes (automated)
- Manual: user sends "analyze" or "verify"

## Procedure

### 1. Load Jobs
Read `data/jobs.json`. Filter for `status: "new"`.

### 2. For Each Job (max 10 per run)

#### Step A: Fetch Full Description
```
web_extract(url)
```
If fails, use `browser_navigate` + `browser_snapshot`.

#### Step B: Extract Structured Data
From the full page, extract:
```json
{
  "title": "Exact job title",
  "company": "Company name",
  "location": "Remote/Hybrid/Onsite + timezone",
  "salary_min": null,
  "salary_max": null,
  "salary_currency": "USD",
  "salary_period": "monthly/yearly",
  "remote_allowed": true/false,
  "requirements": ["list of requirements"],
  "nice_to_have": ["list of nice-to-haves"],
  "responsibilities": ["key responsibilities"],
  "application_url": "direct apply link",
  "application_email": "if email-based",
  "application_method": "portal/email/both",
  "posted_date": "YYYY-MM-DD",
  "deadline": "YYYY-MM-DD or null",
  "company_size": "startup/mid/enterprise",
  "company_industry": "tech/fintech/etc"
}
```

#### Step C: Company Check
Quick verification:
- Is the company real? (search web)
- Is the job posting recent?
- Is the application method clear?

#### Step D: Update Status
- If valid: `status: "checked"`, populate all extracted fields
- If dead link/spam: `status: "excluded"`, add `exclude_reason`
- If incomplete data: `status: "pending_manual"`, note what's missing

### 3. Save
Update `data/jobs.json` with enriched data.

### 4. Report
```
Analysis complete: X checked, Y excluded, Z pending
Ready for scoring: X jobs
```

## Output Location
`~/ai-job-pipeline/data/jobs.json` (updated in-place)

## Timeout Handling
If a page takes >10s or returns error, mark as `pending_manual` and move on. Never block the pipeline on one job.

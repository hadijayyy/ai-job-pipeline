# 🔍 Job Scout Skill

## Purpose
Discover remote Data Analyst job openings from multiple sources.

## Trigger
- Daily cron job (recommended: 09:00 user timezone)
- Manual: user sends "scout"

## Procedure

### 1. Load Profile
Read `~/ai-job-pipeline/profile.json` — extract `search_keywords`, `exclude_keywords`, `work_preference`.

### 2. Search Sources
For each keyword in `search_keywords`, run searches:
- `web_search` with query: `"{keyword}" remote hiring 2026`
- `web_search` with query: `"{keyword}" remote job apply now`
- `web_search` with query: `site:linkedin.com/jobs "{keyword}" remote`
- `web_search` with query: `site:indeed.com "{keyword}" remote`

### 3. Filter Results
Remove duplicates by URL. Exclude if:
- URL already exists in `data/jobs.json`
- Title matches any `exclude_keywords`
- Source is known spam/aggregator (upwork, fiverr, freelancer.com)

### 4. Extract Job Data
For each valid result, extract:
```json
{
  "id": "uuid",
  "title": "Job Title",
  "company": "Company Name",
  "url": "Application URL",
  "source": "linkedin/indeed/etc",
  "posted_date": "YYYY-MM-DD or null",
  "discovered_date": "YYYY-MM-DD",
  "status": "new",
  "raw_description": "First 500 chars of description"
}
```

### 5. Save
Append new jobs to `data/jobs.json`. Do NOT overwrite existing entries.

### 6. Report
Output summary:
```
Scout complete: X new jobs found, Y total in pipeline
Top 3 by relevance:
1. [Title] @ [Company] — [source]
2. [Title] @ [Company] — [source]  
3. [Title] @ [Company] — [source]
```

## Output Location
`~/ai-job-pipeline/data/jobs.json`

## Notes
- Prioritize quality over quantity (5 relevant > 50 random)
- LinkedIn and Indeed yield highest quality for Data Analyst roles
- Always check if company is legitimate before including

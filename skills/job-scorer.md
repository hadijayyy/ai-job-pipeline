# 📊 Job Scorer Skill

## Purpose
Score each verified job against the user's profile (0-100).

## Trigger
- After analyst completes (automated)
- Manual: user sends "score"

## Procedure

### 1. Load Data
- Read `data/jobs.json` (filter for `status: "checked"`)
- Read `profile.json`

### 2. Scoring Formula
```
total_score = (stack_match × 0.30) + 
              (remote_fit × 0.25) + 
              (salary_fit × 0.20) + 
              (experience_fit × 0.15) + 
              (strategic_fit × 0.10)
```

### 3. Category Scoring (each 0-100)

#### stack_match (30%)
Compare job requirements vs `profile.skills`:
- 90-100: Core skills (SQL, Python, Power BI) explicitly required
- 70-89: Most skills match, minor gaps
- 50-69: Partial match, would need to learn
- 30-49: Significant skill gap
- 0-29: Wrong tech stack

#### remote_fit (25%)
- 100: Fully remote, global
- 80: Remote with timezone preference (overlaps with UTC-8 to UTC+3)
- 60: Hybrid with remote component
- 40: Remote but restricted region
- 20: Onsite required
- 0: No remote option

#### salary_fit (20%)
- 100: Meets or exceeds target ($4000+/mo)
- 80: $3000-4000/mo
- 60: $2000-3000/mo  
- 40: $1500-2000/mo (below minimum but negotiable)
- 20: Below minimum, no flexibility
- 0: Not disclosed (estimate from company/role level)

#### experience_fit (15%)
- 100: Looking for 3-6 years experience
- 80: 2-8 years (flexible range)
- 60: 5-10 years (slightly overqualified)
- 40: 7+ years (overqualified) or 1-3 years (underqualified)
- 20: Major mismatch

#### strategic_fit (10%)
- 100: Company in target industry (property, healthcare, fintech), growth stage
- 70: Good company, adjacent industry
- 50: Average company, neutral industry
- 30: Known bad culture, shrinking company
- 0: Red flags detected

### 4. Save Results
For each scored job, add to `data/scored.json`:
```json
{
  "id": "uuid",
  "title": "...",
  "company": "...",
  "url": "...",
  "score": 85,
  "breakdown": {
    "stack_match": 92,
    "remote_fit": 90,
    "salary_fit": 75,
    "experience_fit": 88,
    "strategic_fit": 70
  },
  "scored_date": "YYYY-MM-DD",
  "recommendation": "high/medium/low"
}
```

Classification:
- 80-100: `high` — Apply immediately
- 60-79: `medium` — Worth considering
- 0-59: `low` — Skip unless特殊情况

### 5. Update Status
Mark scored jobs in `data/jobs.json` as `status: "scored"`.

### 6. Report
```
Scoring complete: X jobs scored
High priority (80+): X jobs
Medium (60-79): X jobs
Low (<60): X jobs

Top matches:
1. [Title] @ [Company] — Score: 87 (stack:95, remote:90, salary:80, exp:85, str:75)
2. [Title] @ [Company] — Score: 83 (stack:90, remote:85, salary:70, exp:88, str:78)
```

## Output Location
`~/ai-job-pipeline/data/scored.json`

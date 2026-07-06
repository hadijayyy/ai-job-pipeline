# 🧐 Job Critic Skill

## Purpose
Blind review of generated CV and cover letter — quality gate before user submits.

## Key Principle
The Critic MUST NOT see the Writer's reasoning. It only sees the final output + the original JD. This ensures unbiased quality assessment.

## Trigger
- After Writer completes (automated)
- Manual: user sends "review" or "critique"

## Procedure

### 1. Load Materials
- Read the generated CV from `output/` (latest or specified)
- Read the generated CL from `output/`
- Read the original JD from `data/jobs.json`
- Do NOT load Writer's prompt or reasoning

### 2. Review Criteria

#### CV Review (0-100)
| Criterion | Weight | What to Check |
|-----------|--------|---------------|
| Factual Accuracy | 30% | Are claims supported by profile? No invented metrics? |
| Relevance | 25% | Does the CV actually address this specific role? |
| Clarity | 20% | Is it easy to read? Good formatting? |
| Impact | 15% | Are achievements quantified? Strong action verbs? |
| Completeness | 10% | All required sections present? Contact info correct? |

#### CL Review (0-100)
| Criterion | Weight | What to Check |
|-----------|--------|---------------|
| Personalization | 30% | References specific company details? Not generic? |
| Relevance | 25% | Directly addresses job requirements? |
| Tone | 20% | Professional but human? Not robotic? |
| Brevity | 15% | Under 300 words? No filler? |
| Call to Action | 10% | Clear next steps? Professional close? |

### 3. Verdict

**PASS (80+):** Ready to submit. Minor suggestions only.
**NEEDS_WORK (60-79):** Good foundation but needs specific fixes. List exactly what to change.
**REJECT (<60):** Too generic or inaccurate. Needs rewrite with specific feedback.

### 4. Generate Feedback

For PASS:
```
✅ VERDICT: PASS (Score: 87)

Minor suggestions:
1. Consider adding [specific detail] to CL opening
2. CV bullet #3 could be stronger with [number]

Ready to submit.
```

For NEEDS_WORK:
```
⚠️ VERDICT: NEEDS_WORK (Score: 72)

Issues found:
1. [CRITICAL] CL doesn't mention [company name] anywhere — reads generic
   → Fix: Reference their [specific product/initiative]
2. [IMPORTANT] CV lists Python but JD asks for R specifically
   → Fix: Add R to skills if you have it, or remove Python emphasis
3. [MINOR] CL is 350 words — trim to under 300

Resubmit after fixes.
```

For REJECT:
```
❌ VERDICT: REJECT (Score: 45)

Major issues:
1. CV is generic — not tailored to this role at all
2. CL uses "I'm writing to express my interest" opener
3. No quantified achievements in either document

Recommend full rewrite with:
- Focus on revenue forecasting (main JD requirement)
- Lead with Sinarmas Land achievement (+15% YoY)
- Research [Company] before writing CL
```

### 5. Save Review
Add to `data/applications.json`:
```json
{
  "review_score": 87,
  "verdict": "PASS",
  "feedback": "...",
  "reviewed_date": "YYYY-MM-DD"
}
```

### 6. If NEEDS_WORK
Auto-fix common issues:
- Replace generic company references with researched details
- Adjust word count
- Fix formatting

Then re-run Critic. Max 2 revision cycles before flagging for manual review.

## Output
Telegram message with verdict + specific feedback.

# ✍️ Job Writer Skill

## Purpose
Generate tailored CV, cover letter, and email draft for a specific job application.

## Trigger
- User sends: "write <N>" where N is the job number from scored list
- User sends: "write for [company name]"

## Procedure

### 1. Identify Target Job
- If number provided: look up Nth job from `data/scored.json` (sorted by score desc)
- If company name: find matching job
- Load full job details from `data/jobs.json`

### 2. Load Profile
Read `profile.json` — this is the source of truth for your experience, skills, and qualifications.

### 3. Generate CV (Tailored)

Create a tailored version of the CV that emphasizes relevant experience:

**Rules:**
- Keep factual accuracy — never invent experience
- Reorder sections to highlight most relevant work
- Adjust bullet points to mirror JD language
- Keep 1 page for <5 years exp, max 2 pages for 5+
- Include all certifications
- Skills section: put matching skills first

**Structure:**
```
RYAN HADI
[Contact] | [LinkedIn]

SUMMARY
[2-3 sentences tailored to THIS specific role]

EXPERIENCE
[Most relevant role first, bullets adjusted to match JD]

SKILLS
[Matching skills highlighted first]

EDUCATION
[Keep as-is]

CERTIFICATIONS  
[Keep as-is]
```

### 4. Generate Cover Letter

**Rules:**
- Max 3 paragraphs, ~250 words
- Opening: specific role + why this company (research the company)
- Middle: 2-3 concrete achievements that match their needs
- Close: enthusiasm + availability + call to action
- Tone: professional but human, not generic
- NEVER use: "I'm writing to express my interest" (cliché)
- Use: specific company details, recent news, product mentions

**Template structure (DO NOT copy-paste, adapt):**
```
Hi [Hiring Manager / Team],

[Opening: Hook with a specific connection to the company or role. 
Mention something concrete about why THIS company.]

[Middle: 2-3 achievements from your experience that directly 
address their requirements. Use numbers. Mirror their language.]

[Close: Brief, confident, forward-looking. Mention availability 
and next steps.]
```

### 5. Generate Email Draft

If application method is email:
```
Subject: Application for [Role] — Ryan Hadi

Hi [Hiring Team],

Please find attached my CV and cover letter for the [Role] position at [Company].

[1-2 sentences from cover letter opening, personalized]

Best regards,
Ryan Hadi
ryanhadi.career@gmail.com
```

If application method is portal:
```
PORTAL APPLICATION:
URL: [application_url]
Notes: [any specific instructions from the posting]
```

### 6. Save Output
Create files in `output/`:
```
output/
├── CV_RyanHadi_[Company]_[Role].pdf   (concept, actual PDF generation later)
├── CL_RyanHadi_[Company]_[Role].md
└── Email_[Company]_[Role].md
```

Also save the markdown versions for easy copy-paste via Telegram.

### 7. Update Tracking
Add to `data/applications.json`:
```json
{
  "id": "uuid",
  "job_id": "referenced from jobs.json",
  "company": "...",
  "role": "...",
  "status": "draft",
  "cv_file": "output/CV_...",
  "cl_file": "output/CL_...",
  "email_file": "output/Email_...",
  "created_date": "YYYY-MM-DD"
}
```

### 8. Deliver to User
Send files + email draft via Telegram response. Format for easy review.

## Quality Checklist
Before delivering:
- [ ] All facts accurate (no invented experience)
- [ ] Company name spelled correctly throughout
- [ ] Role title matches exactly
- [ ] Contact info is correct
- [ ] No generic phrases ("I'm a hard worker")
- [ ] At least 2 quantified achievements
- [ ] Cover letter references specific company detail

## Output Location
`~/ai-job-pipeline/output/`
`~/ai-job-pipeline/data/applications.json`

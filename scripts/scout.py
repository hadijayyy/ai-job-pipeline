#!/usr/bin/env python3
"""
Job Scout — Automated job discovery script.
Runs as Hermes cron job, outputs discovered jobs as JSON context.
"""

import json
import os
from datetime import datetime
from pathlib import Path

PIPELINE_DIR = Path.home() / "ai-job-pipeline"
DATA_DIR = PIPELINE_DIR / "data"
JOBS_FILE = DATA_DIR / "jobs.json"

def load_existing_jobs():
    if JOBS_FILE.exists():
        with open(JOBS_FILE) as f:
            return json.load(f)
    return []

def save_jobs(jobs):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(JOBS_FILE, "w") as f:
        json.dump(jobs, f, indent=2, ensure_ascii=False)

def get_stats(jobs):
    statuses = {}
    for job in jobs:
        s = job.get("status", "unknown")
        statuses[s] = statuses.get(s, 0) + 1
    return statuses

if __name__ == "__main__":
    jobs = load_existing_jobs()
    stats = get_stats(jobs)
    
    # Output context for the agent
    output = {
        "total_jobs": len(jobs),
        "status_breakdown": stats,
        "last_10": jobs[-10:] if jobs else [],
        "pipeline_dir": str(PIPELINE_DIR),
        "timestamp": datetime.now().isoformat()
    }
    
    print(json.dumps(output, indent=2, ensure_ascii=False))

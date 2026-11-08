/**
 * Small builders so every question in the codebase reads the same way.
 * Instructions are one plain question. Criteria describe each outcome so the
 * model has a definition to match against, not just a label.
 */
import type { ChoiceQuestion, NoulQuestion, ScoreQuestion } from "./types.js";

export function noul(instructions: string, criteria?: { true: string; false: string }): NoulQuestion {
  return criteria ? { type: "noul", instructions, criteria } : { type: "noul", instructions };
}

export function choice(instructions: string, criteria: Record<string, string>): ChoiceQuestion {
  return { type: "choice", instructions, criteria };
}

export function score(instructions: string, criteria: string[]): ScoreQuestion {
  if (criteria.length < 2) throw new Error("score needs at least two levels");
  return { type: "score", instructions, criteria };
}

/** Normalizes a score answer to 0..1 given its number of levels. */
export function scoreToUnit(scoreValue: number, levels: number): number {
  if (levels <= 1) return 0;
  const unit = scoreValue / (levels - 1);
  return Math.min(1, Math.max(0, unit));
}

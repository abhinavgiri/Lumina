/**
 * Hand-written resume WRITING RULES — the vocabulary the scorer judges prose by.
 *
 * Deliberately NOT generated: unlike the skills dictionary (shared/skills.json,
 * which both stacks must agree on), these are frontend-only English-language
 * heuristics with no Python counterpart. Keeping them out of skillsData.ts is
 * what lets that file be fully generated.
 */

export const VAGUE_PHRASES = [
  "team player",
  "hard worker",
  "hard-working",
  "detail-oriented",
  "detail oriented",
  "go-getter",
  "self-starter",
  "results-oriented",
  "think outside the box",
  "synergy",
  "fast learner",
  "passionate about",
  "motivated individual",
  "excellent communication skills",
  "proven track record",
  "dynamic professional",
];

export const WEAK_BULLET_OPENERS = [
  "responsible for",
  "worked on",
  "helped with",
  "helped to",
  "was involved in",
  "involved in",
  "assisted with",
  "participated in",
  "duties included",
  "tasked with",
];

export const ACTION_VERBS = [
  "achieved", "analyzed", "analysed", "architected", "automated", "built", "collaborated",
  "created", "delivered", "designed", "developed", "drove", "eliminated", "enabled",
  "engineered", "enhanced", "established", "executed", "generated", "implemented",
  "improved", "increased", "launched", "led", "maintained", "managed", "mentored",
  "migrated", "modernized", "optimized", "optimised", "orchestrated", "owned",
  "partnered", "performed", "pioneered", "produced", "reduced", "refactored",
  "resolved", "scaled", "shipped", "spearheaded", "standardized", "streamlined",
  "trained", "transformed", "accelerated", "consolidated", "deployed", "integrated",
  "handled", "monitored", "coordinated", "conducted", "presented", "authored",
];

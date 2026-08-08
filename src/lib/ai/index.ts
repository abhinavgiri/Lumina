import { LocalAiEngine } from "@/lib/ai/localEngine";
import type { AiEngine } from "@/lib/ai/types";

export * from "@/lib/ai/types";

let engine: AiEngine | null = null;

/**
 * Engine factory. Selection is driven by AI_ENGINE in the environment:
 *
 *   AI_ENGINE=local   (default) — built-in heuristic engine, fully offline
 *   AI_ENGINE=remote  — reserved: plug a self-hosted LLM adapter in here
 *                       (implement AiEngine, add a case, done — routes and UI
 *                       never change)
 */
export function getAiEngine(): AiEngine {
  if (engine) return engine;

  const kind = process.env.AI_ENGINE ?? "local";
  switch (kind) {
    case "local":
    default:
      engine = new LocalAiEngine();
      return engine;
  }
}

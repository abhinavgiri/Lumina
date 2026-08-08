/**
 * Guards the single source of truth for skills/roles.
 *
 * The skills dictionary was once maintained BY HAND in both TypeScript and
 * Python. They drifted to 104 vs 77 skills with 15 alias mismatches, so the
 * frontend ATS scorer credited skills (Informatica, SSIS, Azure Synapse, JIRA…)
 * that the backend job matcher couldn't see.
 *
 * Now shared/skills.json is canonical and both stacks are generated from it.
 * This test fails if src/lib/ai/skillsData.ts drifts from the JSON — i.e. if
 * someone edits the generated file directly instead of the source.
 *
 * Fix a failure with: npm run gen:shared
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SKILLS, type SkillDef } from "@/lib/ai/skillsData";

const canonical: SkillDef[] = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "../../../shared/skills.json"), "utf8")
);

describe("skills dictionary is generated from shared/skills.json", () => {
  it("has the same skill names, in the same order", () => {
    expect(SKILLS.map((s) => s.name)).toEqual(canonical.map((s) => s.name));
  });

  it("has identical aliases, categories and difficulties", () => {
    expect(SKILLS).toEqual(canonical);
  });

  it("contains the skills the Python side used to be missing", () => {
    // Regression guard for the exact drift that was found.
    const names = new Set(SKILLS.map((s) => s.name));
    for (const s of ["Informatica", "SSIS", "Azure Synapse", "JIRA", "PL/SQL"]) {
      expect(names.has(s)).toBe(true);
    }
  });

  it("has no duplicate skill names and no empty aliases", () => {
    expect(new Set(SKILLS.map((s) => s.name)).size).toBe(SKILLS.length);
    for (const s of SKILLS) {
      expect(s.aliases.every((a) => a.trim().length > 0)).toBe(true);
      expect(s.aliases).toEqual([...new Set(s.aliases)]);
    }
  });

  it("keeps aliases lowercase so matching is case-insensitive by construction", () => {
    for (const s of SKILLS) {
      for (const a of s.aliases) expect(a).toBe(a.toLowerCase());
    }
  });
});

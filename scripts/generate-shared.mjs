/**
 * Generate the per-language skill/role data from the canonical JSON.
 *
 * WHY: the skills dictionary used to be maintained by hand in BOTH
 * src/lib/ai/skillsData.ts and backend/app/utils/text.py. They drifted badly —
 * 104 skills vs 77, plus 15 alias mismatches — so the frontend ATS scorer
 * recognized skills (Informatica, SSIS, Azure Synapse, JIRA…) that the backend
 * job matcher was blind to. See REFACTORING_REPORT.md B4/B6.
 *
 * WHY GENERATE instead of loading the JSON at runtime: the api service builds
 * with `context: ./backend` (docker-compose.yml), so a repo-root shared/ folder
 * isn't in its build context. Committing generated files keeps both images
 * self-contained and adds zero runtime file IO. Drift is prevented by the sync
 * tests in both stacks, which re-derive from shared/*.json.
 *
 * Run after editing shared/skills.json or shared/roles.json:
 *   npm run gen:shared
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const skills = read("shared/skills.json");
const roles = read("shared/roles.json");

const BANNER = (src) =>
  `// GENERATED FILE — DO NOT EDIT BY HAND.\n` +
  `// Source: ${src}\n` +
  `// Regenerate: npm run gen:shared\n`;

const PY_BANNER = (src) =>
  `# GENERATED FILE — DO NOT EDIT BY HAND.\n` +
  `# Source: ${src}\n` +
  `# Regenerate: npm run gen:shared\n`;

// --- TypeScript: src/lib/ai/skillsData.ts ----------------------------------
// Fully generated. The hand-written English writing rules (ACTION_VERBS,
// VAGUE_PHRASES, WEAK_BULLET_OPENERS) live in writingRules.ts and are re-exported
// here so localEngine.ts's imports keep working.
//
// They used to live in THIS file, and an earlier version of this generator
// preserved them by slicing from "export const ACTION_VERBS" to the end — which
// silently dropped the two constants defined before it. Never reconstruct
// hand-written code by string-slicing; keep it in its own file.
const tsSkills = skills
  .map(
    (s) =>
      `  { name: ${JSON.stringify(s.name)}, aliases: ${JSON.stringify(s.aliases)}, ` +
      `category: ${JSON.stringify(s.category)}, difficulty: ${JSON.stringify(s.difficulty)} },`
  )
  .join("\n");

const tsOut = `${BANNER("shared/skills.json")}
export type SkillDef = {
  name: string;
  aliases: string[];
  category:
    | "language"
    | "data"
    | "cloud"
    | "web"
    | "devops"
    | "ai"
    | "analytics"
    | "database"
    | "soft"
    | "tool";
  difficulty: "easy" | "moderate" | "hard";
};

export const SKILLS: SkillDef[] = [
${tsSkills}
];

// Hand-written writing rules live in writingRules.ts; re-exported so existing
// imports from "@/lib/ai/skillsData" keep working.
export { ACTION_VERBS, VAGUE_PHRASES, WEAK_BULLET_OPENERS } from "@/lib/ai/writingRules";
`;

fs.writeFileSync(path.join(root, "src/lib/ai/skillsData.ts"), tsOut);

// --- Python: backend/app/utils/skills_data.py ------------------------------
const pySkills = skills
  .map((s) => `    ${JSON.stringify(s.name)}: ${JSON.stringify(s.aliases)},`)
  .join("\n")
  .replace(/"/g, '"');

const pyMeta = skills
  .map(
    (s) =>
      `    ${JSON.stringify(s.name)}: (${JSON.stringify(s.category)}, ${JSON.stringify(s.difficulty)}),`
  )
  .join("\n");

const pyRoles = Object.entries(roles.roles)
  .map(([role, triggers]) => {
    const inner = Object.entries(triggers)
      .map(([sk, w]) => `        ${JSON.stringify(sk)}: ${w},`)
      .join("\n");
    return `    ${JSON.stringify(role)}: {\n${inner}\n    },`;
  })
  .join("\n");

const pyTitleAliases = roles.titleAliases
  .map(([role, needle]) => `    (${JSON.stringify(role)}, ${JSON.stringify(needle)}),`)
  .join("\n");

const pyOut = `${PY_BANNER("shared/skills.json + shared/roles.json")}"""Shared skill + role vocabulary, generated from the canonical JSON.

Single source of truth for BOTH stacks: the frontend ATS scorer and this
backend's job matcher must recognize exactly the same skills, or a resume gets
scored on skills the job search can't see.
"""
from __future__ import annotations

#: skill name -> alias substrings (lowercased).
SKILLS: dict[str, list[str]] = {
${pySkills}
}

#: skill name -> (category, difficulty). Not used for matching; kept so the
#: backend can reason about skill families without a second source of truth.
SKILL_META: dict[str, tuple[str, str]] = {
${pyMeta}
}

#: role -> {skill: weight}. Drives resume-aware query planning.
ROLE_TRIGGERS: dict[str, dict[str, float]] = {
${pyRoles}
}

#: (role, needle) pairs searched verbatim in resume text, beyond the plain
#: lowercased role names.
TITLE_ALIASES: list[tuple[str, str]] = [
${pyTitleAliases}
]
`;

fs.writeFileSync(path.join(root, "backend/app/utils/skills_data.py"), pyOut);

console.log(
  `generated: ${skills.length} skills, ${Object.keys(roles.roles).length} roles\n` +
    "  -> src/lib/ai/skillsData.ts\n" +
    "  -> backend/app/utils/skills_data.py"
);

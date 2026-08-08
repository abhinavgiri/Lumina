/**
 * Career documents generated from a structured resume: cover letter and
 * LinkedIn "About" summary. Template-based and deterministic — personalized
 * by role, skills, experience and quantified wins pulled from the resume.
 */
import type { StructuredResume } from "@/lib/resumeTypes";

const firstName = (r: StructuredResume) => (r.contact.name || "").split(/\s+/)[0] || "there";

function topWins(r: StructuredResume, n = 2): string[] {
  const bullets = r.experience.flatMap((e) => e.bullets);
  // Prefer quantified achievements
  const withMetrics = bullets.filter((b) => /\d/.test(b));
  return (withMetrics.length ? withMetrics : bullets).slice(0, n);
}

function yearsOfExperience(r: StructuredResume): string | null {
  const years = r.experience
    .map((e) => parseInt(e.startDate.match(/(19|20)\d{2}/)?.[0] ?? "", 10))
    .filter((y) => !isNaN(y));
  if (!years.length) return null;
  const span = new Date().getFullYear() - Math.min(...years);
  return span >= 1 ? `${span}+ years` : null;
}

export function generateCoverLetter(r: StructuredResume, company = "[Company Name]", role?: string): string {
  const target = role || r.targetRole || r.experience[0]?.title || "this role";
  const yrs = yearsOfExperience(r);
  const skills = r.skills.slice(0, 6).join(", ");
  const wins = topWins(r);
  const current = r.experience[0];

  const paragraphs = [
    `Dear Hiring Manager,`,
    `I'm writing to express my strong interest in the ${target} position at ${company}. ${
      yrs ? `With ${yrs} of hands-on experience` : "With hands-on experience"
    }${current ? ` — most recently as ${current.title}${current.company ? ` at ${current.company}` : ""}` : ""}, I bring a proven record of delivering results with ${skills || "modern tools"}.`,
    wins.length
      ? `Highlights of my recent work include:\n${wins.map((w) => `• ${w}`).join("\n")}`
      : "",
    `What draws me to ${company} is the opportunity to apply these skills to real business problems at scale. I'm confident I can contribute from day one while continuing to grow with your team.`,
    `I'd welcome the chance to discuss how my background aligns with your needs. Thank you for your time and consideration.`,
    `Sincerely,\n${r.contact.name || ""}${r.contact.email ? `\n${r.contact.email}` : ""}${r.contact.phone ? ` | ${r.contact.phone}` : ""}`,
  ];
  return paragraphs.filter(Boolean).join("\n\n");
}

export function generateLinkedInSummary(r: StructuredResume): string {
  const target = r.targetRole || r.experience[0]?.title || "professional";
  const yrs = yearsOfExperience(r);
  const skills = r.skills.slice(0, 8);
  const wins = topWins(r, 3);
  const name = firstName(r);

  const lines = [
    `${target}${yrs ? ` with ${yrs} of experience` : ""} turning data and technology into business impact.`,
    ``,
    r.summary ? r.summary : `I specialize in ${skills.slice(0, 4).join(", ")} — building solutions that are reliable, measurable, and genuinely useful.`,
    ``,
    wins.length ? `A few things I've shipped:\n${wins.map((w) => `▸ ${w}`).join("\n")}` : "",
    ``,
    skills.length ? `Core stack: ${skills.join(" · ")}` : "",
    ``,
    `Always happy to talk shop — reach me at ${r.contact.email || "my inbox"}.`,
    `— ${name}`,
  ];
  return lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n").trim();
}

export function generateSkillsSummary(r: StructuredResume): string {
  const byLine = r.skills.join(", ");
  return byLine ? `Skills: ${byLine}` : "";
}

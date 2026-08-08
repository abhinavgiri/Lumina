export type FormatCheckItem = {
  id: string;
  label: string;
  passed: boolean;
  points: number;
  maxPoints: number;
  detail: string;
};

export type FormatCheckResult = {
  score: number; // out of 40
  maxScore: 40;
  items: FormatCheckItem[];
};

const SECTION_KEYWORDS: Record<string, RegExp> = {
  Summary: /\b(summary|objective|profile)\b/i,
  Skills: /\b(skills|core competencies|technical skills)\b/i,
  Experience: /\b(experience|employment|work history)\b/i,
  Education: /\b(education|academic)\b/i,
};

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/;

export function runFormatChecks(rawText: string): FormatCheckResult {
  const items: FormatCheckItem[] = [];
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const wordCount = rawText.split(/\s+/).filter(Boolean).length;

  // 1. Standard section headings present (8 pts, ~2 per heading)
  const foundSections = Object.entries(SECTION_KEYWORDS).filter(([, re]) => re.test(rawText));
  const sectionPoints = Math.round((foundSections.length / 4) * 8);
  items.push({
    id: "sections",
    label: "Standard section headings",
    passed: foundSections.length === 4,
    points: sectionPoints,
    maxPoints: 8,
    detail:
      foundSections.length === 4
        ? "Summary, Skills, Experience, and Education sections were all detected."
        : `Missing section(s): ${Object.keys(SECTION_KEYWORDS)
            .filter((k) => !foundSections.some(([name]) => name === k))
            .join(", ")}. Add clearly labeled headings so ATS parsers can bucket your content correctly.`,
  });

  // 2. Contact info parseable (8 pts: 4 email, 4 phone)
  const hasEmail = EMAIL_RE.test(rawText);
  const hasPhone = PHONE_RE.test(rawText);
  const contactPoints = (hasEmail ? 4 : 0) + (hasPhone ? 4 : 0);
  items.push({
    id: "contact",
    label: "Parseable contact info",
    passed: hasEmail && hasPhone,
    points: contactPoints,
    maxPoints: 8,
    detail:
      hasEmail && hasPhone
        ? "Email and phone number were both detected as plain text."
        : `${!hasEmail ? "No email address detected. " : ""}${
            !hasPhone ? "No phone number detected. " : ""
          }Make sure contact details are plain text (not inside an image or icon) near the top of the resume.`,
  });

  // 3. Contact info near top, not buried in a header/footer (8 pts)
  const first500 = rawText.slice(0, 500);
  const contactNearTop = EMAIL_RE.test(first500) || PHONE_RE.test(first500);
  items.push({
    id: "contact-position",
    label: "Contact info near the top",
    passed: contactNearTop,
    points: contactNearTop ? 8 : 0,
    maxPoints: 8,
    detail: contactNearTop
      ? "Contact details appear near the top of the document body."
      : "Contact details weren't found near the top of the extracted text — if they're in a header/footer, some ATS parsers skip that content entirely. Move contact info into the main body.",
  });

  // 4. Reasonable length (8 pts)
  const tooShort = wordCount < 150;
  const tooLong = wordCount > 1300;
  const lengthOk = !tooShort && !tooLong;
  items.push({
    id: "length",
    label: "Reasonable length (roughly 1-2 pages)",
    passed: lengthOk,
    points: lengthOk ? 8 : wordCount > 0 ? 4 : 0,
    maxPoints: 8,
    detail: lengthOk
      ? `Resume is about ${wordCount} words, a healthy 1-2 page range.`
      : tooShort
        ? `Only ${wordCount} words detected — this reads as too sparse. Add more detail to experience and projects.`
        : `About ${wordCount} words — this likely runs past 2 pages. Trim to the most relevant, recent experience.`,
  });

  // 5. Clean, single-column extraction (no obvious parsing artifacts) (8 pts)
  const shortLineRatio = lines.filter((l) => l.trim().length <= 2).length / Math.max(lines.length, 1);
  const excessiveWhitespace = /[ \t]{4,}/.test(rawText);
  const cleanExtraction = shortLineRatio < 0.15 && !excessiveWhitespace;
  items.push({
    id: "clean-extraction",
    label: "No tables/columns/text-box parsing artifacts",
    passed: cleanExtraction,
    points: cleanExtraction ? 8 : 0,
    maxPoints: 8,
    detail: cleanExtraction
      ? "Text extracted cleanly in reading order, suggesting a single-column, table-free layout."
      : "The extracted text has irregular spacing or many fragmented lines — often a sign of tables, multi-column layouts, or text boxes, which many ATS parsers scramble. Use a single-column layout with simple paragraphs and bullet points.",
  });

  const score = items.reduce((sum, i) => sum + i.points, 0);

  return { score, maxScore: 40, items };
}

/**
 * Text sanitization for resume content.
 *
 * PDF text extraction leaves behind glyphs that break everything downstream:
 * private-use bullets from Wingdings/Symbol fonts (U+F0B7 ...), ligatures (fi),
 * smart punctuation, zero-width characters. Word renders them as boxes and
 * pdfkit's WinAnsi fonts mangle them into mojibake. Clean once at ingestion
 * and again defensively at render time.
 *
 * Invisible-character classes are built with new RegExp + \\u escapes so the
 * source stays pure ASCII (literal invisible chars are unmaintainable).
 */

const PUA_RE = new RegExp("[\\uE000-\\uF8FF]", "g"); // Private Use Area
const SPACE_RE = new RegExp("[\\u00A0\\u1680\\u2000-\\u200A\\u202F\\u205F\\u3000]", "g");
const ZERO_WIDTH_RE = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]", "g");
const COMBINING_RE = new RegExp("[\\u0300-\\u036F]", "g");
const LIGATURE_MAP: Record<string, string> = {
  "ﬀ": "ff",
  "ﬁ": "fi",
  "ﬂ": "fl",
  "ﬃ": "ffi",
  "ﬄ": "ffl",
};
const LIGATURE_RE = new RegExp("[\\uFB00-\\uFB04]", "g");

const REPLACEMENTS: [RegExp, string][] = [
  // Smart quotes/apostrophes
  [new RegExp("[\\u2018\\u2019\\u201A\\u2032]", "g"), "'"],
  [new RegExp("[\\u201C\\u201D\\u201E\\u2033]", "g"), '"'],
  // Dash variants beyond en/em (en – and em — are WinAnsi-safe, kept)
  [new RegExp("[\\u2015\\u2212]", "g"), "-"],
  // Bullet-ish glyphs -> simple bullet
  [new RegExp("[\\u25CF\\u25AA\\u25E6\\u2023\\u2043\\u00B7\\u2219\\u2027\\u25CB\\u25A0\\u25A1\\u2666\\u25C6\\u2756]", "g"), "•"],
  // Arrows, checks, stars
  [new RegExp("[\\u2192\\u27A1\\u2794\\u279C]", "g"), "->"],
  [new RegExp("[\\u2713\\u2714\\u2705]", "g"), "-"],
  [new RegExp("[\\u2605\\u2606\\u2B50]", "g"), "*"],
];

/** Normalize extracted resume text: safe for storage, analysis, and DOCX. */
export function sanitizeResumeText(text: string): string {
  if (!text) return "";
  let out = text;
  out = out.replace(LIGATURE_RE, (m) => LIGATURE_MAP[m] ?? m);
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  out = out.replace(SPACE_RE, " ");
  out = out.replace(ZERO_WIDTH_RE, "");
  out = out.replace(PUA_RE, "•");
  // Collapse bullet runs ("** " from a PUA glyph next to a real bullet)
  out = out.replace(new RegExp("\\u2022[\\s\\u2022]*\\u2022", "g"), "•");
  // Decompose + strip combining marks so exotic accents degrade to base letters
  out = out.normalize("NFKD").replace(COMBINING_RE, "");
  return out;
}

/**
 * Harder pass for pdfkit's standard fonts (WinAnsi encoding): after the
 * normal cleanup, drop anything still outside Latin-1 + the WinAnsi extras.
 */
const WINANSI_EXTRAS = new Set(
  "–—‘’“”•…€™ŠšŽžŒœŸƒˆ˜†‡‰‹›".split("")
);

export function toWinAnsi(text: string): string {
  const cleaned = sanitizeResumeText(text);
  let out = "";
  for (const ch of cleaned) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff || WINANSI_EXTRAS.has(ch)) out += ch;
    // anything else is silently dropped rather than mangled
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Deep-sanitize every string in an object tree (used on structured resumes). */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === "string") return sanitizeResumeText(value) as T;
  if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = sanitizeDeep(v);
    return out as T;
  }
  return value;
}

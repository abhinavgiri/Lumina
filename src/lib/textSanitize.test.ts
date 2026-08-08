/**
 * CHARACTERIZATION tests for text sanitization and skill casing.
 *
 * These guard a recurring bug class: PDF extraction leaves private-use glyphs
 * (Wingdings bullets), ligatures, smart quotes and zero-width characters that
 * corrupt the generated PDF/DOCX downstream. The sanitize choke points exist
 * because of real, repeated breakage — keep them working.
 *
 * Values captured from the current implementation, not hand-written.
 */
import { describe, expect, it } from "vitest";
import { sanitizeResumeText, toWinAnsi, sanitizeDeep } from "@/lib/textSanitize";
import { canonicalizeText, canonicalizeSkills } from "@/lib/ai/skillCasing";

describe("sanitizeResumeText", () => {
  it("normalizes PDF extraction artifacts", () => {
    // U+F0B7 Wingdings bullet, smart quotes, en dash, "fi" ligature, zero-width space
    const input = " Bullet “smart” –dash ﬁne​";
    expect(sanitizeResumeText(input)).toBe('• Bullet "smart" –dash fine');
  });

  it("folds accented characters to ASCII", () => {
    expect(sanitizeResumeText("café — naïve")).toBe("cafe — naive");
  });

  it("is a no-op on already-clean text", () => {
    expect(sanitizeResumeText("Plain ASCII resume text.")).toBe("Plain ASCII resume text.");
  });

  it("handles an empty string", () => {
    expect(sanitizeResumeText("")).toBe("");
  });
});

describe("toWinAnsi", () => {
  it("drops characters WinAnsi cannot encode so pdfkit never emits garbage", () => {
    // CJK is unencodable and must be removed; bullet and em dash survive.
    expect(toWinAnsi("Bullet • em—dash 你好")).toBe("Bullet • em—dash ");
  });
});

describe("sanitizeDeep", () => {
  it("walks nested objects and arrays, leaving non-strings untouched", () => {
    expect(sanitizeDeep({ a: "“x”", b: ["–y"], n: 5 })).toEqual({
      a: '"x"',
      b: ["–y"],
      n: 5,
    });
  });
});

describe("canonicalizeText", () => {
  it("fixes acronym and product casing the LLM commonly gets wrong", () => {
    expect(canonicalizeText("power bi and etl with dax and sql")).toBe(
      "Power BI and ETL with DAX and SQL"
    );
  });
});

describe("canonicalizeSkills", () => {
  it("canonicalizes casing and drops blank entries", () => {
    expect(canonicalizeSkills(["power bi", "etl", "dax", "sql", "  ", "python"])).toEqual([
      "Power BI", "ETL", "DAX", "SQL", "Python",
    ]);
  });
});

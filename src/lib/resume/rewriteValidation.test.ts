/**
 * Tests for the rewrite guard.
 *
 * This is the safety-critical piece of Phase 4: it is the only thing standing
 * between a language model and factual claims on someone's resume. The
 * fabrication tests below are the reason it exists.
 */
import { describe, expect, it } from "vitest";
import { validateRewrite } from "@/lib/resume/rewriteValidation";

const accepts = (a: string, b: string) => expect(validateRewrite(a, b).ok).toBe(true);
const rejectsWith = (a: string, b: string, reason: string) => {
  const r = validateRewrite(a, b);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.reason).toBe(reason);
};

describe("fabricated metrics", () => {
  it("REJECTS a rewrite that invents a percentage", () => {
    rejectsWith(
      "Built ETL pipelines in Airflow for the reporting team",
      "Built ETL pipelines in Airflow, reducing runtime by 40%",
      "invented-number"
    );
  });

  it("REJECTS an invented team size", () => {
    rejectsWith("Led the migration to Snowflake", "Led a team of 5 through the migration to Snowflake", "invented-number");
  });

  it("REJECTS an invented volume even when phrased vaguely", () => {
    rejectsWith("Processed customer records daily", "Processed 1M+ customer records daily", "invented-number");
  });

  it("allows a rewrite that keeps the original numbers", () => {
    accepts(
      "Responsible for 500+ PVOs in Oracle Fusion",
      "Maintained 500+ PVOs in Oracle Fusion"
    );
  });

  it("treats formatting differences as the same number", () => {
    // Note: the rewrite must not add a tool either, or it fails a different
    // check — an earlier version of this test wrongly appended "with SQL".
    accepts("Processed 1,000,000 rows nightly", "Processed 1000000 customer rows nightly");
  });

  it("REJECTS dropping a real achievement", () => {
    rejectsWith(
      "Built pipelines processing 1M+ rows, cutting runtime 45%",
      "Built pipelines that improved reporting speed",
      "dropped-number"
    );
  });

  it("ignores numbers inside product names when checking for metrics", () => {
    // "S3" and "Log4j" are names, not claims of scale.
    accepts("Stored exports in Amazon S3 buckets", "Migrated exports to Amazon S3 buckets");
  });
});

describe("fabricated tools", () => {
  it("REJECTS adding a technology the person never mentioned", () => {
    rejectsWith(
      "Built data pipelines for the analytics team",
      "Built data pipelines with Apache Spark for the analytics team",
      "invented-tool"
    );
  });

  it("allows rewording around tools already present", () => {
    accepts(
      "Was responsible for Power BI dashboards using DAX",
      "Built Power BI dashboards with DAX measures for stakeholders"
    );
  });
});

describe("quality guards", () => {
  it("rejects banned filler", () => {
    rejectsWith(
      "Managed the reporting process end to end",
      "Results-driven professional who managed the reporting process",
      "banned-phrase"
    );
  });

  it("rejects an unchanged rewrite", () => {
    rejectsWith("Built Python tooling", "Built Python tooling", "unchanged");
  });

  it("rejects an empty rewrite", () => {
    rejectsWith("Built Python tooling", "   ", "empty");
  });

  it("rejects a rewrite that runs too long", () => {
    rejectsWith("Built tooling", `Built ${"tooling and more ".repeat(20)}`, "too-long");
  });

  it("rejects a rewrite that collapses to a fragment", () => {
    rejectsWith("Built internal Python tooling for the reporting team", "Built tools", "too-short");
  });
});

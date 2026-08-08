/**
 * Canonical casing for skills and acronyms.
 *
 * LLMs (esp. smaller ones like llama-3.3-70b) naively title-case acronyms and
 * product names — "Power BI" → "Power Bi", "ETL" → "Etl", "DAX" → "Dax". We
 * never trust the model for casing; we normalize deterministically afterward.
 */

// Canonical forms keyed by their lowercased spelling. Order-independent.
const CANONICAL: Record<string, string> = {
  // Acronyms
  "ai": "AI", "ml": "ML", "nlp": "NLP", "llm": "LLM", "genai": "GenAI",
  "etl": "ETL", "elt": "ELT", "dax": "DAX", "kpi": "KPI", "kpis": "KPIs",
  "sql": "SQL", "nosql": "NoSQL", "t-sql": "T-SQL", "pl/sql": "PL/SQL",
  "bi": "BI", "aws": "AWS", "gcp": "GCP", "api": "API", "apis": "APIs",
  "rest": "REST", "graphql": "GraphQL", "xml": "XML", "json": "JSON",
  "html": "HTML", "css": "CSS", "ci/cd": "CI/CD", "cicd": "CI/CD",
  "odi": "ODI", "bicc": "BICC", "pvo": "PVO", "pvos": "PVOs", "sap": "SAP",
  "jira": "JIRA", "s3": "S3", "ec2": "EC2", "gpu": "GPU", "otc": "OTC",
  "sla": "SLA", "slas": "SLAs", "tdd": "TDD", "tdds": "TDDs", "kt": "KT",
  "rag": "RAG", "mlops": "MLOps", "devops": "DevOps", "k8s": "K8s",
  "r": "R", "c++": "C++", "c#": "C#", ".net": ".NET", "b2b": "B2B", "c2b": "C2B",
  // Product / proper names
  "power bi": "Power BI", "powerbi": "Power BI", "power-bi": "Power BI",
  "oracle odi": "Oracle ODI", "oracle data integrator": "Oracle Data Integrator",
  "oracle fusion": "Oracle Fusion", "servicenow": "ServiceNow",
  "typescript": "TypeScript", "javascript": "JavaScript", "nodejs": "Node.js",
  "node.js": "Node.js", "next.js": "Next.js", "nextjs": "Next.js",
  "postgresql": "PostgreSQL", "postgres": "PostgreSQL", "mysql": "MySQL",
  "mongodb": "MongoDB", "github": "GitHub", "gitlab": "GitLab",
  "fastapi": "FastAPI", "pytorch": "PyTorch", "tensorflow": "TensorFlow",
  "scikit-learn": "scikit-learn", "sklearn": "scikit-learn", "numpy": "NumPy",
  "pandas": "pandas", "dbt": "dbt", "bigquery": "BigQuery", "redshift": "Amazon Redshift",
  "snowflake": "Snowflake", "databricks": "Databricks", "tableau": "Tableau",
  "looker": "Looker", "kafka": "Apache Kafka", "spark": "Apache Spark",
  "pyspark": "PySpark", "airflow": "Apache Airflow", "hadoop": "Hadoop",
  "azure": "Azure", "docker": "Docker", "kubernetes": "Kubernetes",
  "terraform": "Terraform", "jenkins": "Jenkins", "git": "Git", "linux": "Linux",
  "excel": "Excel", "java": "Java", "python": "Python", "go": "Go", "scala": "Scala",
};

// Multi-word canonical entries, longest first, for whole-text replacement.
const PHRASES = Object.keys(CANONICAL)
  .filter((k) => k.includes(" ") || k.includes("."))
  .sort((a, b) => b.length - a.length);

/** Normalize a single skill/technology token to its canonical casing. */
export function canonicalizeSkill(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  const direct = CANONICAL[s.toLowerCase()];
  if (direct) return direct;
  // Multi-word skills: canonicalize each recognized word, title-case the rest.
  return s
    .split(/\s+/)
    .map((w) => CANONICAL[w.toLowerCase()] ?? (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function canonicalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills.map(canonicalizeSkill)) {
    const k = s.toLowerCase();
    if (s && !seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}

/**
 * Fix acronym/product casing inside free text (summaries, bullets, titles)
 * without touching surrounding words. Whole-word, case-insensitive.
 */
export function canonicalizeText(text: string): string {
  if (!text) return text;
  let out = text;
  // Multi-word phrases first so "power bi" wins before the "bi" token rule.
  for (const p of PHRASES) {
    const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, CANONICAL[p]);
  }
  // Single-token acronyms
  for (const [k, v] of Object.entries(CANONICAL)) {
    if (k.includes(" ")) continue;
    if (/^[a-z0-9]/.test(k) && /[a-z]/.test(k) === false) {
      // pure symbolic like c++ — skip word-boundary (handled if alnum)
    }
    const re = new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, v);
  }
  return out;
}

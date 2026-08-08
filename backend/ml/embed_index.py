"""Semantic index — embeddings + nearest-neighbour search for resume<->job
matching. This is the Phase 4/5 "semantic search instead of keyword search"
piece, and it needs NO labels.

Model: sentence-transformers all-MiniLM-L6-v2 (small, CPU-fine, 384-dim).
Index: FAISS when available; falls back to scikit-learn NearestNeighbors
(exact, fine for tens of thousands of items) so a missing faiss wheel on
Python 3.13 never blocks us. Same public API either way.

The embedding model is downloaded once on first use (~90MB) and cached locally
by sentence-transformers.
"""
from __future__ import annotations

import json
import os

import numpy as np

_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer(_MODEL_NAME)
    return _model


def embed(texts: list[str]) -> np.ndarray:
    """L2-normalized embeddings so inner product == cosine similarity."""
    model = _get_model()
    vecs = model.encode(texts, batch_size=64, show_progress_bar=False,
                        convert_to_numpy=True, normalize_embeddings=True)
    return vecs.astype("float32")


class SemanticIndex:
    """Cosine-similarity nearest-neighbour index over a text corpus."""

    def __init__(self) -> None:
        self._backend = None          # "faiss" | "sklearn"
        self._index = None
        self._vecs: np.ndarray | None = None
        self.metas: list[dict] = []

    def build(self, texts: list[str], metas: list[dict]) -> "SemanticIndex":
        assert len(texts) == len(metas)
        self.metas = metas
        vecs = embed(texts)
        self._vecs = vecs
        try:
            import faiss
            index = faiss.IndexFlatIP(vecs.shape[1])   # inner product on normalized = cosine
            index.add(vecs)
            self._index, self._backend = index, "faiss"
        except Exception:
            from sklearn.neighbors import NearestNeighbors
            nn = NearestNeighbors(metric="cosine")
            nn.fit(vecs)
            self._index, self._backend = nn, "sklearn"
        return self

    def query(self, text: str, k: int = 5) -> list[dict]:
        q = embed([text])
        if self._backend == "faiss":
            sims, idx = self._index.search(q, k)
            pairs = zip(idx[0], sims[0])
        else:
            dist, idx = self._index.kneighbors(q, n_neighbors=min(k, len(self.metas)))
            pairs = zip(idx[0], (1.0 - d for d in dist[0]))   # cosine distance -> similarity
        out = []
        for i, sim in pairs:
            m = dict(self.metas[int(i)])
            m["similarity"] = round(float(sim), 4)
            out.append(m)
        return out

    @property
    def backend(self) -> str:
        return self._backend or "unbuilt"


# --- tiny synthetic job corpus so the semantic matcher can be demoed today ---
_JOBS = [
    ("Data Engineer", "Build and own ETL pipelines in Spark and Airflow feeding a Snowflake warehouse; dbt models, Kafka streaming."),
    ("Senior Data Engineer", "Design Medallion architecture on Databricks, orchestrate with Airflow, optimize Spark jobs at 20TB scale."),
    ("Analytics Engineer", "Own the dbt project and semantic layer over BigQuery; testing, documentation, incremental models."),
    ("Power BI Developer", "Build Power BI dashboards with advanced DAX, star-schema modeling, row-level security for finance."),
    ("Data Analyst", "SQL analysis and Power BI reporting for stakeholders; cohort and funnel analysis, KPI dashboards."),
    ("Data Scientist", "Churn and forecasting models with scikit-learn and Python; experimentation and A/B testing."),
    ("ML Engineer", "Production ML: PyTorch training pipelines, feature stores, model serving and MLOps on Kubernetes."),
    ("AI Engineer", "Build RAG pipelines and LLM integrations with prompt engineering and embeddings search."),
    ("Backend Engineer", "FastAPI and Django services with PostgreSQL and Redis; REST and GraphQL APIs at scale."),
    ("Frontend Engineer", "React and Next.js dashboards in TypeScript; component library, accessibility, performance."),
    ("Full Stack Engineer", "Next.js frontend with a Node.js API and PostgreSQL; end-to-end feature ownership."),
    ("DevOps Engineer", "CI/CD with Jenkins, Kubernetes and Terraform, Docker containers on AWS infrastructure."),
    ("Cloud Engineer", "AWS/Azure landing zones with Terraform; cost optimization and migrations."),
    ("Business Analyst", "Stakeholder requirement workshops, process mapping, KPI reporting in Excel and Power BI."),
]


def demo_job_index() -> SemanticIndex:
    texts = [f"{t}. {d}" for t, d in _JOBS]
    metas = [{"title": t, "description": d} for t, d in _JOBS]
    return SemanticIndex().build(texts, metas)


if __name__ == "__main__":
    # Quick self-test: match a sample synthetic resume against the job corpus.
    idx = demo_job_index()
    print(f"index backend: {idx.backend}\n")
    rows = [json.loads(l) for l in open("ml/data/resumes.jsonl", encoding="utf-8")]
    sample = next(r for r in rows if r["role"] == "Data Engineer")
    print(f"Resume label: {sample['role']}  skills={sample['skills']}\n")
    for hit in idx.query(sample["text"], k=4):
        print(f"  {hit['similarity']:.3f}  {hit['title']}")

"""Train Lumina's own role classifier — the first model that is genuinely OURS
and genuinely improves with data.

Model: TF-IDF (word 1-2grams) + Logistic Regression. Deliberately simple:
  - trains in seconds on CPU, ships as a small .joblib,
  - fully inspectable (you can read the top features per class),
  - a strong baseline that beats the regex role-guess in query_planner.py,
  - every new labeled resume (synthetic now, real+consented later) makes it
    sharper — retrain is one command.

It predicts ROLE (Data Engineer / Backend / ML Engineer / ...). It does NOT
predict an ATS score — that stays deterministic (see REFACTORING_REPORT.md D).

Run:  python ml/train_role_classifier.py
Out:  ml/models/role_clf.joblib  (+ printed eval report)
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

import joblib
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, accuracy_score, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from ml.pii import strip_pii  # noqa: E402

# All top-level jsonl in ml/data/ (synthetic templates + any LLM augmentation).
# The external validation set lives in ml/data/external/ and is NOT globbed here.
DATA_GLOB = "ml/data/*.jsonl"
MODEL_OUT = "ml/models/role_clf.joblib"


def load(pattern: str) -> tuple[list[str], list[str]]:
    X, y = [], []
    files = sorted(glob.glob(pattern))
    for path in files:
        n = 0
        with open(path, encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                X.append(strip_pii(row["text"]))  # PII-strip every doc before training
                y.append(row["role"])
                n += 1
        print(f"  loaded {n:5} from {os.path.basename(path)}")
    return X, y


def build_pipeline() -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            ngram_range=(1, 2),
            min_df=2,
            max_features=20000,
            sublinear_tf=True,
        )),
        ("clf", LogisticRegression(max_iter=1000, C=4.0, class_weight="balanced")),
    ])


def top_features_per_class(pipe: Pipeline, n: int = 6) -> dict[str, list[str]]:
    """The words each role leans on most — sanity check that it learned real signal."""
    vec: TfidfVectorizer = pipe.named_steps["tfidf"]
    clf: LogisticRegression = pipe.named_steps["clf"]
    names = vec.get_feature_names_out()
    out: dict[str, list[str]] = {}
    for i, cls in enumerate(clf.classes_):
        coefs = clf.coef_[i]
        top = coefs.argsort()[::-1][:n]
        out[cls] = [names[j] for j in top]
    return out


def main() -> None:
    if not glob.glob(DATA_GLOB):
        sys.exit(f"No dataset matching {DATA_GLOB}. Run: python ml/synth_resumes.py --n 1560")

    X, y = load(DATA_GLOB)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=7)

    pipe = build_pipeline()
    pipe.fit(X_tr, y_tr)

    pred = pipe.predict(X_te)
    acc = accuracy_score(y_te, pred)
    f1m = f1_score(y_te, pred, average="macro")

    # Honest generalization check: strip each role's OWN name-words from the test
    # text, so the model can't win by reading a stated title/summary label — it
    # must classify from skills/experience alone. This is the number that
    # predicts performance on real resumes that don't state a target role.
    role_words = {w for r in set(y) for w in re.findall(r"[a-z]+", r.lower()) if len(w) > 2}
    mask_re = re.compile(r"\b(" + "|".join(sorted(role_words, key=len, reverse=True)) + r")\b", re.I)
    X_te_masked = [mask_re.sub(" ", d) for d in X_te]
    pred_m = pipe.predict(X_te_masked)
    acc_m = accuracy_score(y_te, pred_m)
    f1_m = f1_score(y_te, pred_m, average="macro")

    print(f"\n=== Role classifier — held-out eval ({len(X_te)} resumes) ===")
    print(f"accuracy (role words visible) : {acc:.3f}   macro-F1 {f1m:.3f}")
    print(f"accuracy (role words MASKED)  : {acc_m:.3f}   macro-F1 {f1_m:.3f}   <- real signal")
    print("(masked = can it infer role from skills alone, with the label scrubbed?)\n")
    print(classification_report(y_te, pred, zero_division=0))

    print("Top signal terms the model learned per role:")
    for role, feats in top_features_per_class(pipe).items():
        print(f"  {role:28} {', '.join(feats)}")

    os.makedirs(os.path.dirname(MODEL_OUT), exist_ok=True)
    joblib.dump(pipe, MODEL_OUT)
    print(f"\nSaved -> {MODEL_OUT}")


if __name__ == "__main__":
    main()

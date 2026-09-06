"""Reproduce baseline evaluations on retained, revised ECB aggregates, never synthetic accuracy."""
from pathlib import Path
import hashlib
import json
import sys

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "services/scientific-worker"))
from economyos_science.__main__ import execute


def digest(content):
    return hashlib.sha256(content).hexdigest()


manifest_bytes = (root / "apps/web/public/behavioral/manifest.json").read_bytes()
manifest = json.loads(manifest_bytes)
results = []
for country, coverage in sorted(manifest["countries"].items()):
    content = (root / f"apps/web/public/behavioral/{country}.json").read_bytes()
    if digest(content) != coverage["sha256"]:
        raise ValueError("Dataset integrity failed")
    rows = sorted((row for row in json.loads(content)["records"]
                   if row["observation"]["instrument_or_item"] == "expected-inflation-1y"
                   and row["observation"]["value"] is not None),
                  key=lambda row: row["observation"]["observation_date"])
    periods = [row["observation"]["observation_date"] for row in rows]
    ordinals = [int(p[:4]) * 12 + int(p[5:]) for p in periods]
    if any(b - a != 1 for a, b in zip(ordinals, ordinals[1:])):
        raise ValueError("Monthly lags require contiguous monthly data")
    job = {"schemaVersion": 1, "jobId": f"ces-revised-baselines-{country}",
           "kind": "forecast_evaluation",
           "dataset": {"snapshotSha256": coverage["sha256"],
                       "vintage": "latest_revised_only", "frequency": "monthly",
                       "entity": country, "metric": "expected-inflation-1y"},
           "data": {"periods": periods, "values": [float(row["observation"]["value"]) for row in rows]},
           "options": {"minimum_train": 36, "seasonal_period": 12}}
    results.append({"input": job, "output": execute(job)})
artifact = {"schemaVersion": 1, "sourceManifestSha256": digest(manifest_bytes),
            "methodSourceSha256": digest((root / "services/scientific-worker/economyos_science/statistics.py").read_bytes()),
            "evaluationPurpose": "One-step prediction of the published expectation statistic; not prediction of realized inflation",
            "historicalInterpretation": "retrospective_revised_history",
            "publicationStatus": "review_required", "modelPublication": "not_approved",
            "limitations": ["Today's revised aggregates are not historical-as-known evidence",
                            "No prediction-interval or domain-transfer approval", "No causal or psychological claim"],
            "evaluations": results}
path = root / "data/intelligence/evaluations/ces-baselines.json"
encoded = json.dumps(artifact, indent=2, allow_nan=False) + "\n"
if "--verify" in sys.argv:
    if path.read_text() != encoded:
        raise ValueError("Retained empirical evaluation is not reproducible")
else:
    path.parent.mkdir(exist_ok=True)
    path.write_text(encoded)
print(f"Verified {len(results)} actual revised-history evaluations with retained chronological predictions")

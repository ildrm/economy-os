"""One JSON request per process. Job callers own authorization and immutable storage."""

import hashlib
import json
import sys
from . import __version__
from .statistics import (chronological_evaluation, describe, event_study,
                         historical_risk, regression, weighted_summary)


def execute(job):
    if not isinstance(job, dict) or job.get("schemaVersion") != 1 or not job.get("jobId"):
        raise ValueError("Invalid scientific job contract")
    dataset = job.get("dataset", {})
    digest = dataset.get("snapshotSha256", "")
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
        raise ValueError("A dataset manifest digest is required")
    vintage = dataset.get("vintage")
    if vintage not in ("true_vintage", "reconstructed_only", "latest_revised_only"):
        raise ValueError("Dataset vintage is required")
    data, options = job.get("data", {}), job.get("options", {})
    kind = job.get("kind")
    if kind == "describe":
        result = describe(data["values"])
    elif kind == "survey_summary":
        result = weighted_summary(data["values"], data["weights"])
    elif kind == "association":
        result = regression(data["x"], data["y"])
    elif kind == "forecast_evaluation":
        result = chronological_evaluation(data["values"], data["periods"], **options)
        result["historicalInterpretation"] = "retrospective_revised_history" if vintage == "latest_revised_only" else "requires_per_feature_availability_validation"
    elif kind == "historical_risk":
        result = historical_risk(data["returns"], dataset.get("frequency"), options.get("complete_valuation") is True)
    elif kind == "event_study":
        result = event_study(data["asset_returns"], data["benchmark_returns"], **options)
    else:
        raise ValueError("Unsupported scientific job")
    encoded = json.dumps(job, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    return {"schemaVersion": 1, "jobId": job["jobId"], "workerVersion": __version__,
            "inputSha256": hashlib.sha256(encoded).hexdigest(), "dataset": dataset,
            "kind": kind, "result": result, "publicationStatus": "review_required"}


def main():
    try:
        raw = sys.stdin.buffer.read(8_000_001)
        if len(raw) > 8_000_000:
            raise ValueError("Scientific job exceeds 8 MB limit")
        output = execute(json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON"))))
        print(json.dumps(output, allow_nan=False, separators=(",", ":")))
    except (ValueError, KeyError, TypeError, OverflowError) as error:
        print(json.dumps({"schemaVersion": 1, "error": "invalid_job", "message": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()

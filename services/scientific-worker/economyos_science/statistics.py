"""Transparent estimators; computational correctness is not predictive validation."""

from math import fsum, isfinite, sqrt
from statistics import mean, median, stdev


def finite(values, minimum=1):
    if len(values) < minimum or any(isinstance(x, bool) or not isfinite(float(x)) for x in values):
        raise ValueError("Insufficient or non-finite observations")
    return [float(x) for x in values]


def describe(values):
    x = finite(values)
    return {"count": len(x), "mean": mean(x), "median": median(x),
            "minimum": min(x), "maximum": max(x),
            "sampleStandardDeviation": stdev(x) if len(x) > 1 else None}


def weighted_summary(values, weights):
    x, w = finite(values), finite(weights)
    if len(x) != len(w) or min(w) < 0 or fsum(w) <= 0:
        raise ValueError("Survey weights must align and have positive total mass")
    total = fsum(w)
    average = fsum(a * b for a, b in zip(x, w)) / total
    # Effective sample size describes unequal weighting, not clustering/design effects.
    effective = total * total / fsum(v * v for v in w)
    return {"weightedMean": average, "weightSum": total, "effectiveSampleSize": effective,
            "count": len(x), "uncertainty": None,
            "limitation": "No design-based interval without survey design or replicate weights"}


def regression(x, y):
    x, y = finite(x, 3), finite(y, 3)
    if len(x) != len(y):
        raise ValueError("Regression cohorts must align")
    mx, my = mean(x), mean(y)
    xx = fsum((v - mx) ** 2 for v in x)
    yy = fsum((v - my) ** 2 for v in y)
    if xx == 0:
        raise ValueError("Predictor has no variation")
    xy = fsum((a - mx) * (b - my) for a, b in zip(x, y))
    slope = xy / xx
    intercept = my - slope * mx
    residuals = [b - intercept - slope * a for a, b in zip(x, y)]
    return {"slope": slope, "intercept": intercept,
            "correlation": xy / sqrt(xx * yy) if yy > 0 else None,
            "residuals": residuals, "count": len(x),
            "evidenceType": "association", "uncertainty": None,
            "limitation": "Association is not a causal effect; no IID interval for dependent observations"}


def chronological_evaluation(values, periods, minimum_train=12, seasonal_period=None):
    x = finite(values, minimum_train + 3)
    if len(periods) != len(x) or periods != sorted(set(periods)):
        raise ValueError("Evaluation requires unique chronological observations")
    if minimum_train < 3 or minimum_train > len(x) - 3:
        raise ValueError("Invalid training window")
    if seasonal_period is not None and (not isinstance(seasonal_period, int)
                                        or seasonal_period < 2 or seasonal_period > minimum_train):
        raise ValueError("Invalid seasonal period")
    predictions = []
    for index in range(minimum_train, len(x)):
        train = x[:index]
        estimates = {"naive": train[-1], "historical_mean": mean(train)}
        if seasonal_period:
            estimates["seasonal_naive"] = train[-seasonal_period]
        try:
            fitted = regression(train[:-1], train[1:])
            estimates["ar1"] = fitted["intercept"] + fitted["slope"] * train[-1]
        except ValueError:
            estimates["ar1"] = None
        for method, prediction in estimates.items():
            predictions.append({"method": method, "trainingEnd": periods[index - 1],
                                "targetPeriod": periods[index], "actual": x[index],
                                "prediction": prediction})
    scores = {}
    for method in sorted({p["method"] for p in predictions}):
        rows = [p for p in predictions if p["method"] == method and p["prediction"] is not None]
        errors = [p["prediction"] - p["actual"] for p in rows]
        scores[method] = {"count": len(rows), "mae": mean(abs(e) for e in errors) if errors else None,
                          "rmse": sqrt(mean(e * e for e in errors)) if errors else None}
    return {"predictions": predictions, "scores": scores, "modelPublication": "not_approved",
            "evaluation": "expanding_window", "uncertainty": None}


def drawdown(returns):
    values = finite(returns)
    if min(values) < -1:
        raise ValueError("A simple return cannot be below -100%")
    wealth, peak, worst = 1.0, 1.0, 0.0
    path = []
    for value in values:
        wealth *= 1 + value
        peak = max(peak, wealth)
        loss = wealth / peak - 1
        worst = min(worst, loss)
        path.append(loss)
    return {"maximumDrawdown": worst, "terminalWealth": wealth, "drawdowns": path}


def historical_risk(returns, frequency, complete_valuation):
    values = finite(returns)
    if frequency != "daily":
        raise ValueError("Daily history is required for these risk estimates")
    result = {"count": len(values), "scope": "complete" if complete_valuation else "subset",
              "annualizedVolatility": None, "expectedShortfall95": None,
              "volatilityReason": "incomplete_valuation" if not complete_valuation else "insufficient_history",
              "expectedShortfallReason": "incomplete_valuation" if not complete_valuation else "insufficient_history"}
    if not complete_valuation:
        return result
    if len(values) >= 252:
        result["annualizedVolatility"] = stdev(values) * sqrt(252)
        result["volatilityReason"] = None
    if len(values) >= 1000:
        # Integrate the empirical lower 5% quantile, retaining fractional boundary mass.
        ordered = sorted(values)
        mass = len(ordered) * 0.05
        whole = int(mass)
        fraction = mass - whole
        tail = fsum(ordered[:whole]) + (fraction * ordered[whole] if fraction else 0)
        result["expectedShortfall95"] = -tail / mass
        result["expectedShortfallReason"] = None
    return result


def event_study(asset_returns, benchmark_returns, event_index, estimation_length=120,
                gap=5, window_before=1, window_after=1):
    asset, market = finite(asset_returns), finite(benchmark_returns)
    if len(asset) != len(market) or estimation_length < 30 or min(gap, window_before, window_after) < 0:
        raise ValueError("Invalid predeclared event study")
    end = event_index - window_before - gap
    start = end - estimation_length
    if start < 0 or event_index + window_after >= len(asset):
        raise ValueError("Event window or independent estimation history is unavailable")
    model = regression(market[start:end], asset[start:end])
    indices = range(event_index - window_before, event_index + window_after + 1)
    abnormal = [asset[i] - model["intercept"] - model["slope"] * market[i] for i in indices]
    return {"cumulativeAbnormalReturn": fsum(abnormal), "abnormalReturns": abnormal,
            "estimationStart": start, "estimationEndExclusive": end,
            "evidenceType": "association", "uncertainty": None,
            "limitation": "Other contemporaneous news can explain the reaction"}

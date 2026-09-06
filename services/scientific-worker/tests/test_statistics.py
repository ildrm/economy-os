import unittest
from economyos_science.statistics import (chronological_evaluation, describe, drawdown,
    event_study, historical_risk, regression, weighted_summary)
from economyos_science.__main__ import execute


class ScientificCorrectness(unittest.TestCase):
    def test_weighted_mean_and_effective_size(self):
        result = weighted_summary([10, 20, 40], [1, 2, 1])
        self.assertEqual(result['weightedMean'], 22.5)
        self.assertAlmostEqual(result['effectiveSampleSize'], 16 / 6)
        self.assertIsNone(result['uncertainty'])

    def test_invalid_weights(self):
        for weights in ([0, 0], [-1, 2], [1]):
            with self.assertRaises(ValueError):
                weighted_summary([1, 2], weights)

    def test_regression_identity(self):
        result = regression([0, 1, 2, 3], [2, 5, 8, 11])
        self.assertEqual(result['intercept'], 2)
        self.assertEqual(result['slope'], 3)
        self.assertEqual(result['correlation'], 1)

    def test_rejects_invalid_regression(self):
        for x, y in [([1, 1, 1], [2, 3, 4]), ([1, 2, 3], [2, 3]), ([1, float('nan'), 3], [2, 3, 4])]:
            with self.assertRaises(ValueError):
                regression(x, y)

    def test_future_changes_cannot_change_earlier_predictions(self):
        periods = [str(y) for y in range(2000, 2026)]
        values = list(range(26))
        original = chronological_evaluation(values, periods)
        values[-1] = 100000
        changed = chronological_evaluation(values, periods)
        for first, second in zip(original['predictions'], changed['predictions']):
            self.assertEqual(first['prediction'], second['prediction'])
            self.assertLess(first['trainingEnd'], first['targetPeriod'])

    def test_naive_reference_error(self):
        result = chronological_evaluation(list(range(20)), [str(2000 + y) for y in range(20)])
        self.assertEqual(result['scores']['naive']['mae'], 1)
        self.assertEqual(result['scores']['naive']['rmse'], 1)
        self.assertEqual(result['scores']['ar1']['mae'], 0)
        self.assertEqual(result['modelPublication'], 'not_approved')

    def test_no_fabricated_history(self):
        with self.assertRaises(ValueError):
            chronological_evaluation([1] * 15, ['2000'] * 15)

    def test_drawdown_recovery(self):
        result = drawdown([0.1, -0.2, 0.25])
        self.assertAlmostEqual(result['maximumDrawdown'], -0.2)
        self.assertAlmostEqual(result['terminalWealth'], 1.1)

    def test_risk_minimums_and_coverage(self):
        self.assertIsNone(historical_risk([0.01] * 251, 'daily', True)['annualizedVolatility'])
        self.assertEqual(historical_risk([0.01] * 252, 'daily', True)['annualizedVolatility'], 0)
        self.assertIsNone(historical_risk([0.01] * 999, 'daily', True)['expectedShortfall95'])
        self.assertIsNone(historical_risk([0.01] * 1000, 'daily', False)['expectedShortfall95'])
        with self.assertRaises(ValueError):
            historical_risk([0.01] * 1000, 'monthly', True)

    def test_tail_loss_independent_reference(self):
        result = historical_risk([-0.2] * 50 + [0.01] * 950, 'daily', True)
        self.assertAlmostEqual(result['expectedShortfall95'], 0.2)

    def test_event_estimation_excludes_event(self):
        benchmark = [i / 10000 for i in range(150)]
        asset = [0.001 + 2 * x for x in benchmark]
        asset[140] += 0.1
        result = event_study(asset, benchmark, 140)
        self.assertAlmostEqual(result['cumulativeAbnormalReturn'], 0.1)
        self.assertLess(result['estimationEndExclusive'], 139)

    def test_revised_history_remains_revised(self):
        output = execute({'schemaVersion': 1, 'jobId': 'test', 'kind': 'forecast_evaluation',
            'dataset': {'snapshotSha256': 'a' * 64, 'vintage': 'latest_revised_only'},
            'data': {'values': list(range(20)), 'periods': [str(2000 + i) for i in range(20)]}})
        self.assertEqual(output['result']['historicalInterpretation'], 'retrospective_revised_history')
        self.assertEqual(output['publicationStatus'], 'review_required')

    def test_invalid_values(self):
        for values in ([], [float('inf')], [True]):
            with self.assertRaises(ValueError):
                describe(values)


if __name__ == '__main__':
    unittest.main()

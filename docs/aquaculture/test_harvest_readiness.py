"""Pruebas de harvest_readiness.py: estadística de población y proyección de cosecha."""

from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

import harvest_readiness as hr  # noqa: E402


class SummaryTests(unittest.TestCase):
    def test_summarize_basic_stats(self):
        s = hr.summarize([10, 10, 10, 10])
        self.assertEqual(s.n, 4)
        self.assertEqual(s.mean, 10.0)
        self.assertEqual(s.std, 0.0)
        self.assertEqual(s.cv, 0.0)
        self.assertEqual(s.p50, 10.0)

    def test_summarize_empty(self):
        s = hr.summarize([])
        self.assertEqual(s.n, 0)
        self.assertEqual(s.mean, 0.0)

    def test_cv_reflects_dispersion(self):
        uniform = hr.summarize([12, 12, 13, 12, 13])
        spread = hr.summarize([5, 20, 8, 18, 12])
        self.assertLess(uniform.cv, spread.cv)


class AssessSampleTests(unittest.TestCase):
    def _policy(self, **kw):
        return hr.HarvestPolicy(target_length=12.0, min_fraction_at_target=0.8, max_cv=0.20,
                                min_sample=10, **kw)

    def test_insufficient_sample(self):
        a = hr.assess_sample([12, 13, 14], self._policy())
        self.assertFalse(a.ready)
        self.assertIn("insuficiente", a.reason)

    def test_ready_when_uniform_and_at_target(self):
        lengths = list(np.full(50, 13.0) + np.random.default_rng(0).normal(0, 0.3, 50))
        a = hr.assess_sample(lengths, self._policy())
        self.assertTrue(a.ready)
        self.assertGreaterEqual(a.stats.fraction_at_target, 0.8)
        self.assertLessEqual(a.stats.cv, 0.20)

    def test_not_ready_when_undersized(self):
        lengths = list(np.full(50, 9.0) + np.random.default_rng(1).normal(0, 0.3, 50))
        a = hr.assess_sample(lengths, self._policy())
        self.assertFalse(a.ready)
        self.assertIn("talla objetivo", a.reason)

    def test_not_ready_when_uneven_even_if_target_fraction_reached(self):
        # todas alcanzan la talla (fraccion 100%) pero unas pocas gigantes disparan el CV
        lengths = [13.0] * 45 + [30.0] * 5
        a = hr.assess_sample(lengths, self._policy())
        self.assertFalse(a.ready)
        self.assertEqual(a.stats.fraction_at_target, 1.0)
        self.assertIn("disparejo", a.reason)
        self.assertGreater(a.stats.cv, 0.20)


class TrackerTests(unittest.TestCase):
    def _policy(self):
        return hr.HarvestPolicy(target_length=12.0, min_fraction_at_target=0.8, max_cv=0.5, min_sample=10)

    def test_growth_rate_none_with_one_sample(self):
        t = hr.HarvestTracker(self._policy())
        t.add_sample(0, [8.0] * 20)
        self.assertIsNone(t.growth_rate())

    def test_growth_rate_positive_slope(self):
        t = hr.HarvestTracker(self._policy())
        t.add_sample(0, [8.0] * 20)
        t.add_sample(5, [10.0] * 20)
        t.add_sample(10, [12.0] * 20)
        self.assertAlmostEqual(t.growth_rate(), 0.4, places=2)   # 4 mm en 10 dias

    def test_projection_estimates_days_to_target(self):
        t = hr.HarvestTracker(self._policy(), start_date=datetime(2026, 9, 1, tzinfo=timezone.utc))
        t.add_sample(0, [8.0] * 30)
        t.add_sample(5, [9.0] * 30)
        current = [10.0] * 30            # media 10, objetivo 12, crecimiento 0.2/dia -> ~10 dias
        t.add_sample(10, current)
        a = t.assess(current)
        self.assertFalse(a.ready)
        self.assertIsNotNone(a.days_to_harvest)
        self.assertAlmostEqual(a.days_to_harvest, 10.0, delta=1.0)
        self.assertIsNotNone(a.projected_date)
        self.assertGreater(a.growth_rate, 0)

    def test_ready_short_circuits_projection(self):
        t = hr.HarvestTracker(self._policy())
        t.add_sample(0, [8.0] * 30)
        big = list(np.full(30, 13.0))
        t.add_sample(10, big)
        a = t.assess(big)
        self.assertTrue(a.ready)
        self.assertIsNone(a.days_to_harvest)

    def test_no_projection_when_not_growing(self):
        t = hr.HarvestTracker(self._policy())
        t.add_sample(0, [10.0] * 30)
        t.add_sample(10, [10.0] * 30)   # sin crecimiento
        a = t.assess([10.0] * 30)
        self.assertFalse(a.ready)
        self.assertIsNone(a.days_to_harvest)


class IntegrationTests(unittest.TestCase):
    def test_lengths_from_result(self):
        class FakeBlob:
            def __init__(self, length):
                self.length = length
        class FakeResult:
            blobs = [FakeBlob(11.0), FakeBlob(0.0), FakeBlob(13.0)]
        self.assertEqual(hr.lengths_from_result(FakeResult()), [11.0, 13.0])


if __name__ == "__main__":
    unittest.main(verbosity=2)

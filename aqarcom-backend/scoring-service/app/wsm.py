"""
Weighted Sum Model (WSM) scoring — the research core of AqarCom (SRS 4-7, FR-17).

Both criteria are *cost* criteria (lower is better), so relative normalisation is used:

    r_p(i) = min(p) / p(i)          r_d(i) = min(d) / d(i)
    S(i)   = wp * r_p(i) + wd * r_d(i)        with wp + wd = 1

Ordering: S descending. Ties (|ΔS| <= 1e-9) are broken by lower price, then by
earlier submission time (BR-19). The function is pure: it receives data and
returns data, and has no database access whatsoever (BR-16 / CN-03).

The Node.js core contains a line-for-line equivalent (server/src/services/evaluation/wsm.js)
used as the fallback evaluator (FR-19), so both engines always produce the same ranking.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from functools import cmp_to_key
from typing import Iterable

import numpy as np
import pandas as pd

EPS = 1e-9


@dataclass(frozen=True)
class BidInput:
    id: str
    price: float
    duration: float
    submitted_at: datetime


def normalise_cost(values: np.ndarray) -> np.ndarray:
    """Relative normalisation for a cost criterion: min(x) / x  → values in (0, 1]."""
    if np.any(values <= 0):
        raise ValueError("criterion values must be strictly positive")
    return values.min() / values


def rank_bids(bids: Iterable[BidInput], price_weight: int, duration_weight: int, top_n: int = 5) -> list[dict]:
    """
    Score and rank bids.

    :param bids:            active (non-withdrawn) bids
    :param price_weight:    integer percentage 0..100
    :param duration_weight: integer percentage 0..100 (price_weight + duration_weight == 100)
    :param top_n:           size of the shortlist (5 per FR-18)
    :return: list of dicts ordered by rank (1 = best)
    """
    if price_weight + duration_weight != 100:
        raise ValueError("weights must sum to 100")
    bids = list(bids)
    if not bids:
        return []

    df = pd.DataFrame(
        {
            "id": [b.id for b in bids],
            "price": np.array([b.price for b in bids], dtype=float),
            "duration": np.array([b.duration for b in bids], dtype=float),
            "submitted_at": [b.submitted_at for b in bids],
        }
    )
    wp, wd = price_weight / 100.0, duration_weight / 100.0
    df["normalized_price"] = normalise_cost(df["price"].to_numpy())
    df["normalized_duration"] = normalise_cost(df["duration"].to_numpy())
    df["score"] = wp * df["normalized_price"] + wd * df["normalized_duration"]

    rows = df.to_dict(orient="records")

    def compare(a: dict, b: dict) -> int:
        if abs(a["score"] - b["score"]) > EPS:
            return -1 if a["score"] > b["score"] else 1
        if a["price"] != b["price"]:
            return -1 if a["price"] < b["price"] else 1
        if a["submitted_at"] != b["submitted_at"]:
            return -1 if a["submitted_at"] < b["submitted_at"] else 1
        return 0

    rows.sort(key=cmp_to_key(compare))
    out = []
    for rank, r in enumerate(rows[:top_n], start=1):
        out.append(
            {
                "id": r["id"],
                "rank": rank,
                "score": float(r["score"]),
                "normalized_price": float(r["normalized_price"]),
                "normalized_duration": float(r["normalized_duration"]),
                "price": float(r["price"]),
                "duration": int(r["duration"]),
                "submitted_at": r["submitted_at"].isoformat().replace("+00:00", "Z"),
            }
        )
    return out

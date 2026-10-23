from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app
from app.wsm import BidInput, rank_bids

T0 = datetime(2026, 1, 1, tzinfo=timezone.utc)
client = TestClient(app)
H = {"X-Internal-Key": "internal-scoring-key"}


def b(i, p, d, minutes=0):
    return BidInput(str(i), p, d, T0 + timedelta(minutes=minutes))


def test_worked_example():
    # weights 60 / 40
    bids = [b("A", 100_000, 120), b("B", 80_000, 150), b("C", 120_000, 90)]
    r = rank_bids(bids, 60, 40)
    # A: .6*.8 + .4*.75 = .78 ; B: .6*1 + .4*.6 = .84 ; C: .6*.6667 + .4*1 = .8
    assert [x["id"] for x in r] == ["B", "C", "A"]
    assert abs(r[0]["score"] - 0.84) < 1e-9


def test_top5_only():
    bids = [b(i, 100 + i, 10 + i) for i in range(8)]
    assert len(rank_bids(bids, 50, 50)) == 5


def test_tie_lower_price_then_earlier():  # TC-07 / BR-19
    # X and Y have identical score with weights 50/50: X(100,200) Y(200,100)
    bids = [b("Y", 200, 100, 0), b("X", 100, 200, 5)]
    r = rank_bids(bids, 50, 50)
    assert r[0]["id"] == "X"  # lower price wins the tie
    bids = [b("late", 100, 100, 10), b("early", 100, 100, 1)]
    assert rank_bids(bids, 70, 30)[0]["id"] == "early"


def test_api_and_auth():
    payload = {
        "bids": [{"id": "1", "price": 10, "duration": 5, "submitted_at": T0.isoformat()}],
        "weights": {"price": 70, "duration": 30},
    }
    assert client.post("/v1/evaluate", json=payload).status_code == 401
    res = client.post("/v1/evaluate", json=payload, headers=H)
    assert res.status_code == 200
    assert res.json()["results"][0]["rank"] == 1


def test_weights_must_sum_100():
    payload = {"bids": [], "weights": {"price": 70, "duration": 40}}
    assert client.post("/v1/evaluate", json=payload, headers=H).status_code == 422

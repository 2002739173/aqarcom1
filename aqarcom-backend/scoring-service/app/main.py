"""
AqarCom scoring service — internal-only FastAPI microservice (CN-04).

It is purely computational: it never connects to the database (BR-16).
The main backend calls POST /v1/evaluate with a timeout; on any failure it
switches to its in-core fallback evaluator (FR-19).
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import List

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator

from .wsm import BidInput, rank_bids

INTERNAL_KEY = os.getenv("SCORING_API_KEY", "internal-scoring-key")

app = FastAPI(
    title="AqarCom Scoring Service",
    version="1.0.0",
    description="Weighted Sum Model (WSM) evaluation of tender bids — price × duration.",
)


def require_internal_key(x_internal_key: str = Header(default="")) -> None:
    if x_internal_key != INTERNAL_KEY:
        raise HTTPException(status_code=401, detail="invalid internal key")


class BidIn(BaseModel):
    id: str
    price: float = Field(gt=0, description="total price p(i)")
    duration: int = Field(gt=0, description="execution duration in days d(i)")
    submitted_at: datetime


class Weights(BaseModel):
    price: int = Field(ge=0, le=100)
    duration: int = Field(ge=0, le=100)

    @model_validator(mode="after")
    def sum_to_100(self) -> "Weights":
        if self.price + self.duration != 100:
            raise ValueError("price + duration weights must equal 100 (BR-07)")
        return self


class EvaluateRequest(BaseModel):
    bids: List[BidIn]
    weights: Weights
    top_n: int = Field(default=5, ge=1, le=50)

    @field_validator("bids")
    @classmethod
    def unique_ids(cls, v: List[BidIn]) -> List[BidIn]:
        if len({b.id for b in v}) != len(v):
            raise ValueError("bid ids must be unique")
        return v


class ResultOut(BaseModel):
    id: str
    rank: int
    score: float
    normalized_price: float
    normalized_duration: float
    price: float
    duration: int
    submitted_at: str


class EvaluateResponse(BaseModel):
    engine: str = "wsm"
    total_bids: int
    results: List[ResultOut]


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/v1/evaluate", response_model=EvaluateResponse, dependencies=[Depends(require_internal_key)])
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    """Rank the given bids with WSM and return the top-N shortlist."""
    results = rank_bids(
        (BidInput(b.id, b.price, b.duration, b.submitted_at) for b in req.bids),
        req.weights.price,
        req.weights.duration,
        req.top_n,
    )
    return EvaluateResponse(total_bids=len(req.bids), results=results)

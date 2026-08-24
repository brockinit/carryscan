"""Embeddings: Vertex when configured, deterministic stub otherwise."""
from __future__ import annotations

import hashlib
import math
from typing import Sequence

from trader_ai.config import Settings, get_settings

DIM = 64


def stub_embed(text: str, dim: int = DIM) -> list[float]:
    h = hashlib.sha256(text.encode()).digest()
    vals: list[float] = []
    seed = int.from_bytes(h[:8], "big")
    for i in range(dim):
        seed = (1664525 * seed + 1013904223 + i) & 0xFFFFFFFF
        vals.append(((seed % 10000) / 5000.0) - 1.0)
    n = math.sqrt(sum(v * v for v in vals)) or 1.0
    return [v / n for v in vals]


def cosine(a: Sequence[float], b: Sequence[float]) -> float:
    num = sum(x * y for x, y in zip(a, b))
    da = math.sqrt(sum(x * x for x in a)) or 1.0
    db = math.sqrt(sum(y * y for y in b)) or 1.0
    return num / (da * db)


def embed(text: str, settings: Settings | None = None) -> list[float]:
    s = settings or get_settings()
    if not s.vertex_api_key or not s.vertex_base_url:
        return stub_embed(text)
    import httpx

    r = httpx.post(
        f"{s.vertex_base_url.rstrip('/')}/embeddings",
        headers={"Authorization": f"Bearer {s.vertex_api_key}"},
        json={"model": s.embed_model, "input": text},
        timeout=30.0,
    )
    r.raise_for_status()
    data = r.json()
    return list(data["data"][0]["embedding"])

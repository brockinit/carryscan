"""Environment for trader_ai."""
from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql://carryscan:carryscan@localhost:5432/carryscan",
    )
    massive_api_key: str = os.getenv("MASSIVE_API_KEY", "")
    massive_base_url: str = os.getenv(
        "MASSIVE_API_BASE_URL", "https://api.massive.com"
    )
    fmp_api_key: str = os.getenv("FMP_API_KEY", "")
    watchlist: tuple[str, ...] = tuple(
        t.strip().upper()
        for t in os.getenv("TRADER_WATCHLIST", "SPY,SPX").split(",")
        if t.strip()
    )
    vertex_base_url: str = os.getenv("VERTEX_OPENAI_BASE_URL", "")
    vertex_api_key: str = os.getenv("VERTEX_API_KEY", "")
    vertex_model: str = os.getenv(
        "VERTEX_MODEL", "qwen/qwen3-next-80b-thinking-maas"
    )
    grok_base_url: str = os.getenv("GROK_BASE_URL", "https://api.x.ai/v1")
    grok_api_key: str = os.getenv("GROK_API_KEY", "")
    grok_model: str = os.getenv("GROK_MODEL", "grok-4")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-opus-4-5")
    carry_scan_url: str = os.getenv("CARRY_SCAN_URL", "http://localhost:3000")
    embed_model: str = os.getenv("VERTEX_EMBED_MODEL", "text-embedding-005")
    gold_dir: str = os.getenv("TRADER_GOLD_DIR", "/tmp/trader_ai_gold")

    @property
    def massive_enabled(self) -> bool:
        return bool(self.massive_api_key)


def get_settings() -> Settings:
    return Settings()

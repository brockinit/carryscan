"""Environment / defaults for spy_lab."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PKG_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PKG_ROOT / "data"

DTE_TARGETS = (7, 14, 30, 45, 60)


@dataclass(frozen=True)
class Settings:
    gcp_project: str = os.getenv("GCP_PROJECT", "goldman-hax")
    bq_dataset: str = os.getenv("BQ_DATASET", "options_lab")
    gcs_bucket: str = os.getenv("GCS_BUCKET", "damarketdata")
    gcs_day_aggs_prefix: str = os.getenv(
        "GCS_DAY_AGGS_PREFIX", "option_day_aggs"
    )
    massive_api_key: str = os.getenv("MASSIVE_API_KEY", "")
    massive_base_url: str = os.getenv(
        "MASSIVE_API_BASE_URL", "https://api.massive.com"
    )
    # Financial Modeling Prep — economic calendar + SPY EOD fallback
    fmp_api_key: str = os.getenv("FMP_API_KEY", "")
    fmp_base_url: str = os.getenv(
        "FMP_BASE_URL", "https://financialmodelingprep.com"
    )
    underlying: str = os.getenv("UNDERLYING", "SPY")
    risk_free_rate: float = float(os.getenv("RISK_FREE_RATE", "0.04"))
    # Soft guardrail for ad-hoc queries (bytes). Jobs set their own.
    bq_maximum_bytes_billed: int = int(
        os.getenv("BQ_MAXIMUM_BYTES_BILLED", str(10 * 1024**3))  # 10 GiB
    )

    @property
    def table(self) -> str:
        return f"{self.gcp_project}.{self.bq_dataset}"


def get_settings() -> Settings:
    return Settings()

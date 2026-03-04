"""
Exchange rates proxy module.
Fetches ARS/USD rates from ArgentinaDatos API with 15-minute in-memory cache.

API notes:
- Returns 301 redirect → must use follow_redirects=True
- Response field is 'casa' (not 'tipo')
- Available tipos: oficial, blue, bolsa (MEP) — 'mep' does not exist
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# API key → display key exposed to frontend
TIPOS = [
    ("oficial", "oficial"),
    ("blue", "blue"),
    ("bolsa", "mep"),  # API uses 'bolsa', we expose it as 'mep'
]
TIPO_NOMBRES = {
    "oficial": "Oficial / BCRA",
    "blue": "Blue / Informal",
    "mep": "MEP / Bolsa",
}
BASE_URL = "https://api.argentinadatos.com/v1/cotizaciones/dolares"
CACHE_TTL_SECONDS = 15 * 60  # 15 minutes

_cache: dict = {}
_cache_ts: Optional[datetime] = None


def _cache_is_valid() -> bool:
    if _cache_ts is None:
        return False
    elapsed = (datetime.now(timezone.utc) - _cache_ts).total_seconds()
    return elapsed < CACHE_TTL_SECONDS


async def _fetch_tipo(client: httpx.AsyncClient, api_key: str, exposed_key: str) -> dict:
    """Fetch all records for a tipo and return the most recent one."""
    url = f"{BASE_URL}/{api_key}"
    response = await client.get(url, timeout=10.0)
    response.raise_for_status()
    records = response.json()
    if not records:
        raise ValueError(f"No data for tipo '{api_key}'")
    # Records are ordered by date ascending; last is most recent
    latest = records[-1]
    return {
        "tipo": exposed_key,
        "nombre": TIPO_NOMBRES.get(exposed_key, exposed_key),
        "compra": float(latest.get("compra") or 0),
        "venta": float(latest.get("venta") or 0),
        "fecha": latest.get("fecha", ""),
    }


async def get_current_rates() -> list[dict]:
    """Return current compra/venta for oficial, blue, mep. Uses 15-min cache."""
    global _cache, _cache_ts

    if _cache_is_valid() and _cache:
        return list(_cache.values())

    # follow_redirects=True required — API returns 301
    async with httpx.AsyncClient(follow_redirects=True) as client:
        results = []
        for api_key, exposed_key in TIPOS:
            try:
                data = await _fetch_tipo(client, api_key, exposed_key)
                results.append(data)
            except Exception as e:
                logger.warning("Failed to fetch exchange rate for '%s': %s", api_key, e)

    _cache = {r["tipo"]: r for r in results}
    _cache_ts = datetime.now(timezone.utc)
    return results


async def get_rate_history(tipo: str, days: int = 30) -> list[dict]:
    """Return the last N records for a given tipo (for charts)."""
    exposed_keys = [t[1] for t in TIPOS]
    if tipo not in exposed_keys:
        raise ValueError(f"Tipo '{tipo}' not valid. Must be one of {exposed_keys}")

    # Map exposed key back to API key
    api_key = next(ak for ak, ek in TIPOS if ek == tipo)

    url = f"{BASE_URL}/{api_key}"
    async with httpx.AsyncClient(follow_redirects=True) as client:
        response = await client.get(url, timeout=10.0)
        response.raise_for_status()
        records = response.json()

    subset = records[-days:] if len(records) > days else records
    return [
        {
            "fecha": r.get("fecha", ""),
            "compra": float(r.get("compra") or 0),
            "venta": float(r.get("venta") or 0),
        }
        for r in subset
    ]

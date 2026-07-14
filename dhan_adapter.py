"""
Dhan API adapter for GEX Analyzer.
Loads credentials from local environment and wraps the Risk-Management dhan_api integration.
"""

import os
import sys
import logging

logger = logging.getLogger(__name__)

# Resolve Risk-Management path dynamically to support Mac and VPS
possible_paths = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../Risk-Management")),
    "/root/Risk-Management",
    "/Users/radhagopinath/.gemini/antigravity/scratch/Risk-Management"
]

for p in possible_paths:
    if os.path.exists(p) and p not in sys.path:
        sys.path.append(p)

try:
    from dhan_api import DhanAPI
    DHAN_API_AVAILABLE = True
except ImportError as e:
    logger.warning("Could not import DhanAPI from Risk-Management: %s", e)
    DHAN_API_AVAILABLE = False


class DhanAdapter:
    """Wrapper to initialize and call Dhan Option Chain API."""

    def __init__(self, client_id=None, access_token=None):
        self.client_id = client_id or os.getenv("DHAN_CLIENT_ID", "")
        self.access_token = access_token or os.getenv("DHAN_ACCESS_TOKEN", "")
        self.api = None
        self.is_connected = False

        if not DHAN_API_AVAILABLE:
            logger.warning("Dhan API integration is unavailable (import failed). Falling back to mock data.")
            return

        if not self.client_id or not self.access_token:
            logger.info("Dhan Client ID or Access Token not set in .env. Operating in SIMULATION mode.")
            return

        try:
            logger.info("Initializing Dhan API client...")
            self.api = DhanAPI()
            # Reinitialize with credentials loaded from our local .env
            self.api.reinitialize(self.client_id, self.access_token)
            self.is_connected = True
            logger.info("Dhan API adapter successfully initialized.")
        except Exception as e:
            logger.error("Failed to initialize Dhan API client: %s", e)
            self.is_connected = False

    def get_expiry_dates(self, index_name="NIFTY"):
        """Get available expiry dates for the selected index."""
        if not self.is_connected or not self.api:
            return []

        uid_map = {"NIFTY": 13, "BANKNIFTY": 25, "SENSEX": 1}
        underlying_id = uid_map.get(index_name.upper(), 13)

        try:
            expiries = self.api.get_expiry_list(underlying_id=underlying_id)
            return sorted(expiries)
        except Exception as e:
            logger.error("Error fetching expiry list from Dhan for %s: %s", index_name, e)
            return []

    def get_option_chain_data(self, index_name="NIFTY", expiry_date=""):
        """
        Fetch options chain from Dhan.
        Returns a dict with:
           {
             'spot': float,
             'oc': dict (strike: { 'ce': { 'last_price', 'oi', 'volume', 'gamma' }, ... })
           }
        """
        if not self.is_connected or not self.api:
            return None

        index_name = index_name.upper()
        uid_map = {
            "NIFTY": (13, "IDX_I"),
            "BANKNIFTY": (25, "IDX_I"),
            "SENSEX": (1, "BSE_IDX")
        }
        underlying_id, exchange_segment = uid_map.get(index_name, (13, "IDX_I"))

        try:
            logger.info("Fetching option chain for %s, expiry %s...", index_name, expiry_date)
            result = self.api.get_option_chain(
                underlying_id=underlying_id,
                expiry=expiry_date,
                exchange_segment=exchange_segment
            )

            if not isinstance(result, dict) or result.get("status") != "success":
                logger.error("Dhan option chain returned failure status: %s", result)
                return None

            oc_data = result.get("data", {})
            # Unwrap if double nested
            if isinstance(oc_data, dict) and "data" in oc_data and isinstance(oc_data["data"], dict):
                oc_data = oc_data["data"]

            spot = float(oc_data.get("last_price", 0) or 0)
            raw_oc = oc_data.get("oc", {})

            # Standardize output format
            formatted_oc = {}
            for strike_str, sides in raw_oc.items():
                try:
                    strike = float(strike_str)
                except ValueError:
                    continue

                ce = sides.get("ce", {}) or {}
                pe = sides.get("pe", {}) or {}

                formatted_oc[strike] = {
                    "ce": {
                        "last_price": float(ce.get("last_price", 0) or 0),
                        "oi": int(ce.get("oi", 0) or 0),
                        "volume": int(ce.get("volume", 0) or 0),
                    },
                    "pe": {
                        "last_price": float(pe.get("last_price", 0) or 0),
                        "oi": int(pe.get("oi", 0) or 0),
                        "volume": int(pe.get("volume", 0) or 0),
                    }
                }

            return {
                "spot": spot,
                "chain": formatted_oc
            }

        except Exception as e:
            logger.error("Failed to fetch option chain from Dhan: %s", e)
            return None

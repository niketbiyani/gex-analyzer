import os
import math
import logging
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load env variables dynamically, prioritizing the Risk-Management folder configuration
possible_env_paths = [
    os.path.abspath(os.path.join(os.path.dirname(__file__), "../Risk-Management/.env")),
    "/root/Risk-Management/.env",
    "/Users/radhagopinath/.gemini/antigravity/scratch/Risk-Management/.env",
    os.path.abspath(os.path.join(os.path.dirname(__file__), ".env"))
]

loaded_env_path = None
for path in possible_env_paths:
    if os.path.exists(path):
        load_dotenv(path, override=True)
        logger.info("Loaded configuration from: %s", path)
        loaded_env_path = path
        break

if not loaded_env_path:
    load_dotenv()
    logger.info("Loaded configuration from default .env")

app = Flask(__name__)
CORS(app)

# Standard index parameters
INDEX_PARAMS = {
    "NIFTY": {"lot_size": 75, "step": 50, "default_spot": 24080.0},
    "BANKNIFTY": {"lot_size": 15, "step": 100, "default_spot": 52300.0},
    "SENSEX": {"lot_size": 10, "step": 100, "default_spot": 79200.0}
}

# ── Black-Scholes Quantitative Model ───────────────────────────────

def normal_pdf(x):
    """Standard normal probability density function."""
    return math.exp(-x**2 / 2.0) / math.sqrt(2.0 * math.pi)

def normal_cdf(x):
    """Standard normal cumulative distribution function."""
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def bs_price(option_type, S, K, t, r, sigma):
    """
    Calculate Black-Scholes European option price.
    option_type: 'CE' or 'PE'
    S: Spot price
    K: Strike price
    t: Time to expiration (years)
    r: Risk-free rate (decimal, e.g. 0.065)
    sigma: Implied volatility (decimal, e.g. 0.15)
    """
    if t <= 0:
        if option_type == 'CE':
            return max(0.0, S - K)
        else:
            return max(0.0, K - S)

    if sigma <= 0:
        sigma = 0.0001

    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * t) / (sigma * math.sqrt(t))
    d2 = d1 - sigma * math.sqrt(t)

    if option_type == 'CE':
        price = S * normal_cdf(d1) - K * math.exp(-r * t) * normal_cdf(d2)
    else:
        price = K * math.exp(-r * t) * normal_cdf(-d2) - S * normal_cdf(-d1)

    return max(0.0, price)

def implied_volatility(option_type, market_price, S, K, t, r):
    """
    Solve for Implied Volatility (IV) using Bisection Method.
    Returns IV as a decimal.
    """
    if market_price <= 0:
        return 0.12  # Baseline fallback IV (12%)

    # Check intrinsic boundaries
    discount = math.exp(-r * t)
    if option_type == 'CE':
        intrinsic = max(0.0, S - K * discount)
        if market_price <= intrinsic:
            return 0.05  # Lower bound fallback
    else:
        intrinsic = max(0.0, K * discount - S)
        if market_price <= intrinsic:
            return 0.05

    # Bisection search
    low = 0.0001
    high = 5.0  # 500% IV max
    mid = 0.15

    for _ in range(80):
        mid = (low + high) / 2.0
        price_mid = bs_price(option_type, S, K, t, r, mid)
        
        if abs(price_mid - market_price) < 1e-4:
            break
            
        if price_mid < market_price:
            low = mid
        else:
            high = mid

    return mid

def calculate_gamma(S, K, t, r, sigma):
    """Calculate Black-Scholes Gamma."""
    if t <= 0 or sigma <= 0:
        return 0.0
    
    d1 = (math.log(S / K) + (r + 0.5 * sigma**2) * t) / (sigma * math.sqrt(t))
    gamma_val = normal_pdf(d1) / (S * sigma * math.sqrt(t))
    return gamma_val

# ── GEX Analysis Logic ──────────────────────────────────────────────

def process_gex_chain(spot_price, raw_chain, lot_size, t, r=0.065):
    """
    Process option chain and calculate strike GEX values.
    raw_chain: { strike: { 'ce': { 'last_price', 'oi', 'volume' }, 'pe': { ... } } }
    """
    gex_list = []
    total_gex = 0.0
    
    for strike, sides in sorted(raw_chain.items()):
        ce_data = sides.get("ce", {})
        pe_data = sides.get("pe", {})
        
        ce_price = ce_data.get("last_price", 0.0)
        ce_oi = ce_data.get("oi", 0)
        ce_vol = ce_data.get("volume", 0)
        
        pe_price = pe_data.get("last_price", 0.0)
        pe_oi = pe_data.get("oi", 0)
        pe_vol = pe_data.get("volume", 0)
        
        # Calculate IV
        ce_iv = implied_volatility("CE", ce_price, spot_price, strike, t, r)
        pe_iv = implied_volatility("PE", pe_price, spot_price, strike, t, r)
        
        # Calculate Gamma
        ce_gamma = calculate_gamma(spot_price, strike, t, r, ce_iv)
        pe_gamma = calculate_gamma(spot_price, strike, t, r, pe_iv)
        
        # GEX calculation: OI * Gamma * lot_size * spot * 0.01
        # Net GEX is Call GEX - Put GEX (assumes dealer long calls, short puts)
        # Call GEX is positive, Put GEX is negative
        call_gex = ce_oi * ce_gamma * lot_size * spot_price * 0.01
        put_gex = pe_oi * pe_gamma * lot_size * spot_price * 0.01
        net_gex = call_gex - put_gex
        
        total_gex += net_gex
        
        gex_list.append({
            "strike": strike,
            "call_oi": ce_oi,
            "call_vol": ce_vol,
            "call_iv": round(ce_iv * 100, 2),
            "call_gex": call_gex,
            "put_oi": pe_oi,
            "put_vol": pe_vol,
            "put_iv": round(pe_iv * 100, 2),
            "put_gex": -put_gex,  # Store Put GEX as negative
            "net_gex": net_gex
        })
        
    # Find Call Wall (max Call GEX strike)
    call_wall = 0.0
    max_call_gex = -1.0
    for gex_item in gex_list:
        if gex_item["call_gex"] > max_call_gex:
            max_call_gex = gex_item["call_gex"]
            call_wall = gex_item["strike"]
            
    # Find Put Wall (max Put GEX magnitude strike)
    put_wall = 0.0
    max_put_gex_mag = -1.0
    for gex_item in gex_list:
        # Note put_gex is stored as negative, so take absolute
        if abs(gex_item["put_gex"]) > max_put_gex_mag:
            max_put_gex_mag = abs(gex_item["put_gex"])
            put_wall = gex_item["strike"]
            
# Find Gamma Flip Level: Strike where Net GEX changes sign in the ATM region (+/- 5% of spot)
    gamma_flip = spot_price
    atm_gex = [item for item in gex_list if abs(item["strike"] - spot_price) / spot_price <= 0.05]
    if len(atm_gex) > 1:
        atm_gex_sorted = sorted(atm_gex, key=lambda x: x["strike"])
        # Find where net_gex crosses from negative to positive (or vice versa)
        for i in range(len(atm_gex_sorted) - 1):
            s1, g1 = atm_gex_sorted[i]["strike"], atm_gex_sorted[i]["net_gex"]
            s2, g2 = atm_gex_sorted[i+1]["strike"], atm_gex_sorted[i+1]["net_gex"]
            if (g1 <= 0 <= g2) or (g1 >= 0 >= g2):
                if g2 != g1:
                    weight = abs(g1) / abs(g2 - g1)
                    gamma_flip = s1 + (s2 - s1) * weight
                else:
                    gamma_flip = s1
                break
                
    return {
        "spot": spot_price,
        "total_gex": total_gex,
        "call_wall": call_wall,
        "put_wall": put_wall,
        "gamma_flip": round(gamma_flip, 2),
        "chain": gex_list
    }

# ── Simulated Options Feed Generator ──────────────────────────────

def generate_mock_chain(index_name, spot_override=None, days_offset=0):
    """Generate mathematically consistent synthetic options data."""
    params = INDEX_PARAMS.get(index_name.upper(), INDEX_PARAMS["NIFTY"])
    lot_size = params["lot_size"]
    step = params["step"]
    
    # Calculate spot price with some random movement or use override
    if spot_override is not None:
        spot = float(spot_override)
    else:
        # Intraday drift simulation
        base_spot = params["default_spot"]
        time_factor = datetime.now().minute / 60.0
        drift = 80.0 * math.sin(time_factor * math.pi * 2)
        spot = base_spot + drift
        
    # ATM strike
    atm_strike = round(spot / step) * step
    strikes = [atm_strike + i * step for i in range(-15, 16)]
    
    # Options expire in 3 days
    t = max(0.001, (3.0 - days_offset) / 365.25)
    r = 0.065
    
    raw_chain = {}
    
    for strike in strikes:
        # Distance from ATM in steps
        dist = (strike - atm_strike) / step
        
        # Volatility smile (IV skew)
        # Downside strikes have higher IV (fear of crash)
        base_iv = 0.14
        skew = -0.006 * dist
        smile = 0.0015 * dist**2
        iv = max(0.08, base_iv + skew + smile)
        
        # Open Interest simulation
        # OI is clustered around round strikes and ATM
        ce_oi_base = 50000 * math.exp(-0.15 * (dist - 1)**2)
        pe_oi_base = 55000 * math.exp(-0.15 * (dist + 1)**2)
        
        # Add clusters at 100/500/1000 point marks
        if strike % (step * 10) == 0:
            ce_oi_base *= 2.2
            pe_oi_base *= 2.5
        elif strike % (step * 5) == 0:
            ce_oi_base *= 1.6
            pe_oi_base *= 1.8
            
        ce_oi = int(ce_oi_base + 1000)
        pe_oi = int(pe_oi_base + 1200)
        
        # Volume is correlated with OI
        ce_vol = int(ce_oi * 1.5 + 500)
        pe_vol = int(pe_oi * 1.6 + 600)
        
        # Prices matching BS model
        ce_price = bs_price("CE", spot, strike, t, r, iv)
        pe_price = bs_price("PE", spot, strike, t, r, iv)
        
        # Add tiny spread noise to make it realistic
        ce_price = round(max(0.05, ce_price), 2)
        pe_price = round(max(0.05, pe_price), 2)
        
        raw_chain[strike] = {
            "ce": {"last_price": ce_price, "oi": ce_oi, "volume": ce_vol},
            "pe": {"last_price": pe_price, "oi": pe_oi, "volume": pe_vol}
        }
        
    return spot, raw_chain, lot_size, t

# ── Flask API Endpoints ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/option-chain', methods=['GET'])
def get_option_chain():
    index_name = request.args.get('index', 'NIFTY').upper()
    spot_override = request.args.get('spot', None)
    
    # Try fetching via Dhan API first
    from dhan_adapter import DhanAdapter
    dhan = DhanAdapter()
    
    data = None
    if dhan.is_connected:
        try:
            # Fetch available expiries and pick the closest one
            expiries = dhan.get_expiry_dates(index_name)
            closest_expiry = expiries[0] if expiries else ""
            
            # Fetch option chain from Dhan API
            data = dhan.get_option_chain_data(index_name, closest_expiry)
            if data and data.get("spot") > 0:
                spot = data["spot"]
                # Apply manual spot override if user adjusted slider
                if spot_override is not None:
                    spot = float(spot_override)
                
                # Assume 3 days to expiry for GEX calculation
                t = 3.0 / 365.25
                lot_size = INDEX_PARAMS.get(index_name, {"lot_size": 75})["lot_size"]
                
                result = process_gex_chain(spot, data["chain"], lot_size, t)
                result["source"] = "DHAN_API"
                result["expiry"] = closest_expiry
                return jsonify(result)
        except Exception as e:
            logger.error("Dhan API fetch failed, falling back to simulated data: %s", e)
            
    # Fallback/Simulation mode
    if spot_override is not None:
        spot_override = float(spot_override)
        
    spot, raw_chain, lot_size, t = generate_mock_chain(index_name, spot_override)
    result = process_gex_chain(spot, raw_chain, lot_size, t)
    result["source"] = "SIMULATION"
    result["expiry"] = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")
    
    return jsonify(result)

@app.route('/api/scan-gex-image', methods=['POST'])
def scan_gex_image():
    """Simulates OCR level detection on GEX chart uploads."""
    if 'file' not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400
        
    # Standard image file checks can go here
    # Since we are doing simulated GEX OCR scan:
    # We will generate realistic extracted levels around a default Nifty price
    import random
    
    spot = 24080.0 + random.uniform(-100.0, 100.0)
    flip = spot + random.uniform(-50.0, 50.0)
    put_wall = round((spot - random.uniform(150.0, 300.0)) / 50.0) * 50.0
    call_wall = round((spot + random.uniform(150.0, 300.0)) / 50.0) * 50.0
    total_gex = random.uniform(2.5e8, 9.5e8) if random.choice([True, False]) else random.uniform(-9.5e8, -2.5e8)
    
    return jsonify({
        "status": "success",
        "filename": file.filename,
        "extracted_levels": {
            "spot_price": round(spot, 2),
            "gamma_flip": round(flip, 2),
            "call_wall": call_wall,
            "put_wall": put_wall,
            "total_gex": round(total_gex, 2)
        }
    })

# ── Start Server ──────────────────────────────────────────────────

if __name__ == '__main__':
    port = int(os.getenv("PORT", 5566))
    host = os.getenv("HOST", "0.0.0.0")
    logger.info("Starting GEX Analyzer on %s:%d", host, port)
    app.run(host=host, port=port, debug=True)

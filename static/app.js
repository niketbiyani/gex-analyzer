// State Management
let currentState = {
    index: 'NIFTY',
    spotOffset: 0.0,
    spotPrice: 0.0,
    priceChange: 0.0,
    totalGex: 0.0,
    callWall: 0.0,
    putWall: 0.0,
    gammaFlip: 0.0,
    chainData: [],
    priceHistory: [],
    flowHistory: [],
    dhanStatus: 'DISCONNECTED',
    source: 'SIMULATION',
    expiry: ''
};

// UI Elements
const indexSelect = document.getElementById('index-select');
const expirySelect = document.getElementById('expiry-select');
const spotSlider = document.getElementById('spot-slider');
const spotOffsetVal = document.getElementById('spot-offset-val');
const resetBtn = document.getElementById('reset-params');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');

// Ticker Display
const currentIndexDisplay = document.getElementById('current-index-display');
const expiryDisplay = document.getElementById('expiry-display');
const spotPriceDisplay = document.getElementById('spot-price-display');
const priceChangeDisplay = document.getElementById('price-change-display');

// Metric Displays
const metricTotalGex = document.getElementById('metric-total-gex');
const metricRegime = document.getElementById('metric-regime');
const metricCallWall = document.getElementById('metric-call-wall');
const metricCallWallDist = document.getElementById('metric-call-wall-dist');
const metricPutWall = document.getElementById('metric-put-wall');
const metricPutWallDist = document.getElementById('metric-put-wall-dist');
const metricGammaFlip = document.getElementById('metric-gamma-flip');
const metricGammaFlipDist = document.getElementById('metric-gamma-flip-dist');

// Strategy Displays
const strategyRegimeBadge = document.getElementById('strategy-regime-badge');
const stratVolatilityText = document.getElementById('strat-volatility-text');
const stratHedgingText = document.getElementById('strat-hedging-text');
const stratPlaybookList = document.getElementById('strat-playbook-list');

// Charts variables
let chartPriceWalls = null;
let chartDeltaOscillator = null;
let chartGexProfile = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    prepopulateHistory();
    setupCharts();
    setupEventListeners();
    fetchGexData();
    
    // Poll for live updates every 3 seconds
    setInterval(fetchGexData, 3000);
});

// Prepopulate 30 minutes of historical data to look premium instantly
function prepopulateHistory() {
    const baseSpot = 24080.0;
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60000);
        const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Simulate a minor downtrend and recovery similar to user's screenshot
        const angle = (29 - i) / 29 * Math.PI * 1.5;
        const spot = baseSpot - 50 * Math.sin(angle) + (Math.random() - 0.5) * 5;
        
        currentState.priceHistory.push({
            time: timeStr,
            spot: spot,
            callWall: 24200.0,
            putWall: 23900.0,
            gammaFlip: 24050.0
        });

        // Simulate Net Delta Flow oscillator
        const flow = 15.0 * Math.cos(angle) + (Math.random() - 0.5) * 2;
        currentState.flowHistory.push({
            time: timeStr,
            flow: flow
        });
    }
}

// ── Chart.js Configurations ────────────────────────────────────────

function setupCharts() {
    // 1. Intraday Price & GEX Walls Chart
    const ctxPrice = document.getElementById('chart-price-walls').getContext('2d');
    chartPriceWalls = new Chart(ctxPrice, {
        type: 'line',
        data: {
            labels: currentState.priceHistory.map(h => h.time),
            datasets: [
                {
                    label: 'Spot Price',
                    data: currentState.priceHistory.map(h => h.spot),
                    borderColor: '#ffffff',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.1,
                    order: 1
                },
                {
                    label: 'Call Wall',
                    data: currentState.priceHistory.map(h => h.callWall),
                    borderColor: '#ffd700',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    order: 2
                },
                {
                    label: 'Put Wall',
                    data: currentState.priceHistory.map(h => h.putWall),
                    borderColor: '#ff007f',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    order: 3
                },
                {
                    label: 'Gamma Flip',
                    data: currentState.priceHistory.map(h => h.gammaFlip),
                    borderColor: '#00f0ff',
                    borderWidth: 1.5,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    order: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(27, 31, 38, 0.5)' },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(27, 31, 38, 0.5)' },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                }
            }
        }
    });

    // 2. Delta Flow Oscillator Chart
    const ctxOsc = document.getElementById('chart-delta-oscillator').getContext('2d');
    chartDeltaOscillator = new Chart(ctxOsc, {
        type: 'line',
        data: {
            labels: currentState.flowHistory.map(h => h.time),
            datasets: [{
                label: 'Delta Flow Pressure',
                data: currentState.flowHistory.map(h => h.flow),
                borderColor: '#00f0ff',
                backgroundColor: 'rgba(0, 240, 255, 0.1)',
                fill: true,
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: 'rgba(27, 31, 38, 0.5)' },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(27, 31, 38, 0.5)' },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                }
            }
        }
    });

    // 3. Strike GEX Profile Chart
    const ctxProfile = document.getElementById('chart-gex-profile').getContext('2d');
    chartGexProfile = new Chart(ctxProfile, {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                label: 'Net GEX',
                data: [],
                backgroundColor: []
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    grid: { color: 'rgba(27, 31, 38, 0.5)' },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { display: false },
                    ticks: { color: '#9ca3af', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// ── Setup Event Listeners ──────────────────────────────────────────

function setupEventListeners() {
    indexSelect.addEventListener('change', (e) => {
        currentState.index = e.target.value;
        // Reset slider when index changes
        spotSlider.value = 0;
        currentState.spotOffset = 0;
        spotOffsetVal.innerText = '0.00%';
        
        // Clear history for new index and fetch
        currentState.priceHistory = [];
        currentState.flowHistory = [];
        prepopulateHistory();
        fetchGexData(true);
    });

    spotSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        currentState.spotOffset = val;
        spotOffsetVal.innerText = (val >= 0 ? '+' : '') + val.toFixed(2) + '%';
        fetchGexData();
    });

    resetBtn.addEventListener('click', () => {
        spotSlider.value = 0;
        currentState.spotOffset = 0;
        spotOffsetVal.innerText = '0.00%';
        fetchGexData();
    });

    // Tab Switching
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
            
            button.classList.add('active');
            const tabId = 'tab-' + button.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // File Drag & Drop Setup
    setupFileDragDrop();
}

// Fetch GEX data from backend
function fetchGexData(resetCharts = false) {
    let url = `/api/option-chain?index=${currentState.index}`;
    
    // If slider is offset, we calculate spot override
    if (currentState.spotOffset !== 0 && currentState.spotPrice > 0) {
        const overrideSpot = currentState.spotPrice * (1 + currentState.spotOffset / 100);
        url += `&spot=${overrideSpot}`;
    }

    fetch(url)
        .then(res => res.json())
        .then(data => {
            updateDashboardState(data, resetCharts);
        })
        .catch(err => {
            logger.error("Failed to fetch GEX from API:", err);
            statusDot.className = 'status-dot';
            statusText.innerText = 'Server Disconnected';
            statusDetail.innerText = 'Check main.py running state';
        });
}

// ── Update Dashboard Elements ──────────────────────────────────────

function updateDashboardState(data, resetCharts = false) {
    currentState.spotPrice = data.spot;
    currentState.totalGex = data.total_gex;
    currentState.callWall = data.call_wall;
    currentState.putWall = data.put_wall;
    currentState.gammaFlip = data.gamma_flip;
    currentState.chainData = data.chain;
    currentState.source = data.source;
    currentState.expiry = data.expiry;

    // Status updates
    statusDot.className = 'status-dot pulsing';
    if (data.source === 'DHAN_API') {
        statusText.innerText = 'Live Dhan API Feed Active';
        statusDetail.innerText = `Index: ${currentState.index} | Expiry: ${data.expiry}`;
    } else {
        statusText.innerText = 'Simulation Mode Active';
        statusDetail.innerText = 'No Dhan credentials set in .env';
    }

    // Main Ticker Display
    currentIndexDisplay.innerText = `${currentState.index} GEX Structure`;
    expiryDisplay.innerText = `Expiry Date: ${data.expiry || 'Loading...'}`;
    spotPriceDisplay.innerText = data.spot.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    // Simulated change
    const pctChange = currentState.spotOffset;
    priceChangeDisplay.innerText = (pctChange >= 0 ? '+' : '') + pctChange.toFixed(2) + '%';
    priceChangeDisplay.className = pctChange >= 0 ? 'ticker-change positive' : 'ticker-change negative';

    // Total GEX metric
    const gexCr = data.total_gex / 1e7; // Express in Crores for Indian context
    metricTotalGex.innerText = (gexCr >= 0 ? '+' : '') + gexCr.toFixed(2) + ' Cr';
    
    const cardGex = document.getElementById('card-total-gex');
    const regimeText = document.getElementById('metric-regime');
    
    if (data.total_gex >= 0) {
        cardGex.className = 'metric-card shadow-glow-cyan';
        regimeText.innerText = 'Positive Gamma Zone';
        regimeText.className = 'metric-subtext pos-value';
        strategyRegimeBadge.innerText = 'Positive Gamma';
        strategyRegimeBadge.className = 'badge pos-value';
    } else {
        cardGex.className = 'metric-card shadow-glow-pink';
        regimeText.innerText = 'Negative Gamma Zone';
        regimeText.className = 'metric-subtext neg-value';
        strategyRegimeBadge.innerText = 'Negative Gamma';
        strategyRegimeBadge.className = 'badge neg-value';
    }

    // Wall Distances
    const callWallDist = ((data.call_wall - data.spot) / data.spot) * 100;
    metricCallWall.innerText = data.call_wall.toLocaleString('en-IN');
    metricCallWallDist.innerText = `Distance: ${callWallDist >= 0 ? '+' : ''}${callWallDist.toFixed(2)}%`;

    const putWallDist = ((data.put_wall - data.spot) / data.spot) * 100;
    metricPutWall.innerText = data.put_wall.toLocaleString('en-IN');
    metricPutWallDist.innerText = `Distance: ${putWallDist >= 0 ? '+' : ''}${putWallDist.toFixed(2)}%`;

    const flipDist = ((data.gamma_flip - data.spot) / data.spot) * 100;
    metricGammaFlip.innerText = data.gamma_flip.toLocaleString('en-IN');
    metricGammaFlipDist.innerText = `Distance: ${flipDist >= 0 ? '+' : ''}${flipDist.toFixed(2)}%`;

    // Append to live charts history
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    currentState.priceHistory.push({
        time: timeStr,
        spot: data.spot,
        callWall: data.call_wall,
        putWall: data.put_wall,
        gammaFlip: data.gamma_flip
    });

    // Maintain max 40 points in history
    if (currentState.priceHistory.length > 40) {
        currentState.priceHistory.shift();
    }

    // Calculate Delta Flow Pressure
    // Delta pressure = Net GEX change relative to flip
    const deltaFlowVal = (data.spot - data.gamma_flip) / (data.call_wall - data.put_wall) * 100;
    currentState.flowHistory.push({
        time: timeStr,
        flow: deltaFlowVal
    });
    if (currentState.flowHistory.length > 40) {
        currentState.flowHistory.shift();
    }

    // Update charts data
    updateCharts(resetCharts);

    // Update quantitative trading recommendations
    updateStrategyRecommendations(data, callWallDist, putWallDist, flipDist);

    // Populate Option Chain table
    updateOptionChainTable(data.chain);
}

// Update charts datasets
function updateCharts(resetCharts) {
    if (!chartPriceWalls || !chartDeltaOscillator || !chartGexProfile) return;

    // 1. Price Line Update
    chartPriceWalls.data.labels = currentState.priceHistory.map(h => h.time);
    chartPriceWalls.data.datasets[0].data = currentState.priceHistory.map(h => h.spot);
    chartPriceWalls.data.datasets[1].data = currentState.priceHistory.map(h => h.callWall);
    chartPriceWalls.data.datasets[2].data = currentState.priceHistory.map(h => h.putWall);
    chartPriceWalls.data.datasets[3].data = currentState.priceHistory.map(h => h.gammaFlip);
    chartPriceWalls.update('none'); // Update without animation for performance

    // 2. Delta Flow update
    chartDeltaOscillator.data.labels = currentState.flowHistory.map(h => h.time);
    chartDeltaOscillator.data.datasets[0].data = currentState.flowHistory.map(h => h.flow);
    chartDeltaOscillator.update('none');

    // 3. Strike profile update
    // Filter strikes to show only strikes around spot (ATM +/- 8 strikes)
    const sortedStrikes = [...currentState.chainData].sort((a,b) => a.strike - b.strike);
    const atmIndex = sortedStrikes.findIndex(s => s.strike >= currentState.spotPrice);
    
    let slicedStrikes = sortedStrikes;
    if (atmIndex !== -1) {
        const start = Math.max(0, atmIndex - 8);
        const end = Math.min(sortedStrikes.length, atmIndex + 9);
        slicedStrikes = sortedStrikes.slice(start, end);
    }

    chartGexProfile.data.labels = slicedStrikes.map(s => s.strike.toLocaleString('en-IN'));
    chartGexProfile.data.datasets[0].data = slicedStrikes.map(s => s.net_gex / 1e6); // Express in Millions
    chartGexProfile.data.datasets[0].backgroundColor = slicedStrikes.map(s => s.net_gex >= 0 ? '#00f0ff' : '#ff007f');
    chartGexProfile.update();
}

// ── Strategy Advisory Logic ────────────────────────────────────────

function updateStrategyRecommendations(data, callWallDist, putWallDist, flipDist) {
    const isPositiveGEX = data.total_gex >= 0;
    
    // 1. Volatility Outlook
    if (isPositiveGEX) {
        stratVolatilityText.innerHTML = `Market makers are in a **Positive Gamma Zone**. They are trading against the market trend (buying dips, selling rallies) to remain hedged. This **dampens volatility**. Expect index spot to remain range-bound between the Walls. Option Implied Volatility (IV) is highly likely to crush.`;
    } else {
        stratVolatilityText.innerHTML = `Market makers are in a **Negative Gamma Zone**. To hedge, they must trade with the trend (selling when price drops, buying when price rises). This **amplifies volatility**. Expect sudden, fast expansions in price. Intraday slippage will be high. Implied Volatility (IV) will likely spike.`;
    }

    // 2. Dynamic Hedging Strategy
    if (isPositiveGEX) {
        if (Math.abs(callWallDist) < 0.25) {
            stratHedgingText.innerHTML = `Spot is hovering at the **Call Wall (${data.call_wall})**. Market makers will dump futures to hedge long call contracts as spot approaches. This acts as a heavy ceiling. If price breaks above, a minor short squeeze could manifest, but rejection is statistical expectation.`;
        } else if (Math.abs(putWallDist) < 0.25) {
            stratHedgingText.innerHTML = `Spot is hovering at the **Put Wall (${data.put_wall})**. Market makers will buy futures to hedge. This acts as a strong structural floor. Expect a support bounce. Long entries here have very high risk-reward setups.`;
        } else {
            stratHedgingText.innerHTML = `Spot is trading in the consolidation channel. Dealers are actively harvesting theta. Volatility decay is high. Adjust delta hedged positions slowly. Scalping breakouts is highly discouraged.`;
        }
    } else {
        if (Math.abs(flipDist) < 0.25) {
            stratHedgingText.innerHTML = `Spot is crossing the **Gamma Flip level (${data.gamma_flip})** into the negative zone. Market makers must quickly dump futures to cover delta risk. This is the **Acceleration Trigger**. Expect selling velocity to multiply rapidly. Liquidity is drying.`;
        } else {
            stratHedgingText.innerHTML = `Spot is deep in **Negative Gamma**. Dealers are short delta. They will aggressively sell rallies and sell breakdowns. Trend-following breakout trades are highly active. Keep stop-losses tight and trailing.`;
        }
    }

    // 3. Option Playbook
    let playbook = '';
    const step = currentState.index === 'NIFTY' ? 50 : 100;
    
    if (isPositiveGEX) {
        playbook += `<li>**Premium Collection**: Sell standard **Iron Condors** or **Short Strangles** centered ATM. High theta decay works in your favor.</li>`;
        playbook += `<li>**Support Bounces**: Buy Bull Call spreads or sell naked puts near Put Wall (**${data.put_wall}**).</li>`;
        playbook += `<li>**Ceiling Rallies**: Sell Call spreads near Call Wall (**${data.call_wall}**) to capture mean reversion.</li>`;
    } else {
        playbook += `<li>**Volatility Play**: Long **Straddles** or **Strangles** to benefit from the expansion in Implied Volatility (IV) and large price moves.</li>`;
        playbook += `<li>**Breakout Buys**: Buy ATM Call or Put options on high-volume breaches of the walls to capture rapid delta acceleration.</li>`;
        playbook += `<li>**Risk Mitigation**: Avoid writing naked options. Extreme tail risk is active. Hold protective long legs on all spreads.</li>`;
    }
    
    stratPlaybookList.innerHTML = playbook;
}

// Option Chain Grid Table
function updateOptionChainTable(chain) {
    const tbody = document.getElementById('options-chain-tbody');
    tbody.innerHTML = '';
    
    // Sort chain by absolute net GEX to show most critical strikes first
    const sortedChain = [...chain].sort((a,b) => b.strike - a.strike);
    
    sortedChain.forEach(row => {
        const tr = document.createElement('tr');
        
        const callGexCr = row.call_gex / 1e7;
        const putGexCr = row.put_gex / 1e7;
        const netGexCr = row.net_gex / 1e7;

        tr.innerHTML = `
            <td class="pos-value">${callGexCr.toFixed(3)} Cr</td>
            <td class="font-code">${row.call_oi.toLocaleString('en-IN')}</td>
            <td>${row.strike.toLocaleString('en-IN')}</td>
            <td class="font-code">${row.put_oi.toLocaleString('en-IN')}</td>
            <td class="neg-value">${putGexCr.toFixed(3)} Cr</td>
            <td class="${netGexCr >= 0 ? 'pos-value' : 'neg-value'}">${netGexCr.toFixed(3)} Cr</td>
        `;
        
        // Highlight active walls
        if (row.strike === currentState.callWall) {
            tr.style.backgroundColor = 'rgba(255, 215, 0, 0.08)';
            tr.style.borderLeft = '3px solid var(--color-gold)';
        } else if (row.strike === currentState.putWall) {
            tr.style.backgroundColor = 'rgba(255, 0, 127, 0.08)';
            tr.style.borderLeft = '3px solid var(--color-pink)';
        }
        
        tbody.appendChild(tr);
    });
}

// ── File Upload OCR Simulation ──────────────────────────────────────

function setupFileDragDrop() {
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('file-input');
    const laserContainer = document.getElementById('scanner-laser-container');
    const ocrPlaceholder = document.getElementById('ocr-placeholder');
    const ocrResults = document.getElementById('ocr-results');
    const ocrStatusBadge = document.getElementById('ocr-status-badge');
    const applyOcrBtn = document.getElementById('apply-ocr-levels');

    let detectedLevels = null;

    // Prevent defaults
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // Add/remove hover styling
    ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('hover'), false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('hover'), false);
    });

    // Handle dropped file
    dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        handleFiles(files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        
        const file = files[0];
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file!');
            return;
        }

        // Trigger scan animation
        dropzone.classList.add('scanning');
        ocrStatusBadge.innerText = 'Scanning Image...';
        ocrStatusBadge.className = 'badge pos-value';
        ocrPlaceholder.innerText = 'Parsing chart data lines and strike coordinates...';
        ocrResults.classList.add('hidden');

        // Create form data and POST to backend
        const formData = new FormData();
        formData.append('file', file);

        // We run a 2-second timeout to show off the scanning laser animation
        setTimeout(() => {
            fetch('/api/scan-gex-image', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(resData => {
                dropzone.classList.remove('scanning');
                ocrStatusBadge.innerText = 'Scan Complete';
                ocrStatusBadge.className = 'badge pos-value';
                ocrPlaceholder.classList.add('hidden');
                ocrResults.classList.remove('hidden');

                detectedLevels = resData.extracted_levels;
                
                // Show results
                document.getElementById('ocr-spot').innerText = detectedLevels.spot_price.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                document.getElementById('ocr-flip').innerText = detectedLevels.gamma_flip.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                document.getElementById('ocr-call-wall').innerText = detectedLevels.call_wall.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                document.getElementById('ocr-put-wall').innerText = detectedLevels.put_wall.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                
                const gexCr = detectedLevels.total_gex / 1e7;
                document.getElementById('ocr-gex').innerText = (gexCr >= 0 ? '+' : '') + gexCr.toFixed(2) + ' Cr';
                document.getElementById('ocr-gex').className = 'row-val font-code ' + (gexCr >= 0 ? 'pos-value' : 'neg-value');
            })
            .catch(err => {
                dropzone.classList.remove('scanning');
                ocrStatusBadge.innerText = 'Scan Failed';
                ocrStatusBadge.className = 'badge neg-value';
                ocrPlaceholder.innerText = 'Error processing GEX image. Please try again.';
                console.error(err);
            });
        }, 2200); // laser scanning timing
    }

    applyOcrBtn.addEventListener('click', () => {
        if (!detectedLevels) return;

        // Apply extracted levels as overrides to our main dashboard
        currentState.spotPrice = detectedLevels.spot_price;
        currentState.callWall = detectedLevels.call_wall;
        currentState.putWall = detectedLevels.put_wall;
        currentState.gammaFlip = detectedLevels.gamma_flip;
        currentState.totalGex = detectedLevels.total_gex;

        // Switch back to Main Analyzer Tab
        document.querySelector('[data-tab="live-gex"]').click();

        // Update dashboard with the new custom GEX levels
        updateDashboardState({
            spot: detectedLevels.spot_price,
            total_gex: detectedLevels.total_gex,
            call_wall: detectedLevels.call_wall,
            put_wall: detectedLevels.put_wall,
            gamma_flip: detectedLevels.gamma_flip,
            chain: currentState.chainData, // Keep existing chain strikes
            source: 'OCR_IMAGE',
            expiry: 'CUSTOM (OCR)'
        }, true);
    });
}

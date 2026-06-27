// Your Anthropic API key — see notes at bottom of file about how to handle this safely
// For local personal use only — NEVER deploy this with a real key in plain JS
const CLAUDE_API_KEY = ''; // <-- paste your key here for local testing

let currentStock = null;
let chatHistory = [];

const REFRESH_INTERVAL = 60_000;
const TAPE_TICKERS = ['AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'JPM', 'V', 'WMT', 'XOM', 'JNJ', 'BRK-B', 'UNH', 'SPY', 'QQQ', 'DIA', 'IWM'];

function proxify(url) {
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
}



async function fetchStockData(ticker) {
    try {
        // Yahoo's chart endpoint includes meta info that has everything we want    
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
        const response = await fetch(proxify(url));

        // !response.ok means HTTP error 
        if (!response.ok) throw new Error('Bad response');

        const data = await response.json();

        // ?. is "optional chaining" — returns undefined instead of crashing if any step is missing
        const result = data?.chart?.result?.[0];
        if (!result) throw new Error('No data');

        const meta = result.meta;

        // named fields, rather than passing raw API response around
        return {
            symbol: meta.symbol,
            name: meta.longName || meta.shortName || meta.symbol,
            exchange: meta.fullExchangeName || meta.exchangeName,
            currency: meta.currency || 'USD',
            price: meta.regularMarketPrice,
            previousClose: meta.chartPreviousClose,
            dayHigh: meta.regularMarketDayHigh,
            dayLow: meta.regularMarketDayLow,
            open: meta.regularMarketOpen,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
            volume: meta.regularMarketVolume,
            marketState: meta.marketState, // REGULAR, PRE, POST, CLOSED
            // below; change in dollars and percent vs prior close
            change: meta.regularMarketPrice - meta.chartPreviousClose,
            changePct: ((meta.regularMarketPrice - meta.chartPreviousClose) / meta.chartPreviousClose) * 100,
        };
    } catch (e) {
        console.error(`Failed to fetch ${ticker}:`, e);
        return null;
    }
}

// Format a number with commas and 2 decimals
function fmtPrice(n) {
    if (n == null) return '—'; //  dash when missing
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format change with sign: + or -
function fmtChange(n) {
    if (n == null) return '—';
    const sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(2);
}

// ormat percent with signs
function fmtPct(n) {
    if (n == null) return '—';
    const sign = n >= 0 ? '+' : '';
    return sign + n.toFixed(2) + '%';
}

// Format large numbers compactly
function fmtCompact(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}


// ticker tape
async function updateTickerTape() {
    const track = document.getElementById('ticker-track');

    const results = await Promise.all(TAPE_TICKERS.map(t => fetchStockData(t)));

    // Filter out nulls (failed fetches) and build the HTML for each ticker
    const html = results
        .filter(r => r !== null)
        .map(r => {
            const dir = r.change >= 0 ? 'up' : 'down';
            const arrow = r.change >= 0 ? '▲' : '▼';
            return `
                <span class="ticker-item">
                    <span class="sym">${r.symbol}</span>
                    <span class="price">${fmtPrice(r.price)}</span>
                    <span class="chg ${dir}">${arrow} ${fmtPct(r.changePct)}</span>
                </span>
            `;
        })
        .join('');

    // Duplicate the content so the scroll loops seamlessly — when the first set
    // scrolls off, the second set is already there continuing the flow
    track.innerHTML = html + html;
}



async function loadStock(ticker) {
    // If no ticker passed in, read it from the search input
    if (!ticker) {
        ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
    } else {
        ticker = ticker.toUpperCase();
    }

    if (!ticker) return; // ignore empty submits

    // Show a loading state while we wait
    const body = document.getElementById('security-body');
    body.innerHTML = `<div class="empty-state"><p class="empty-title">LOADING ${ticker}...</p></div>`;
    document.getElementById('security-meta').textContent = `Loading ${ticker}...`;

    const data = await fetchStockData(ticker);

    if (!data) {
        body.innerHTML = `<div class="empty-state"><p class="empty-title">SYMBOL NOT FOUND</p><p class="empty-sub">Check the ticker and try again</p></div>`;
        document.getElementById('security-meta').textContent = '— Error —';
        return;
    }

    // Save to state so the chat can reference it
    currentStock = data;

    // Update the input box and chat context indicator
    document.getElementById('ticker-input').value = data.symbol;
    document.getElementById('chat-context').textContent = `Context: ${data.symbol}`;
    document.getElementById('security-meta').textContent = `${data.marketState || 'CLOSED'} • ${data.exchange || ''}`;

    // Build the full details panel
    renderStockPanel(data);

    // Highlight the row in the watchlist if this ticker is on it
    renderWatchlist();
}

// Takes a stock data object and writes the detail panel HTML
// Separated from loadStock() so other things (like clicking a watchlist row) can also call it
function renderStockPanel(d) {
    const body = document.getElementById('security-body');
    const dir = d.change >= 0 ? 'up' : 'down';
    const arrow = d.change >= 0 ? '▲' : '▼';

    // Calculate where the current price sits in the day's range (0-100%)
    // Used to draw a little position indicator in the day range bar
    const dayRangePct = d.dayHigh && d.dayLow
        ? ((d.price - d.dayLow) / (d.dayHigh - d.dayLow)) * 100
        : 50;

    const yearRangePct = d.fiftyTwoWeekHigh && d.fiftyTwoWeekLow
        ? ((d.price - d.fiftyTwoWeekLow) / (d.fiftyTwoWeekHigh - d.fiftyTwoWeekLow)) * 100
        : 50;

    // Build the HTML using a template literal (backticks allow multi-line strings + ${} interpolation)
    body.innerHTML = `
        <div class="security-hero">
            <div>
                <div class="security-symbol">${d.symbol}</div>
                <div class="security-name">${d.name}</div>
                <div class="security-exchange">${d.exchange || ''} • ${d.currency}</div>
            </div>
            <div class="security-price-block">
                <div class="security-price">${fmtPrice(d.price)}</div>
                <div class="security-change ${dir}">
                    ${arrow} ${fmtChange(d.change)} (${fmtPct(d.changePct)})
                </div>
            </div>
        </div>

        <div class="section-heading">SESSION DATA</div>
        <div class="stat-grid">
            <div class="stat">
                <div class="stat-label">OPEN</div>
                <div class="stat-value">${fmtPrice(d.open)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">PREV CLOSE</div>
                <div class="stat-value">${fmtPrice(d.previousClose)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DAY HIGH</div>
                <div class="stat-value">${fmtPrice(d.dayHigh)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">DAY LOW</div>
                <div class="stat-value">${fmtPrice(d.dayLow)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">VOLUME</div>
                <div class="stat-value">${fmtCompact(d.volume)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">RANGE POS</div>
                <div class="stat-value">${dayRangePct.toFixed(0)}%</div>
            </div>
        </div>

        <div class="section-heading">52-WEEK RANGE</div>
        <div class="stat-grid">
            <div class="stat">
                <div class="stat-label">52W HIGH</div>
                <div class="stat-value">${fmtPrice(d.fiftyTwoWeekHigh)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">52W LOW</div>
                <div class="stat-value">${fmtPrice(d.fiftyTwoWeekLow)}</div>
            </div>
            <div class="stat">
                <div class="stat-label">YR RANGE POS</div>
                <div class="stat-value">${yearRangePct.toFixed(0)}%</div>
            </div>
            <div class="stat">
                <div class="stat-label">FROM 52W HIGH</div>
                <div class="stat-value">${d.fiftyTwoWeekHigh ? fmtPct(((d.price - d.fiftyTwoWeekHigh) / d.fiftyTwoWeekHigh) * 100) : '—'}</div>
            </div>
        </div>
    `;
}

//  Watchlist
function getWatchlist() {
    const stored = localStorage.getItem('watchlist');
    return stored ? JSON.parse(stored) : [];
}

// Save the list — localStorage only stores strings so we stringify the array
function saveWatchlist(list) {
    localStorage.setItem('watchlist', JSON.stringify(list));
}

// Add the currently-typed ticker to the watchlist
function addToWatchlist() {
    const ticker = document.getElementById('ticker-input').value.trim().toUpperCase();
    if (!ticker) return;

    const list = getWatchlist();
    if (list.includes(ticker)) return; // already there, skip silently

    list.push(ticker);
    saveWatchlist(list);
    renderWatchlist();
}

function removeFromWatchlist(ticker) {
    const list = getWatchlist().filter(t => t !== ticker);
    saveWatchlist(list);
    renderWatchlist();
}

// Render the watchlist panel with live prices for each ticker
async function renderWatchlist() {
    const list = getWatchlist();
    const container = document.getElementById('watchlist-list');

    // Empty state
    if (list.length === 0) {
        container.innerHTML = `<div class="watchlist-empty">No tickers yet.<br>Search a symbol above<br>and click + ADD</div>`;
        return;
    }

    // Show loading rows first so user sees the structure immediately
    container.innerHTML = list.map(t => `
        <div class="watchlist-row" data-ticker="${t}">
            <span class="watchlist-symbol">${t}</span>
            <span class="watchlist-price" style="color: var(--text-tertiary)">...</span>
            <span class="watchlist-chg">—</span>
        </div>
    `).join('');

    // Fetch all in parallel
    const results = await Promise.all(list.map(t => fetchStockData(t)));

    // Build the final HTML now that we have data
    container.innerHTML = results.map((d, i) => {
        const ticker = list[i];

        // Failed fetch
        if (!d) {
            return `
                <div class="watchlist-row" data-ticker="${ticker}">
                    <span class="watchlist-symbol">
                        <button class="watchlist-remove" onclick="event.stopPropagation(); removeFromWatchlist('${ticker}')">×</button>
                        ${ticker}
                    </span>
                    <span class="watchlist-price" style="color: var(--red)">ERR</span>
                    <span class="watchlist-chg">—</span>
                </div>
            `;
        }

        const dir = d.change >= 0 ? 'up' : 'down';
        // Highlight if this is the currently loaded stock
        const activeClass = (currentStock && currentStock.symbol === d.symbol) ? 'active' : '';

        return `
            <div class="watchlist-row ${activeClass}" data-ticker="${d.symbol}" onclick="loadStock('${d.symbol}')">
                <span class="watchlist-symbol">
                    <button class="watchlist-remove" onclick="event.stopPropagation(); removeFromWatchlist('${d.symbol}')">×</button>
                    ${d.symbol}
                </span>
                <span class="watchlist-price">${fmtPrice(d.price)}</span>
                <span class="watchlist-chg ${dir}">${fmtPct(d.changePct)}</span>
            </div>
        `;
    }).join('');
}

//  CLAUDE CHAT

// Build a system prompt that includes the current stock context if there is one
function buildSystemPrompt() {
    let prompt = `You are an AI financial analyst inside a Bloomberg-style stock terminal. Be concise, direct, and use professional financial language. Use plain text only — no markdown headings or bold. Keep responses focused and actionable. When discussing risk or making forward-looking statements, be measured and note uncertainty appropriately.`;

    if (currentStock) {
        const d = currentStock;
        prompt += `\n\nCURRENTLY LOADED SECURITY:
Symbol: ${d.symbol}
Name: ${d.name}
Exchange: ${d.exchange}
Current Price: ${fmtPrice(d.price)} ${d.currency}
Change: ${fmtChange(d.change)} (${fmtPct(d.changePct)})
Open: ${fmtPrice(d.open)}
Previous Close: ${fmtPrice(d.previousClose)}
Day Range: ${fmtPrice(d.dayLow)} - ${fmtPrice(d.dayHigh)}
52-Week Range: ${fmtPrice(d.fiftyTwoWeekLow)} - ${fmtPrice(d.fiftyTwoWeekHigh)}
Volume: ${fmtCompact(d.volume)}
Market State: ${d.marketState}

When the user asks general questions like "what about this stock" or "should I buy this", they mean ${d.symbol}. The user can also ask any other financial question — answer it directly.`;
    }

    return prompt;
}

// Send a message to Claude and stream the response
async function sendChat() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    const messages = document.getElementById('chat-messages');

    // Append user message to the UI
    appendChatMessage('user', text);

    // Add to history so Claude has conversation memory
    chatHistory.push({ role: 'user', content: text });

    // Clear the input
    input.value = '';

    // If no API key set, show instructions instead of crashing
    if (!CLAUDE_API_KEY) {
        appendChatMessage('system', `No API key configured. Open app.js and set CLAUDE_API_KEY at the top.\n\nFor local testing only — see notes at the bottom of app.js about the safe way to handle this.`);
        return;
    }

    // Show a loading bubble while we wait
    const loadingEl = appendChatMessage('assistant', '', true);

    try {
        // Call Claude's Messages API
        // Docs: https://docs.claude.com/en/api/messages
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01',
                // This header lets browser JS call the API. Required for local-only use.
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify({
                model: 'claude-opus-4-7',
                max_tokens: 1024,
                system: buildSystemPrompt(),
                messages: chatHistory
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API error ${response.status}: ${err}`);
        }

        const data = await response.json();
        // Claude's response is in data.content as an array of blocks. Get the text block.
        const replyText = data.content.map(block => block.text || '').join('');

        // Replace the loading bubble with the real response
        loadingEl.classList.remove('chat-msg-loading');
        loadingEl.querySelector('p').textContent = replyText;

        // Add to history so the next message has context
        chatHistory.push({ role: 'assistant', content: replyText });

        // Auto-scroll to the bottom
        messages.scrollTop = messages.scrollHeight;

    } catch (e) {
        loadingEl.classList.remove('chat-msg-loading');
        loadingEl.querySelector('p').textContent = `Error: ${e.message}`;
        console.error(e);
    }
}

// Create and append a chat message element. Returns the element so it can be modified later.
function appendChatMessage(role, text, loading = false) {
    const messages = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `chat-msg chat-msg-${role}` + (loading ? ' chat-msg-loading' : '');

    const labels = { user: 'YOU', assistant: 'CLAUDE', system: 'SYSTEM' };

    div.innerHTML = `
        <span class="msg-label">${labels[role] || role.toUpperCase()}</span>
        <p>${text}</p>
    `;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight; // auto-scroll
    return div;
}

//  CLock functionality
function updateClock() {
    const now = new Date();
   
    const time = now.toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('status-time').textContent = time;
}

//  Key Functionality
// Hit Enter in the search box = load the stock
document.getElementById('ticker-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadStock();
});

// Hit Enter in chat = send the message
document.getElementById('chat-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});







// Initial draw
updateTickerTape();
renderWatchlist();
updateClock();

setInterval(updateTickerTape, REFRESH_INTERVAL);
setInterval(renderWatchlist, REFRESH_INTERVAL);
setInterval(updateClock, 1000);


// ═══════════════════════════════════════════════════════════════════════
// NOTES ON THE API KEY
// ═══════════════════════════════════════════════════════════════════════
//
// Anyone who opens this page in a browser can view its source code, including
// any API key pasted into CLAUDE_API_KEY. For LOCAL personal testing only,
// pasting your key directly is fine. For anything beyond that:
//
// 1. Run a tiny local Node.js proxy that holds the key server-side and forwards
//    requests. The browser calls your proxy at http://localhost:3000, your proxy
//    calls Anthropic with the key attached. ~30 lines of code with Express.
//
// 2. Use a serverless function (Vercel, Cloudflare Workers, Netlify Functions)
//    where the key lives as an environment variable.
//
// 3. Deploy with Anthropic's official patterns — see docs.claude.com
//
// The 'anthropic-dangerous-direct-browser-access' header in the fetch call
// above is Anthropic's explicit acknowledgment that browser-direct calls leak
// the key. They named it that on purpose so you don't ship it by accident.
//
// ═══════════════════════════════════════════════════════════════════════
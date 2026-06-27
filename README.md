# FinSight Terminal

A browser-based, Bloomberg-style financial terminal with live stock data and a built-in Claude AI analyst panel. Built as a learning project to combine my finance focus with hands-on full-stack fundamentals.

---

## What it does

FinSight loads a single security into a detail panel and gives you the information a junior analyst would want at a glance - current price, day range, 52-week range, volume, change, and percent off the 52-week high - alongside a persistent watchlist and a chat-based AI analyst that has the loaded stock as context.

**Core features**

- **Live ticker tape** scrolling the most-watched equities and broad-market ETFs across the top of the page
- **Security panel** showing OHLC, day range, 52-week range, volume, and where the current price sits within each range
- **Persistent watchlist** with live prices and percent change, saved to the browser between sessions
- **AI analyst panel** powered by the Anthropic API, with the currently loaded stock automatically injected as context so questions like "should I be cautious here?" resolve to the right security
- **Auto-refresh** every 60 seconds on tape and watchlist, with a live clock

---

## Stack

- HTML, CSS (CSS variables for theming), vanilla JavaScript - no frameworks
- Yahoo Finance API (via the `allorigins.win` CORS proxy) for market data
- Anthropic Messages API for the AI analyst
- `localStorage` for watchlist persistence

This is intentionally framework-free. The point was to understand the underlying patterns (async fetches, state management, DOM rendering, API integration) before reaching for React.

---

## Setup

1. Clone or download the repo.
2. Open `app.js` and paste your Anthropic API key into the `CLAUDE_API_KEY` constant near the top. Get one at [console.anthropic.com](https://console.anthropic.com).
3. Open `index.html` directly in a browser. No build step.
4. Runs on Claude Opus 4.7.

**The chat panel works only with a key set.** Stock data and the watchlist work without one.

---

## !!! A note on the API key

The key is stored in client-side JavaScript, which means anyone who loads this page can read it from the browser's source view. **This is fine for local personal use and screen-sharing on a private call, but the key must NEVER be committed to a public repo or deployed to a public URL in this form.**

Include a `.gitignore` that excludes `.env` files. The repo ships with `CLAUDE_API_KEY = ''` so the key is never in version control. If you deploy any version of this publicly, move the Anthropic call behind a server-side proxy or serverless function first. See `LEARNINGS.docx` for the full reasoning.

---

## Project structure

```
finsight-terminal/
├── index.html      # Layout: ticker tape, security panel, watchlist, chat
├── styles.css      # Theme, grid, typography (CSS variables for theming)
├── app.js          # All logic - API calls, rendering, state, chat
└── README.md       # You are here
```

The JavaScript is organized in clearly commented sections: config, state, API layer, formatting helpers, ticker tape, stock panel, watchlist, chat, clock, event listeners, and boot. Roughly 600 lines, single file by design - easy to grep, no build pipeline.

---

## What's next (FinSight V2)

V1 served its purpose as a vanilla-JS learning project. V2 will rebuild it on **Next.js + TypeScript + Tailwind**, with the API key safely server-side via API routes and Vercel environment variables, and Postgres (via Supabase) for persistent per-user data. The planned build sequence:

**1. Foundation**
Set up Next.js + TypeScript + Tailwind + auth (Clerk or NextAuth) + Postgres. Get the boring infrastructure right before adding features. Port V1 functionality - security panel, watchlist, ticker tape - with WebSocket price streaming from Alpaca replacing the 60-second Yahoo Finance polling.

**2. Portfolio tab**
A dedicated `/portfolio` route - separate from the main terminal so neither view gets cluttered. Modeled after what you see in a personal Fidelity or Schwab account, but built from scratch with a proper transaction-based data model (every buy/sell logged with ticker, shares, price, and date - positions and P&L computed from that history, not stored separately). The tab shows:

- Total portfolio value, day change, cost basis, and total unrealized gain/loss at the top
- Position table with shares, current price, market value, cost basis, day change, total return, and weight
- Pie chart of position weights and bar chart of sector exposure (Recharts)
- Equity curve showing portfolio value over time vs. SPY/QQQ as a benchmark
- Trade entry modal for logging buys and sells

This data model is also the foundation for the backtester - build it once, correctly, and it powers everything downstream.

**3. Charts**
Lightweight Charts (by TradingView) for the candlestick/OHLC price chart on each security. Recharts for portfolio views. No charts is the biggest visual gap in V1; this closes it.

**4. AI analyst upgrade**
Replace the single-quote context injection with a proper RAG layer - pulling earnings call summaries, analyst price targets, and recent news headlines for the loaded security and injecting the most relevant chunks into the system prompt before each request. Claude goes from reasoning off price action alone to reasoning with actual research material.

**5. Backtester**
A backtester UI that sits on top of a Python signal-generation engine (FastAPI). Pick a strategy (moving average crossover, RSI thresholds, or custom), set parameters, pick a date range, hit run. The Python engine handles data loading, signal computation, position sizing, and risk metrics. Results render as an equity curve, drawdown chart, and trade log in the browser. This is where FinSight and the algorithmic trading bot project converge.

---

## Acknowledgments

This was built as a learning project with Claude as a pair programmer. I designed the architecture, feature set, and product decisions, and worked through the implementation collaboratively - then wrote up everything I learned in `LEARNINGS.docx`. Honest framing matters: the artifact alone is less interesting than the reasoning behind every piece of it, which is what that document is for.

---

*Built by Elijah Hubbard, 2026. Personal learning project - not investment advice, not for production use.*

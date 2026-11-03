# 🌍 Air Quality Dashboard

Two interactive dashboards for analysing the global air-quality dataset
(`data_date.csv`): **27,547 readings · 142 countries · 2022-07-21 → 2026-10-29**.

| App | Stack | Description |
|---|---|---|
| [`aqi-dashboard/`](aqi-dashboard) | HTML · CSS · JS · Chart.js | Static, self-contained website (works by opening `index.html`) |
| [`aqi-gradio-2d/`](aqi-gradio-2d) | Python · Gradio · Plotly | Server-side 2D dashboard with a filterable KPI strip |

Both include a **🤖 AI Insight** panel powered by the **Google Gemini API**
(`google-genai` SDK · Interactions API), which summarises whatever data is currently filtered.

---

## Quick start

### 1. Static website

```bash
# Option A — just open the file
#   double-click aqi-dashboard/index.html

# Option B — serve it
python -m http.server 8123
# → http://127.0.0.1:8123/aqi-dashboard/
```

Enable AI insights:

```bash
cd aqi-dashboard
copy config.example.js config.js   # then paste your key into config.js
```

### 2. Gradio dashboard

```bash
cd aqi-gradio-2d
pip install -r requirements.txt
copy .env.example .env             # then paste your key into .env
python app.py
# → http://127.0.0.1:7860
```

---

## Features

**Static website (`aqi-dashboard/`)**
- KPI cards — average AQI, countries, peak AQI, unhealthy share
- Daily average AQI line chart
- Status distribution doughnut chart
- Top polluted countries bar chart
- Per-country trend chart
- Zero external requests — Chart.js and the dataset are bundled locally

**Gradio 2D dashboard (`aqi-gradio-2d/`)**
- 4 live 2D charts: daily trend · status bars · top-12 countries · mean-vs-peak scatter
- Status dropdown + minimum-AQI slider update everything instantly
- Live KPI markdown strip
- AI insight with automatic model fallback and retry on transient errors

---

## Data

`data_date.csv` — daily AQI snapshot per country.

| Column | Meaning |
|---|---|
| `Date` | ISO date (`YYYY-MM-DD`) |
| `Country` | Country name |
| `Status` | `Good`, `Moderate`, `Unhealthy for Sensitive Groups`, `Unhealthy`, `Very Unhealthy`, `Hazardous` |
| `AQI Value` | Numeric AQI |

The static site also ships `data.json` / `data.js` (pre-converted copies for fast loading).

---

## Configuration

| Variable / file | Where | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | `aqi-gradio-2d/.env` | Gemini key for the Gradio app |
| `GEMINI_MODEL` | `aqi-gradio-2d/.env` | Primary model (default `gemini-3.6-flash`) |
| `GEMINI_FALLBACK_MODELS` | `aqi-gradio-2d/.env` | Comma-separated fallback chain |
| `window.GEMINI_API_KEY` | `aqi-dashboard/config.js` | Gemini key for the static site |

**Model notes:** `gemini-3.8-flash` / `gemini-3.7-flash` can intermittently return
`503 high demand`; `gemini-3.6-flash` is currently the most reliable. The apps retry and
fall back automatically.

---

## ⚠️ Security

- `.env` and `aqi-dashboard/config.js` are **gitignored** — keys are never committed.
- In the static site the key is visible in the browser, so treat it as public. For a
  production deployment, proxy Gemini calls through a small backend instead.

---

## Deployment tips

- **Static site** — any static host works (GitHub Pages, Netlify, Vercel). Note that GitHub
  Pages would need the key committed, which is *not* recommended.
- **Gradio app** — run on a server/VM; `share=True` in `launch()` gives a temporary public link.

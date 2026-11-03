# AeroScope — Static Air Quality Website (2D)

A **self-contained** air-quality dashboard: plain HTML, CSS, JS and Chart.js.
No build step and **no external requests** — Chart.js and the full dataset are bundled,
so `index.html` works by double-clicking it or from any static host.

## Features

- **KPI cards** — average AQI, countries in view, peak AQI, unhealthy+ share
- **Daily Average AQI** line chart
- **Status Distribution** doughnut chart
- **Top Polluted Countries** horizontal bar chart
- **Country AQI Trend** line chart (select a country)
- **🤖 AI Insights** — Gemini summaries built from the currently filtered data

Filters: country · status · date range (all charts update together).

## Files

| File | Purpose |
|---|---|
| `index.html` | Layout and controls |
| `styles.css` | Dark theme |
| `app.js` | Filtering, charts, Gemini calls |
| `chart.umd.min.js` | Chart.js 4.4.1 (vendored) |
| `data.js` / `data.json` | The dataset (27,547 rows) |
| `config.js` | **gitignored** — holds your API key |
| `config.example.js` | Template to copy |

## Enable AI insights

```bash
copy config.example.js config.js
# edit config.js and set:  window.GEMINI_API_KEY = "your-key";
```

Without a key everything else still works; the AI panel shows a message.

## Run

```bash
# simplest
start index.html

# or serve it
python -m http.server 8123
# → http://127.0.0.1:8123/aqi-dashboard/
```

## Regenerating the data files

From the repository root, with `data_date.csv` present, rebuild `data.json` and `data.js`
from the CSV (keep them in sync with the source data).

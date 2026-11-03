# AeroScope — Global Air Quality Dashboard (2D · Gradio)

An interactive **2D** air-quality dashboard built with **Gradio + Plotly**, backed by
`../data_date.csv` (27,547 records · 142 countries · 2022-07-21 → 2026-10-29).

## What it shows

| Panel | Chart |
|---|---|
| Daily Average AQI | line, filled area |
| Status Distribution | horizontal bars (Good → Hazardous) |
| Top Polluted Countries | top 12 by average AQI |
| Mean vs Peak AQI | scatter, one point per country |

Plus a **live KPI strip** (countries · records · days · avg · peak · unhealthy %).

**Controls:** status filter dropdown + minimum-AQI slider — every panel updates instantly.

**🤖 AI Insight** — asks Gemini for three concrete bullets (headline, risks, recommendation)
derived from the filtered metrics.

## Run

```bash
pip install -r requirements.txt
copy .env.example .env     # then set GEMINI_API_KEY
python app.py
```

Open **http://127.0.0.1:7860**

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `GEMINI_API_KEY` | — | Google AI Studio key |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Primary model |
| `GEMINI_FALLBACK_MODELS` | see `.env.example` | Comma-separated fallbacks |
| `GRADIO_SERVER_NAME` | `127.0.0.1` | Bind address |
| `GRADIO_SERVER_PORT` | `7860` | Port |

## Model behaviour

`google-genai` SDK · **Interactions API**, with a fallback chain and one retry per model on
transient `503 high demand` / `429 quota` errors. The response shows which model answered.

| Model | Status observed |
|---|---|
| `gemini-3.6-flash` | ✅ reliable |
| `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-flash-lite-latest` | ✅ working |
| `gemini-3.8-flash`, `gemini-3.7-flash` | ⚠️ intermittent 503 |
| `gemini-2.5-flash` | ❌ retired |

Errors are translated into actionable messages (billing not enabled, key rejected,
model unavailable, rate limit).

## Hosting

For a public deployment, run on a server/VM (`share=True` in `launch()` gives a temporary
public URL). Keep `.env` out of version control.

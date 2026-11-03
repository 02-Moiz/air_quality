"""AeroScope — Global Air Quality Dashboard (2D · Gradio + Plotly).

AI insights use the official google-genai SDK (Interactions API).
"""

import os
import pathlib
import time

from dotenv import load_dotenv

import gradio as gr
import pandas as pd
import plotly.graph_objects as go

BASE_DIR = pathlib.Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash").strip()
# Older/alternative model names to try if the primary one is retired.
GEMINI_FALLBACK_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_FALLBACK_MODELS", "gemini-flash-latest,gemini-3.5-flash").split(",")
    if m.strip()
]
GRADIO_HOST = os.getenv("GRADIO_SERVER_NAME", "127.0.0.1").strip() or "127.0.0.1"
try:
    GRADIO_PORT = int(os.getenv("GRADIO_SERVER_PORT", "7860").strip())
except ValueError:
    GRADIO_PORT = 7860

DATA_PATH = BASE_DIR.parent / "data_date.csv"

STATUSES = [
    "Good",
    "Moderate",
    "Unhealthy",
    "Unhealthy for Sensitive Groups",
    "Very Unhealthy",
    "Hazardous",
]

STATUS_COLORS = {
    "Good": "#34d399",
    "Moderate": "#fbbf24",
    "Unhealthy": "#fb923c",
    "Unhealthy for Sensitive Groups": "#f87171",
    "Very Unhealthy": "#a78bfa",
    "Hazardous": "#fb4d6d",
}


# --------------------------------------------------------------------------- #
# Data
# --------------------------------------------------------------------------- #
def load_dataframe():
    df = pd.read_csv(DATA_PATH)
    df.columns = [c.strip() for c in df.columns]
    df = df.rename(columns={"AQI Value": "aqi"})
    df["date"] = df["Date"].astype(str).str.strip()
    df["country"] = df["Country"].astype(str).str.strip()
    df["status"] = df["Status"].astype(str).str.strip()
    df["aqi"] = pd.to_numeric(df["aqi"], errors="coerce")
    df = df.dropna(subset=["country", "status", "aqi"])
    return df


def get_filtered_df(status_filter, min_aqi):
    df = load_dataframe()
    if status_filter and status_filter != "All":
        df = df[df["status"] == status_filter]
    if min_aqi:
        df = df[df["aqi"] >= min_aqi]
    return df


def compute_country_stats(df):
    rows = []
    for country, grp in df.groupby("country"):
        g = grp.sort_values("date")
        last = g.iloc[-1]
        unhealth_days = int(
            (g["status"].str.startswith("Unhealthy") | (g["status"] == "Hazardous")).sum()
        )
        rows.append(
            {
                "country": country,
                "avg_aqi": float(g["aqi"].mean()),
                "peak_aqi": float(g["aqi"].max()),
                "unhealthy_days": unhealth_days,
                "records": int(len(g)),
                "latest_date": str(last["date"]),
                "latest_aqi": float(last["aqi"]),
                "latest_status": str(last["status"]),
            }
        )
    if not rows:
        return pd.DataFrame(
            columns=[
                "country", "avg_aqi", "peak_aqi", "unhealthy_days",
                "records", "latest_date", "latest_aqi", "latest_status",
            ]
        )
    return pd.DataFrame(rows).sort_values("avg_aqi", ascending=False).reset_index(drop=True)


def summarise(df):
    """Aggregate metrics used by both the KPI strip and the AI prompt."""
    if df.empty:
        return {
            "records": 0, "countries": 0, "avg": 0.0, "peak": 0.0,
            "peak_country": "–", "peak_status": "–", "unhealthy_pct": 0.0,
            "days": 0, "date_from": "–", "date_to": "–",
        }
    unhealth = df["status"].str.startswith("Unhealthy") | (df["status"] == "Hazardous")
    peak_idx = df["aqi"].idxmax()
    dates = sorted(df["date"].unique())
    return {
        "records": len(df),
        "countries": df["country"].nunique(),
        "avg": float(df["aqi"].mean()),
        "peak": float(df["aqi"].max()),
        "peak_country": str(df.loc[peak_idx, "country"]),
        "peak_status": str(df.loc[peak_idx, "status"]),
        "unhealthy_pct": float(unhealth.mean() * 100),
        "days": len(dates),
        "date_from": dates[0],
        "date_to": dates[-1],
    }


# --------------------------------------------------------------------------- #
# Charts (2D only)
# --------------------------------------------------------------------------- #
def _style(fig, height=340):
    fig.update_layout(
        template="plotly_white",
        margin=dict(l=10, r=10, t=48, b=10),
        height=height,
        font=dict(size=12),
    )
    return fig


def build_trend_figure(df):
    fig = go.Figure()
    if not df.empty:
        daily = df.groupby("date", as_index=False)["aqi"].mean().sort_values("date")
        fig.add_trace(
            go.Scatter(
                x=daily["date"].tolist(),
                y=daily["aqi"].round(1).tolist(),
                mode="lines",
                fill="tozeroy",
                line=dict(color="#38bdf8", width=2),
                hovertemplate="%{x}<br>Avg AQI: %{y:.1f}<extra></extra>",
            )
        )
    fig.update_layout(title="Daily Average AQI", xaxis_title="", yaxis_title="AQI")
    return _style(fig, height=360)


def build_status_figure(df):
    fig = go.Figure()
    if not df.empty:
        counts = df["status"].value_counts()
        order = [s for s in STATUSES if s in counts.index]
        fig.add_trace(
            go.Bar(
                x=[int(counts[s]) for s in order],
                y=order,
                orientation="h",
                marker_color=[STATUS_COLORS.get(s, "#94a3b8") for s in order],
                hovertemplate="%{y}: %{x} records<extra></extra>",
            )
        )
    fig.update_layout(title="Status Distribution", xaxis_title="Records", yaxis_title="")
    return _style(fig, height=360)


def build_top_figure(df):
    fig = go.Figure()
    if not df.empty:
        top = compute_country_stats(df).head(12)
        fig.add_trace(
            go.Bar(
                x=top["avg_aqi"].round(1).tolist(),
                y=top["country"].tolist(),
                orientation="h",
                marker_color="#fb7185",
                hovertemplate="%{y}: avg AQI %{x:.1f}<extra></extra>",
            )
        )
    fig.update_layout(title="Top Polluted Countries (avg AQI)", xaxis_title="Avg AQI", yaxis_title="")
    fig.update_yaxes(autorange="reversed")
    return _style(fig, height=360)


def build_scatter_figure(df):
    fig = go.Figure()
    if not df.empty:
        stats = compute_country_stats(df)
        fig.add_trace(
            go.Scatter(
                x=stats["avg_aqi"].round(1).tolist(),
                y=stats["peak_aqi"].round(1).tolist(),
                mode="markers",
                marker=dict(
                    size=9,
                    color=[STATUS_COLORS.get(s, "#94a3b8") for s in stats["latest_status"]],
                    line=dict(width=1, color="#334155"),
                ),
                text=stats["country"].tolist(),
                hovertemplate="%{text}<br>Mean AQI: %{x:.1f}<br>Peak AQI: %{y:.1f}<extra></extra>",
            )
        )
    fig.update_layout(
        title="Mean vs Peak AQI per Country", xaxis_title="Mean AQI", yaxis_title="Peak AQI"
    )
    return _style(fig, height=360)


def kpi_markdown(df):
    s = summarise(df)
    return (
        f"### 📊 {s['countries']} countries · {s['records']:,} records · {s['days']} days\n"
        f"**Average AQI {s['avg']:.1f}** &nbsp;|&nbsp; "
        f"**Peak {s['peak']:.0f}** ({s['peak_country']} · {s['peak_status']}) &nbsp;|&nbsp; "
        f"**Unhealthy+ {s['unhealthy_pct']:.1f}%** &nbsp;|&nbsp; "
        f"*{s['date_from']} → {s['date_to']}*"
    )


def update_all(status_filter, min_aqi):
    df = get_filtered_df(status_filter, min_aqi)
    return (
        kpi_markdown(df),
        build_trend_figure(df),
        build_status_figure(df),
        build_top_figure(df),
        build_scatter_figure(df),
    )


# --------------------------------------------------------------------------- #
# AI (google-genai SDK · Interactions API, with model fallbacks)
# --------------------------------------------------------------------------- #
def build_ai_context(df):
    s = summarise(df)
    stats = compute_country_stats(df)
    if stats.empty:
        return "No data available for the current filters."
    top = stats.head(8)
    lines = [
        f"Records: {s['records']:,} across {s['countries']} countries over {s['days']} days "
        f"({s['date_from']} to {s['date_to']}).",
        f"Average AQI: {s['avg']:.1f}",
        f"Peak AQI: {s['peak']:.0f} in {s['peak_country']} ({s['peak_status']})",
        f"Share of unhealthy-or-worse readings: {s['unhealthy_pct']:.1f}%",
        "Top countries by average AQI: "
        + ", ".join(f"{r['country']} ({r['avg_aqi']:.0f})" for _, r in top.iterrows()),
        "Countries with most unhealthy days: "
        + ", ".join(
            f"{r['country']} ({int(r['unhealthy_days'])})"
            for _, r in stats.sort_values("unhealthy_days", ascending=False).head(5).iterrows()
        ),
    ]
    return "\n".join(lines)


def _explain_error(exc):
    text = str(exc)
    low = text.lower()
    if "high demand" in low or "503" in text or "service_unavailable" in low:
        return (
            "⚠️ **Gemini is experiencing high demand right now.**\n\n"
            "This is temporary on Google's side — please try again in a minute."
        )
    if "billing" in low:
        return (
            "⚠️ **Billing required for this project.**\n\n"
            "Your Gemini API key is valid, but the Google Cloud project that owns it has no "
            "billing enabled, so the Gemini API free tier is unavailable.\n\n"
            "**Fix:** enable billing at https://aistudio.google.com/billing — the insight will "
            "then work immediately, no code changes needed."
        )
    if "api key" in low or "unauthenticated" in low or "permission_denied" in low and "billing" not in low:
        return (
            "⚠️ **API key rejected.**\n\n"
            f"```\n{text[:400]}\n```\n"
            "Create a key at https://aistudio.google.com/apikey"
        )
    if "no longer available" in low or "not found" in low or "404" in low:
        return (
            "⚠️ **Model unavailable.**\n\n"
            f"```\n{text[:400]}\n```\n"
            "Update `GEMINI_MODEL` in `.env` (e.g. `gemini-3.8-flash`)."
        )
    if "429" in text or "quota" in low or "resource_exhausted" in low:
        return f"⚠️ **Rate limit / quota exceeded.**\n\n```\n{text[:400]}\n```"
    return f"⚠️ **AI insight failed.**\n\n```\n{text[:500]}\n```"


def generate_ai_insight(status_filter, min_aqi):
    if not GEMINI_API_KEY:
        return "⚠️ `GEMINI_API_KEY` is not set. Add it to `aqi-gradio-2d/.env`."

    df = get_filtered_df(status_filter, min_aqi)
    context = build_ai_context(df)
    prompt = (
        "You are an environmental scientist analysing global air quality data. "
        "Using ONLY the data context below, write 3 short, concrete bullet points: "
        "the headline situation, the biggest risks, and one actionable recommendation. "
        "Keep it under 120 words.\n\n"
        f"DATA CONTEXT:\n{context}"
    )

    try:
        from google import genai
    except ImportError:
        return "⚠️ The `google-genai` package is missing. Run: `pip install -r requirements.txt`"

    client = genai.Client(api_key=GEMINI_API_KEY)
    models = [GEMINI_MODEL, *GEMINI_FALLBACK_MODELS]
    errors = []

    for model in models:
        for attempt in range(2):  # one retry per model on transient 503
            try:
                interaction = client.interactions.create(model=model, input=prompt)
                text = getattr(interaction, "output_text", None)
                if text and text.strip():
                    return f"*Model: `{model}`*\n\n{text.strip()}"
                errors.append(f"{model}: empty response")
                break
            except Exception as exc:  # noqa: BLE001
                msg = str(exc)
                low = msg.lower()
                errors.append(f"{model}: {msg[:160]}")
                # Hard failures — another model will not help.
                if "billing" in low or "api key" in low or "unauthenticated" in low:
                    return _explain_error(exc)
                # Transient overload/quota — retry once, then next model.
                transient = any(k in low for k in ("503", "high demand", "unavailable", "429", "quota", "resource_exhausted"))
                if transient and attempt == 0:
                    time.sleep(1.5)
                    continue
                break

    return (
        "⚠️ **All Gemini models are temporarily unavailable.**\n\n"
        "Google is reporting high demand / quota limits. Please try again in a minute — "
        "the app automatically tries "
        f"{len(models)} models.\n\n<details><summary>Details</summary>\n\n```\n"
        + "\n".join(errors[-6:])
        + "\n```\n</details>"
    )


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #
_initial = update_all("All", 0)

with gr.Blocks(title="AeroScope · Global Air Quality Dashboard") as demo:
    gr.Markdown("# 🌍 AeroScope — Global Air Quality Dashboard")
    gr.Markdown(
        "Interactive **2D** air-quality dashboard (Gradio + Plotly) powered by "
        "`data_date.csv` — 27,547 readings across 142 countries."
    )

    with gr.Row():
        status_filter = gr.Dropdown(
            choices=["All"] + STATUSES, value="All", label="Status filter", scale=2
        )
        min_aqi = gr.Slider(
            minimum=0, maximum=400, step=1, value=0,
            label="Min AQI (focus on polluted readings)", scale=3,
        )

    kpis = gr.Markdown(_initial[0])

    with gr.Row():
        trend_plot = gr.Plot(value=_initial[1], label="Daily Average AQI", scale=3)
        status_plot = gr.Plot(value=_initial[2], label="Status Distribution", scale=2)

    with gr.Row():
        top_plot = gr.Plot(value=_initial[3], label="Top Polluted Countries")
        scatter_plot = gr.Plot(value=_initial[4], label="Mean vs Peak AQI")

    controls = [status_filter, min_aqi]
    outputs = [kpis, trend_plot, status_plot, top_plot, scatter_plot]
    for control in controls:
        control.change(update_all, inputs=controls, outputs=outputs)

    gr.Markdown("---\n### 🤖 AI Insight")
    with gr.Row():
        ai_btn = gr.Button("Generate AI Insight", variant="primary", scale=1)
        ai_model_note = gr.Markdown(f"*Model: `{GEMINI_MODEL}`*", scale=2)
    ai_out = gr.Markdown("Press **Generate AI Insight** for a summary of the filtered data.")
    ai_btn.click(generate_ai_insight, inputs=controls, outputs=ai_out)


def main():
    print(f"Starting AeroScope 2D on http://{GRADIO_HOST}:{GRADIO_PORT}", flush=True)
    demo.launch(
        server_name=GRADIO_HOST,
        server_port=GRADIO_PORT,
        share=False,
        inbrowser=True,
        theme=gr.themes.Soft(),
    )


if __name__ == "__main__":
    main()

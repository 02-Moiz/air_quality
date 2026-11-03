const GEMINI_API_KEY = window.GEMINI_API_KEY || "";
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"];

const STATUS_COLORS = {
  "Good": "#34d399",
  "Moderate": "#fbbf24",
  "Unhealthy": "#fb923c",
  "Unhealthy for Sensitive Groups": "#f87171",
  "Very Unhealthy": "#a78bfa",
  "Hazardous": "#fb4d6d",
};

const state = { country: "All", status: "All", from: "", to: "" };
let dataset = null;
const charts = {};
let trendVisible = false;

/* ---------- helpers ---------- */

function fmtDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function createChart(ctxId, config) {
  const existing = charts[ctxId];
  if (existing) existing.destroy();
  const chart = new Chart(document.getElementById(ctxId), config);
  charts[ctxId] = chart;
  return chart;
}

/* ---------- init ---------- */

function init() {
  const data = typeof DATASET !== "undefined" ? DATASET : null;
  if (!data) throw new Error("Dataset missing (data.js).");
  dataset = data;

  const countrySel = document.getElementById("countrySelect");
  const statusSel = document.getElementById("statusSelect");
  countrySel.innerHTML = '<option value="All">All Countries</option>';
  for (const c of data.countries) {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    countrySel.appendChild(opt);
  }
  statusSel.innerHTML = '<option value="All">All Statuses</option>';
  for (const s of data.statuses) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    statusSel.appendChild(opt);
  }

  document.getElementById("fromDate").min = data.dates[0];
  document.getElementById("fromDate").max = data.dates[data.dates.length - 1];
  document.getElementById("toDate").min = data.dates[0];
  document.getElementById("toDate").max = data.dates[data.dates.length - 1];

  bindEvents();
  renderAll();
  document.getElementById("topbarMeta").textContent =
    `${new Set(dataset.rows.map((r) => r.country)).size} countries tracked · ${dataset.rowCount.toLocaleString()} records · ${dataset.dates[0]} → ${dataset.dates[dataset.dates.length - 1]}`;
}

function bindEvents() {
  document.getElementById("countrySelect").addEventListener("change", renderAll);
  document.getElementById("statusSelect").addEventListener("change", renderAll);
  document.getElementById("fromDate").addEventListener("change", renderAll);
  document.getElementById("toDate").addEventListener("change", renderAll);
  document.getElementById("resetFilters").addEventListener("click", () => {
    state.country = "All";
    state.status = "All";
    state.from = "";
    state.to = "";
    document.getElementById("countrySelect").value = "All";
    document.getElementById("statusSelect").value = "All";
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";
    renderAll();
  });

  document.getElementById("aiGenerate").addEventListener("click", () => generateInsight((document.getElementById("aiPrompt").value || "").trim()));
  document.getElementById("aiPrompt").addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("aiGenerate").click();
  });
  document.getElementById("aiPresets").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    document.getElementById("aiPrompt").value = chip.dataset.prompt;
    generateInsight(chip.dataset.prompt);
  });
}

/* ---------- filtering & derived data ---------- */

function filteredRows() {
  if (!dataset) return [];
  const from = state.from;
  const to = state.to;
  return dataset.rows.filter((r) => {
    if (state.country !== "All" && r.country !== state.country) return false;
    if (state.status !== "All" && r.status !== state.status) return false;
    if (from && r.date < from) return false;
    if (to && r.date > to) return false;
    return true;
  });
}

function computeDailyAvg(rows) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.date)) map.set(r.date, { sum: 0, n: 0 });
    const e = map.get(r.date);
    e.sum += r.aqi;
    e.n += 1;
  }
  const dates = [...map.keys()].sort();
  const labels = dates.map((d) => fmtDate(d));
  const values = dates.map((d) => +((map.get(d).sum / map.get(d).n).toFixed(1)));
  return { labels, values, dates };
}

function computeStatusDistribution(rows) {
  const counts = new Map();
  for (const r of rows) counts.set(r.status, (counts.get(r.status) || 0) + 1);
  const statuses = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a));
  const data = statuses.map((s) => ({ status: s, count: counts.get(s), color: STATUS_COLORS[s] || "#94a3b8" }));
  return { labels: statuses, data };
}

function computeTopCountries(rows, n = 12) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.country)) map.set(r.country, { sum: 0, n: 0, max: 0, maxStatus: r.status });
    const e = map.get(r.country);
    e.sum += r.aqi;
    e.n += 1;
    if (r.aqi > e.max) { e.max = r.aqi; e.maxStatus = r.status; }
  }
  const arr = [...map.entries()].map(([country, e]) => ({ country, avg: e.sum / e.n, max: e.max, maxStatus: e.maxStatus }));
  arr.sort((a, b) => b.avg - a.avg);
  return arr.slice(0, n);
}

/* ---------- rendering ---------- */

function renderAll() {
  const rows = filteredRows();
  updateTopbar(rows);
  updateKpis(rows);
  renderDailyChart(rows);
  renderStatusChart(rows);
  renderTopChart(rows);
  renderTrend();
}

function updateTopbar(rows) {
  if (!dataset) return;
  const countries = new Set(rows.map((r) => r.country)).size;
  document.getElementById("topbarMeta").textContent =
    `${countries} countries tracked · ${rows.length.toLocaleString()} records · ${dataset.dates[0]} → ${dataset.dates[dataset.dates.length - 1]}`;
}

function updateKpis(rows) {
  const avg = mean(rows.map((r) => r.aqi));
  const peakRow = rows.reduce((best, r) => (r.aqi > best.aqi ? r : best), rows[0] || { aqi: 0 });
  const unhealth = rows.filter((r) => r.status.startsWith("Unhealthy") || r.status === "Hazardous");
  const unhealthPct = rows.length ? (unhealth.length / rows.length) * 100 : 0;

  document.getElementById("kpiAvg").textContent = avg ? avg.toFixed(1) : "–";
  document.getElementById("kpiAvgSub").textContent = rows.length ? `across ${new Set(rows.map((r) => r.country)).size} countries` : "no data";
  document.getElementById("kpiCountries").textContent = new Set(rows.map((r) => r.country)).size;
  document.getElementById("kpiPeak").textContent = peakRow.aqi ? peakRow.aqi.toFixed(1) : "–";
  document.getElementById("kpiPeakSub").textContent = peakRow.country ? `${peakRow.country} · ${peakRow.status}` : "";
  document.getElementById("kpiUnhealthy").textContent = unhealth.length ? unhealth.length.toLocaleString() : "0";
  document.getElementById("kpiUnhealthySub").textContent = rows.length ? `${unhealthPct.toFixed(1)}% of records` : "no data";
}

function renderDailyChart(rows) {
  const { labels, values } = computeDailyAvg(rows);
  const avg = mean(values);
  document.getElementById("dailySubtitle").textContent = rows.length
    ? `${values.length.toLocaleString()} days sampled · filtered avg ${avg ? avg.toFixed(1) : "–"}`
    : "no data";

  createChart("dailyChart", {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Daily Avg AQI",
        data: values,
        borderColor: "#38bdf8",
        backgroundColor: "rgba(56,189,248,0.18)",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8", maxTicksLimit: 12, autoSkip: true, maxRotation: 0 },
          border: { color: "#1e293b" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8" },
          border: { display: false },
        },
      },
    },
  });
}

function renderStatusChart(rows) {
  const { labels, data } = computeStatusDistribution(rows);
  createChart("statusChart", {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: data.map((d) => d.count),
        backgroundColor: data.map((d) => d.color),
        borderColor: "#0f172a",
        borderWidth: 2,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "62%",
      plugins: {
        legend: { position: "right", labels: { boxWidth: 12, color: "#94a3b8", font: { size: 12 } } },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
        },
      },
    },
  });
}

function renderTopChart(rows) {
  const top = computeTopCountries(rows, 12);
  createChart("topChart", {
    type: "bar",
    data: {
      labels: top.map((t) => t.country),
      datasets: [{
        label: "Avg AQI",
        data: top.map((t) => t.avg),
        backgroundColor: "#fb7185",
        hoverBackgroundColor: "#fb7185",
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8" },
          border: { display: false },
        },
        y: {
          grid: { color: "rgba(148,163,184,0.06)" },
          ticks: { color: "#e2e8f0", font: { size: 12 } },
          border: { display: false },
        },
      },
    },
  });
}

function renderTrend() {
  const card = document.getElementById("trendCard");
  const titleEl = document.getElementById("trendTitle");
  const subEl = document.getElementById("trendSubtitle");

  if (state.country === "All") {
    if (trendVisible) { if (charts.country) charts.country.destroy(); charts.country = null; }
    trendVisible = false;
    card.style.display = "none";
    return;
  }

  if (!trendVisible) {
    card.style.display = "";
    trendVisible = true;
  }
  titleEl.textContent = `${state.country} · AQI Trend`;
  const rows = filteredRows().filter((r) => r.country === state.country);
  const { labels, values } = computeDailyAvg(rows);
  subEl.textContent = rows.length ? `${labels.length} days sampled` : "no data";

  const chart = createChart("countryChart", {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Daily Avg AQI",
        data: values,
        borderColor: "#818cf8",
        backgroundColor: "rgba(129,140,248,0.15)",
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          borderColor: "#1e293b",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8", maxTicksLimit: 12, autoSkip: true, maxRotation: 0 },
          border: { color: "#1e293b" },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148,163,184,0.08)" },
          ticks: { color: "#94a3b8" },
          border: { display: false },
        },
      },
    },
  });
  if (chart.width === 0) chart.resize();
}

/* ---------- AI ---------- */

function buildAiContext(rows) {
  const avg = mean(rows.map((r) => r.aqi));
  const daily = computeDailyAvg(rows);
  const top = computeTopCountries(rows, 8);
  const latestDate = rows.length ? [...new Set(rows.map((r) => r.date))].sort().pop() : "";
  const peakRow = rows.reduce((best, r) => (r.aqi > best.aqi ? r : best), rows[0] || { aqi: 0 });
  const unhealth = rows.filter((r) => r.status.startsWith("Unhealthy") || r.status === "Hazardous");
  const unhealthPct = rows.length ? (unhealth.length / rows.length) * 100 : 0;

  const lines = [
    `Date range: ${rows.length ? daily.dates[0] + " to " + daily.dates[daily.dates.length - 1] : "n/a"}`,
    `Countries in scope: ${new Set(rows.map((r) => r.country)).size}`,
    `Average AQI: ${avg ? avg.toFixed(1) : "n/a"}`,
    `Peak AQI: ${peakRow.aqi ? peakRow.aqi.toFixed(1) : "n/a"} (${peakRow.country || "n/a"}, ${peakRow.status || "n/a"})`,
    `Unhealthy or worse: ${unhealth.length} records (${unhealthPct.toFixed(1)}%)`,
    `Top average-polluted countries: ${top.map((t) => `${t.country} (${t.avg.toFixed(0)})`).join(", ") || "n/a"}`,
  ];
  if (unhealth.length) {
    const worst = [...unhealth].sort((a, b) => b.aqi - a.aqi).slice(0, 10);
    lines.push("Most severe readings: " + worst.map((r) => `${r.country} ${r.date} ${r.status} ${r.aqi.toFixed(0)}`).join("; "));
  }
  return lines.join("\n");
}

async function askGemini(prompt, context) {
  let lastError = "Unknown error";
  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: `${prompt}\n\nData context:\n${context}` }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
          }),
        });
        const json = await res.json().catch(() => null);
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (res.ok && text) return { text, model };
        lastError = json?.error?.message || `Gemini request failed (HTTP ${res.status})`;
        const transient = res.status === 503 || res.status === 429 || /high demand|unavailable|quota/i.test(lastError);
        if (transient && attempt === 0) { await new Promise((r) => setTimeout(r, 1200)); continue; }
        break;
      } catch (e) {
        lastError = e.message || String(e);
        break;
      }
    }
  }
  throw new Error(lastError);
}

async function generateInsight(prompt) {
  const p = (prompt || "").trim() || "Summarize the current air quality situation in a few sentences.";
  const btn = document.getElementById("aiGenerate");
  const out = document.getElementById("aiOutput");
  btn.disabled = true;
  out.className = "ai-output loading";
  out.textContent = "Thinking…";
  try {
    const context = buildAiContext(filteredRows());
    const result = await askGemini(p, context);
    out.className = "ai-output";
    out.dataset.model = result.model;
    out.innerHTML = `<div class="ai-model">Model: <code>${result.model}</code></div><div class="ai-text"></div>`;
    out.querySelector(".ai-text").textContent = result.text;
  } catch (e) {
    out.className = "ai-output ai-error";
    out.textContent = "⚠️ Could not get an AI insight. " + (e.message || "Unknown error.");
  } finally {
    btn.disabled = false;
  }
}

/* ---------- bootstrap ---------- */

document.addEventListener("DOMContentLoaded", init);

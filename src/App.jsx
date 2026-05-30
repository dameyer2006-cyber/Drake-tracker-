import { useState, useEffect, useRef } from "react";

const CLIENT_ID = "525fe22b-c12a-4992-b3b5-b7b6e57572d9";
const CLIENT_SECRET = "1ac1598af3c12cc235c66d986252e6659d582339b22407937b3f1fabb9e88969";
const REDIRECT_URI = "https://drake-tracker.vercel.app/callback";

const WHOOP_AVERAGES = {
  hrv: 95, restingHR: 55, respRate: 15.7,
  sleepPerf: 78, hoursVsNeed: 83, consistency: 67,
  efficiency: 95, sleepStress: 6
};

const GOAL_WEIGHT = 185;
const CURRENT_WEIGHT = 150;
const TABS = ["Today", "History", "AI Coach"];

const colors = {
  bg: "#0a0a0f", surface: "#111118", card: "#16161f",
  border: "#1e1e2e", accent: "#f97316", accentDim: "#7c3a10",
  green: "#22c55e", red: "#ef4444", yellow: "#eab308",
  text: "#f1f5f9", muted: "#64748b", subtle: "#1a1a28",
};

function getTodayKey() {
  return new Date().toISOString().split("T")[0];
}

function formatDate(key) {
  const d = new Date(key + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function scoreColor(val, avg, lowerBetter = false) {
  const pct = lowerBetter ? (avg / val) : (val / avg);
  if (pct >= 1.05) return colors.green;
  if (pct >= 0.9) return colors.yellow;
  return colors.red;
}

function Ring({ pct, color, size = 48, stroke = 5 }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(pct / 100, 1);
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={colors.border} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)" }} />
    </svg>
  );
}

function Pill({ label, value, avg, unit = "", lowerBetter = false, isText = false }) {
  const col = isText ? colors.muted : scoreColor(parseFloat(value) || 0, avg, lowerBetter);
  return (
    <div style={{ background: colors.subtle, borderRadius: 12, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4, border: `1px solid ${colors.border}` }}>
      <span style={{ fontSize: 10, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "monospace" }}>{label}</span>
      <span style={{ fontSize: 20, fontWeight: 700, color: col, fontFamily: "'Space Mono', monospace" }}>
        {value || "—"}{value && !isText ? <span style={{ fontSize: 11, color: colors.muted }}>{unit}</span> : ""}
      </span>
      {avg && <span style={{ fontSize: 10, color: colors.muted }}>avg {avg}{unit}</span>}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("Today");
  const [entries, setEntries] = useState({});
  const [today, setToday] = useState({
    weight: "", calories: "", protein: "",
    workoutDone: false, workoutNotes: "",
    whoop: { recovery: "", hrv: "", restingHR: "", respRate: "", sleepPerf: "", hoursVsNeed: "", consistency: "", efficiency: "", sleepStress: "" },
    notes: "",
  });
  const [saved, setSaved] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("whoop");
  const [whoopToken, setWhoopToken] = useState(null);
  const [whoopLoading, setWhoopLoading] = useState(false);
  const [whoopError, setWhoopError] = useState("");
  const aiRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const allEntries = localStorage.getItem("all_entries");
        if (allEntries) setEntries(JSON.parse(allEntries));
      } catch {}
      try {
        const todayData = localStorage.getItem("today_" + getTodayKey());
        if (todayData) setToday(JSON.parse(todayData));
      } catch {}
      const token = localStorage.getItem("whoop_token");
      if (token) setWhoopToken(token);
      const params = new URLSearchParams(window.location.search);
const token = params.get("token");
const refresh = params.get("refresh");
const error = params.get("error");

if (token) {
  localStorage.setItem("whoop_token", token);
  localStorage.setItem("whoop_refresh", refresh);
  setWhoopToken(token);
  await fetchWhoopData(token);
  window.history.replaceState({}, "", "/");
}
if (error) {
  setWhoopError("WHOOP connection failed. Try again.");
  window.history.replaceState({}, "", "/");
}

    })();
  }, []);

  async function exchangeCode(code) {
    setWhoopLoading(true);
    try {
      const res = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        })
      });
      const data = await res.json();
      if (data.access_token) {
        localStorage.setItem("whoop_token", data.access_token);
        localStorage.setItem("whoop_refresh", data.refresh_token);
        setWhoopToken(data.access_token);
        await fetchWhoopData(data.access_token);
      } else {
        setWhoopError("Auth failed. Try connecting again.");
      }
    } catch {
      setWhoopError("Connection error. Try again.");
    }
    setWhoopLoading(false);
  }

  async function fetchWhoopData(token) {
    setWhoopLoading(true);
    setWhoopError("");
    try {
      const [recoveryRes, sleepRes] = await Promise.all([
        fetch("https://api.prod.whoop.com/developer/v1/recovery?limit=1", {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch("https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1", {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const recoveryData = await recoveryRes.json();
      const sleepData = await sleepRes.json();
      const rec = recoveryData?.records?.[0];
      const sleep = sleepData?.records?.[0];
      if (rec) {
        setToday(t => ({
          ...t,
          whoop: {
            ...t.whoop,
            recovery: Math.round(rec.score?.recovery_score ?? 0) + "",
            hrv: Math.round(rec.score?.hrv_rmssd_milli ?? 0) + "",
            restingHR: Math.round(rec.score?.resting_heart_rate ?? 0) + "",
          }
        }));
      }
      if (sleep) {
        const perf = sleep.score?.sleep_performance_percentage;
        const eff = sleep.score?.sleep_efficiency_percentage;
        const cons = sleep.score?.sleep_consistency_percentage;
        const stress = sleep.score?.sleep_disturbance_index;
        const needed = sleep.score?.sleep_needed?.baseline_milli;
        const actual = sleep.score?.stage_summary?.total_in_bed_time_milli;
        const hoursVsNeed = needed && actual ? Math.round((actual / needed) * 100) : "";
        setToday(t => ({
          ...t,
          whoop: {
            ...t.whoop,
            sleepPerf: perf ? Math.round(perf) + "" : "",
            efficiency: eff ? Math.round(eff) + "" : "",
            consistency: cons ? Math.round(cons) + "" : "",
            sleepStress: stress ? stress.toFixed(1) : "",
            hoursVsNeed: hoursVsNeed + "",
          }
        }));
      }
    } catch {
      setWhoopError("Failed to fetch WHOOP data. Try syncing again.");
    }
    setWhoopLoading(false);
  }

  function loginWithWhoop() {
    const scope = "read:recovery read:sleep read:profile read:workout";
    const url = `https://api.prod.whoop.com/oauth/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scope)}`;
    window.location.href = url;
  }

  function logoutWhoop() {
    localStorage.removeItem("whoop_token");
    localStorage.removeItem("whoop_refresh");
    setWhoopToken(null);
  }

  async function saveToday() {
    const key = getTodayKey();
    const newEntries = { ...entries, [key]: today };
    setEntries(newEntries);
    localStorage.setItem("all_entries", JSON.stringify(newEntries));
    localStorage.setItem("today_" + key, JSON.stringify(today));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateWhoop(field, val) {
    setToday(t => ({ ...t, whoop: { ...t.whoop, [field]: val } }));
  }

  const weights = Object.entries(entries)
    .filter(([,e]) => e.weight)
    .sort(([a],[b]) => a.localeCompare(b))
    .map(([k,e]) => ({ date: k, w: parseFloat(e.weight) }));
  const latestWeight = weights.length ? weights[weights.length-1].w : CURRENT_WEIGHT;
  const weightProgress = ((latestWeight - CURRENT_WEIGHT) / (GOAL_WEIGHT - CURRENT_WEIGHT)) * 100;

  const sortedKeys = Object.keys(entries).sort().reverse();
  let streak = 0;
  for (const k of sortedKeys) {
    if (entries[k].calories) streak++;
    else break;
  }

  async function askAI() {
    if (!aiQuery.trim()) return;
    setAiLoading(true);
    setAiResponse("");
    const histSummary = Object.entries(entries).slice(-14).map(([k,e]) =>
      `${k}: weight=${e.weight||"?"}, cal=${e.calories||"?"}, protein=${e.protein||"?"}g, workout=${e.workoutDone?"yes":"no"}, recovery=${e.whoop?.recovery||"?"}%`
    ).join("\n");
    const prompt = `You are a performance coach for Drake, a 19-year-old mechanical engineering student at Iowa State University. His goal is to go from 150 lbs to 185 lbs as fast as possible (lean bulk). He tracks WHOOP recovery and works out regularly.
His recent 2-week log:\n${histSummary}
His WHOOP 6-month averages: HRV ${WHOOP_AVERAGES.hrv}, Resting HR ${WHOOP_AVERAGES.restingHR}, Resp Rate ${WHOOP_AVERAGES.respRate}, Sleep Perf ${WHOOP_AVERAGES.sleepPerf}%, Hours vs Need ${WHOOP_AVERAGES.hoursVsNeed}%, Sleep Consistency ${WHOOP_AVERAGES.consistency}%, Efficiency ${WHOOP_AVERAGES.efficiency}%, Sleep Stress ${WHOOP_AVERAGES.sleepStress}.
Today: weight=${today.weight||"not logged"}, cal=${today.calories||"not logged"}, protein=${today.protein||"not logged"}g, workout=${today.workoutDone?"yes":"no"}, recovery=${today.whoop.recovery||"not logged"}%.
Drake's question: "${aiQuery}"
Be direct, specific, actionable. Under 200 words. No fluff.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      setAiResponse(data.content?.map(b => b.text || "").join("") || "No response.");
    } catch {
      setAiResponse("Error reaching AI. Try again.");
    }
    setAiLoading(false);
  }

  const inputStyle = {
    background: colors.subtle, border: `1px solid ${colors.border}`, borderRadius: 10,
    color: colors.text, padding: "10px 14px", fontSize: 15, width: "100%",
    outline: "none", fontFamily: "'Space Mono', monospace", boxSizing: "border-box",
  };
  const labelStyle = {
    fontSize: 11, color: colors.muted, textTransform: "uppercase",
    letterSpacing: "0.08em", marginBottom: 4, display: "block"
  };
  const sectionBtn = (id, label) => (
    <button onClick={() => setActiveSection(id)} style={{
      padding: "7px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12,
      fontFamily: "monospace", fontWeight: 600, letterSpacing: "0.05em",
      background: activeSection === id ? colors.accent : colors.subtle,
      color: activeSection === id ? "#fff" : colors.muted, transition: "all 0.2s"
    }}>{label}</button>
  );

  return (
    <div style={{ minHeight: "100vh", background: colors.bg, color: colors.text, fontFamily: "'Inter', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{ background: colors.surface, borderBottom: `1px solid ${colors.border}`, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: colors.accent }}>DRAKE.TRACK</div>
          <div style={{ fontSize: 11, color: colors.muted }}>Goal: 185 lbs · {formatDate(getTodayKey())}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Space Mono', monospace", color: latestWeight >= GOAL_WEIGHT ? colors.green : colors.text }}>{latestWeight}<span style={{ fontSize: 12, color: colors.muted }}>lb</span></div>
          <div style={{ fontSize: 10, color: colors.muted }}>{(GOAL_WEIGHT - latestWeight).toFixed(1)} to go</div>
        </div>
      </div>

      <div style={{ padding: "12px 20px 0", background: colors.surface }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: colors.muted, marginBottom: 5 }}>
          <span>150 lb</span>
          <span style={{ color: colors.accent, fontWeight: 700 }}>{Math.max(0, weightProgress).toFixed(1)}% to goal</span>
          <span>185 lb</span>
        </div>
        <div style={{ height: 6, background: colors.border, borderRadius: 99, overflow: "hidden", marginBottom: 12 }}>
          <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, weightProgress))}%`, background: `linear-gradient(90deg, ${colors.accentDim}, ${colors.accent})`, borderRadius: 99, transition: "width 1s ease" }} />
        </div>
      </div>

      <div style={{ display: "flex", background: colors.surface, borderBottom: `1px solid ${colors.border}` }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: "12px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
            background: "none", color: tab === t ? colors.accent : colors.muted,
            borderBottom: tab === t ? `2px solid ${colors.accent}` : "2px solid transparent",
            transition: "all 0.2s", fontFamily: "monospace"
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "16px 20px", maxWidth: 520, margin: "0 auto" }}>
        {tab === "Today" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sectionBtn("whoop", "WHOOP")}
              {sectionBtn("body", "Body")}
              {sectionBtn("workout", "Workout")}
              {sectionBtn("food", "Food")}
            </div>

            {activeSection === "whoop" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>WHOOP Recovery</div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 16, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: whoopToken ? colors.green : colors.text }}>
                      {whoopToken ? "✓ WHOOP Connected" : "Connect WHOOP"}
                    </div>
                    <div style={{ fontSize: 11, color: colors.muted }}>{whoopToken ? "Auto-sync enabled" : "Pull today's data automatically"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {whoopToken && (
                      <button onClick={() => fetchWhoopData(whoopToken)} disabled={whoopLoading} style={{
                        padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer",
                        background: colors.accent, color: "#fff", fontSize: 12, fontFamily: "monospace", fontWeight: 700
                      }}>{whoopLoading ? "..." : "SYNC"}</button>
                    )}
                    <button onClick={whoopToken ? logoutWhoop : loginWithWhoop} style={{
                      padding: "8px 14px", borderRadius: 10, border: `1px solid ${colors.border}`, cursor: "pointer",
                      background: colors.subtle, color: colors.text, fontSize: 12, fontFamily: "monospace"
                    }}>{whoopToken ? "Disconnect" : "Connect"}</button>
                  </div>
                </div>
                {whoopError && <div style={{ fontSize: 12, color: colors.red, padding: "8px 12px", background: colors.red + "11", borderRadius: 8 }}>{whoopError}</div>}
                <div style={{ background: colors.card, borderRadius: 16, padding: 20, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 20 }}>
                  <div style={{ position: "relative", width: 70, height: 70 }}>
                    <Ring pct={parseInt(today.whoop.recovery) || 0} color={scoreColor(parseInt(today.whoop.recovery)||0, 70)} size={70} stroke={6} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, fontFamily: "monospace", color: colors.text }}>
                      {today.whoop.recovery || "—"}
                    </div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStyle}>Recovery %</label>
                    <input type="number" placeholder="0–100" value={today.whoop.recovery}
                      onChange={e => updateWhoop("recovery", e.target.value)} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {[
                    { key: "hrv", label: "HRV (ms)", avg: WHOOP_AVERAGES.hrv, ph: "e.g. 95" },
                    { key: "restingHR", label: "Resting HR", avg: WHOOP_AVERAGES.restingHR, ph: "e.g. 55", lower: true },
                    { key: "respRate", label: "Resp Rate", avg: WHOOP_AVERAGES.respRate, ph: "e.g. 15.7" },
                    { key: "sleepPerf", label: "Sleep Perf %", avg: WHOOP_AVERAGES.sleepPerf, ph: "e.g. 78" },
                    { key: "hoursVsNeed", label: "Hours vs Need %", avg: WHOOP_AVERAGES.hoursVsNeed, ph: "e.g. 83" },
                    { key: "consistency", label: "Consistency %", avg: WHOOP_AVERAGES.consistency, ph: "e.g. 67" },
                    { key: "efficiency", label: "Efficiency %", avg: WHOOP_AVERAGES.efficiency, ph: "e.g. 95" },
                    { key: "sleepStress", label: "Sleep Stress", avg: WHOOP_AVERAGES.sleepStress, ph: "e.g. 6", lower: true },
                  ].map(({ key, label, avg, ph, lower }) => (
                    <div key={key} style={{ background: colors.card, borderRadius: 12, padding: 12, border: `1px solid ${colors.border}` }}>
                      <label style={labelStyle}>{label}</label>
                      <input type="number" placeholder={ph} value={today.whoop[key]}
                        onChange={e => updateWhoop(key, e.target.value)} style={{ ...inputStyle, fontSize: 14, padding: "8px 10px" }} />
                      {today.whoop[key] && (
                        <div style={{ marginTop: 4, fontSize: 10, color: scoreColor(parseFloat(today.whoop[key]), avg, lower) }}>
                          avg: {avg} · {parseFloat(today.whoop[key]) >= avg * 0.9 ? "✓" : "↓"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeSection === "body" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Body Stats</div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 20, border: `1px solid ${colors.border}` }}>
                  <label style={labelStyle}>Today's Weight (lbs)</label>
                  <input type="number" placeholder="e.g. 152.5" value={today.weight}
                    onChange={e => setToday(t => ({ ...t, weight: e.target.value }))} style={{ ...inputStyle, fontSize: 24, fontWeight: 700, padding: "12px 16px" }} />
                  {today.weight && <div style={{ marginTop: 8, fontSize: 12, color: colors.muted }}>{(GOAL_WEIGHT - parseFloat(today.weight)).toFixed(1)} lbs to go</div>}
                </div>
                {weights.length > 1 && (
                  <div style={{ background: colors.card, borderRadius: 16, padding: 16, border: `1px solid ${colors.border}` }}>
                    <div style={{ fontSize: 11, color: colors.muted, marginBottom: 10, fontFamily: "monospace" }}>WEIGHT TREND</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60 }}>
                      {weights.slice(-14).map((w, i) => {
                        const min = Math.min(...weights.map(x => x.w)) - 1;
                        const max = Math.max(GOAL_WEIGHT, ...weights.map(x => x.w)) + 1;
                        const h = ((w.w - min) / (max - min)) * 100;
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "100%", height: `${h}%`, background: colors.accent, borderRadius: "3px 3px 0 0", opacity: i === weights.slice(-14).length - 1 ? 1 : 0.5 }} />
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 9, color: colors.muted }}>
                      <span>{weights.slice(-14)[0]?.date.slice(5)}</span>
                      <span>{latestWeight} lb</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeSection === "workout" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Workout</div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 20, border: `1px solid ${colors.border}`, display: "flex", alignItems: "center", gap: 16 }}>
                  <button onClick={() => setToday(t => ({ ...t, workoutDone: !t.workoutDone }))} style={{
                    width: 52, height: 52, borderRadius: "50%", border: `2px solid ${today.workoutDone ? colors.green : colors.border}`,
                    background: today.workoutDone ? colors.green + "22" : colors.subtle, cursor: "pointer",
                    fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                  }}>{today.workoutDone ? "✓" : "○"}</button>
                  <div>
                    <div style={{ fontWeight: 600, color: today.workoutDone ? colors.green : colors.muted }}>{today.workoutDone ? "Workout done!" : "Tap to log workout"}</div>
                    <div style={{ fontSize: 12, color: colors.muted }}>Track consistency for gains</div>
                  </div>
                </div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 16, border: `1px solid ${colors.border}` }}>
                  <label style={labelStyle}>Workout Notes (exercises, sets, PRs)</label>
                  <textarea placeholder="e.g. Bench 3x8 @ 155, Squat 3x5 @ 185..." value={today.workoutNotes}
                    onChange={e => setToday(t => ({ ...t, workoutNotes: e.target.value }))}
                    style={{ ...inputStyle, height: 100, resize: "vertical" }} />
                </div>
              </div>
            )}

            {activeSection === "food" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>Nutrition</div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 20, border: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Calories</label>
                      <input type="number" placeholder="Target: ~3200" value={today.calories}
                        onChange={e => setToday(t => ({ ...t, calories: e.target.value }))} style={inputStyle} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Protein (g)</label>
                      <input type="number" placeholder="Target: ~185g" value={today.protein}
                        onChange={e => setToday(t => ({ ...t, protein: e.target.value }))} style={inputStyle} />
                    </div>
                  </div>
                  {today.calories && (
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>Calories vs 3200</div>
                        <div style={{ height: 6, background: colors.border, borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${Math.min(100, (today.calories / 3200) * 100)}%`, background: parseInt(today.calories) >= 3200 ? colors.green : colors.accent, borderRadius: 99 }} />
                        </div>
                      </div>
                      {today.protein && (
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10, color: colors.muted, marginBottom: 4 }}>Protein vs 185g</div>
                          <div style={{ height: 6, background: colors.border, borderRadius: 99 }}>
                            <div style={{ height: "100%", width: `${Math.min(100, (today.protein / 185) * 100)}%`, background: parseInt(today.protein) >= 185 ? colors.green : colors.yellow, borderRadius: 99 }} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ background: colors.card, borderRadius: 16, padding: 16, border: `1px solid ${colors.border}` }}>
                  <label style={labelStyle}>Food Notes</label>
                  <textarea placeholder="What did you eat today?" value={today.notes}
                    onChange={e => setToday(t => ({ ...t, notes: e.target.value }))}
                    style={{ ...inputStyle, height: 80, resize: "vertical" }} />
                </div>
              </div>
            )}

            <button onClick={saveToday} style={{
              padding: "14px 0", borderRadius: 14, border: "none", cursor: "pointer",
              background: saved ? colors.green : `linear-gradient(135deg, ${colors.accentDim}, ${colors.accent})`,
              color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "monospace",
              letterSpacing: "0.05em", transition: "all 0.3s"
            }}>{saved ? "✓ SAVED" : "SAVE TODAY"}</button>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ background: colors.card, borderRadius: 12, padding: 14, border: `1px solid ${colors.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: colors.accent }}>{streak}</div>
                <div style={{ fontSize: 11, color: colors.muted }}>day logging streak</div>
              </div>
              <div style={{ background: colors.card, borderRadius: 12, padding: 14, border: `1px solid ${colors.border}`, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "monospace", color: colors.green }}>
                  {Object.values(entries).filter(e => e.workoutDone).length}
                </div>
                <div style={{ fontSize: 11, color: colors.muted }}>workouts logged</div>
              </div>
            </div>
          </div>
        )}

        {tab === "History" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {sortedKeys.length} days logged
            </div>
            {sortedKeys.length === 0 && (
              <div style={{ textAlign: "center", padding: 40, color: colors.muted }}>No entries yet. Start logging today!</div>
            )}
            {sortedKeys.map(key => {
              const e = entries[key];
              return (
                <div key={key} style={{ background: colors.card, borderRadius: 16, padding: 16, border: `1px solid ${colors.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 14 }}>{formatDate(key)}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {e.workoutDone && <span style={{ fontSize: 11, background: colors.green + "22", color: colors.green, padding: "2px 8px", borderRadius: 20 }}>Workout ✓</span>}
                      {e.whoop?.recovery && <span style={{ fontSize: 11, background: colors.accent + "22", color: colors.accent, padding: "2px 8px", borderRadius: 20 }}>{e.whoop.recovery}% rec</span>}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    <Pill label="Weight" value={e.weight} unit=" lb" isText />
                    <Pill label="Cals" value={e.calories} isText />
                    <Pill label="Protein" value={e.protein} unit="g" isText />
                    <Pill label="HRV" value={e.whoop?.hrv} avg={WHOOP_AVERAGES.hrv} />
                  </div>
                  {e.workoutNotes && <div style={{ marginTop: 8, fontSize: 12, color: colors.muted, fontStyle: "italic" }}>"{e.workoutNotes.slice(0, 80)}{e.workoutNotes.length > 80 ? "..." : ""}"</div>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "AI Coach" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: colors.card, borderRadius: 16, padding: 20, border: `1px solid ${colors.border}` }}>
              <div style={{ fontFamily: "monospace", fontSize: 12, color: colors.accent, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>Ask Your Coach</div>
              <textarea
                ref={aiRef}
                placeholder="e.g. Why is my recovery low? Am I eating enough to gain? What should I focus on this week?"
                value={aiQuery}
                onChange={e => setAiQuery(e.target.value)}
                style={{ ...inputStyle, height: 90, resize: "none", marginBottom: 12 }}
              />
              <button onClick={askAI} disabled={aiLoading || !aiQuery.trim()} style={{
                width: "100%", padding: "12px 0", borderRadius: 12, border: "none", cursor: aiLoading ? "not-allowed" : "pointer",
                background: aiLoading ? colors.subtle : `linear-gradient(135deg, ${colors.accentDim}, ${colors.accent})`,
                color: aiLoading ? colors.muted : "#fff", fontSize: 14, fontWeight: 700, fontFamily: "monospace"
              }}>{aiLoading ? "THINKING..." : "ASK COACH →"}</button>
            </div>
            {aiResponse && (
              <div style={{ background: colors.subtle, borderRadius: 16, padding: 20, border: `1px solid ${colors.accent}44` }}>
                <div style={{ fontSize: 11, color: colors.accent, fontFamily: "monospace", marginBottom: 8 }}>COACH SAYS</div>
                <div style={{ fontSize: 14, lineHeight: 1.7, color: colors.text, whiteSpace: "pre-wrap" }}>{aiResponse}</div>
              </div>
            )}
            <div style={{ fontFamily: "monospace", fontSize: 11, color: colors.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>Quick Questions</div>
            {[
              "Am I on track to hit 185 lbs?",
              "How's my sleep quality looking?",
              "What should I eat more of?",
              "How do my recent workouts look?",
            ].map(q => (
              <button key={q} onClick={() => setAiQuery(q)} style={{
                textAlign: "left", padding: "12px 16px", borderRadius: 12, border: `1px solid ${colors.border}`,
                background: colors.card, color: colors.text, cursor: "pointer", fontSize: 13, fontFamily: "inherit"
              }}>{q}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } = from "react";

const CLIENT_ID = "525fe22b-c12a-4992-b3b5-b7b6e57572d9";
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
        const r = await window.storage?.get("all_entries");
        if (r) setEntries(JSON.parse(r.value));
      } catch {}
      try {
        const r = await window.storage?.get("today_" + getTodayKey());
        if (r) setToday(JSON.parse(r.value));
      } catch {}
      // Check for stored WHOOP token
      const token = localStorage.getItem("whoop_token");
      if (token) setWhoopToken(token);

      // Handle OAuth callback
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) {
        await exchangeCode(code);
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
          client_secret: "1ac1598af3c12cc235c66d986252e6659d582339b22407937b3f1fabb9e88969",
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
        setWhoopError("Auth failed. Try again.");
      }
    } catch {
      setWhoopError("Connection error.");
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
            recovery: Math.round(rec.score?.recovery_score ?? "") + "",
            hrv: Math.round(rec.score?.hrv_rmssd_milli ?? "") + "",
            restingHR: Math.round

"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// ── utils ───────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const DOW_MON = ["월", "화", "수", "목", "금", "토", "일"];
const labelDate = (k) => { const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d); return { md: `${m}월 ${d}일`, dow: DOW[dt.getDay()], short: `${m}/${d}` }; };
const sleepMinutes = (bed, wake) => { if (!bed || !wake) return null; const [bh, bm] = bed.split(":").map(Number); const [wh, wm] = wake.split(":").map(Number); let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440; return m; };
const fmtSleep = (m) => m == null ? "—" : (m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`);
const bedMin = (bed) => { if (!bed) return null; const [h, m] = bed.split(":").map(Number); let v = h * 60 + m; if (v < 12 * 60) v += 24 * 60; return v; };
const sleepMood = (m) => {
  if (m == null) return { emoji: "🌙", msg: "오늘 몇 시간 잤어?", sleepy: true };
  const h = m / 60;
  if (h < 5) return { emoji: "🥱", msg: "많이 피곤하겠다…", sleepy: true };
  if (h < 6.5) return { emoji: "😪", msg: "조금 더 자도 좋아", sleepy: true };
  if (h <= 9) return { emoji: "😊", msg: "푹 잤네요!", sleepy: false };
  return { emoji: "💤", msg: "든든하게 충전 완료!", sleepy: false };
};
const greeting = () => { const h = new Date().getHours(); if (h < 6) return "늦은 밤이야"; if (h < 12) return "좋은 아침이야"; if (h < 18) return "좋은 오후야"; if (h < 22) return "좋은 저녁이야"; return "좋은 밤이야"; };
const FIELDS = () => ({ bed: "", wake: "", exercise: false, exNote: "", snack: -1, snackNote: "", meals: { breakfast: "", lunch: "", dinner: "" }, mood: 0, gratitude: ["", "", ""], reflection: "" });
const blankEntry = () => ({ ...FIELDS(), cheers: 0 });
const dataForDb = (e) => { const { cheers, ...rest } = e; return rest; };
const entryFromRow = (row) => { const d = row.data || {}; return { ...FIELDS(), ...d, meals: { breakfast: "", lunch: "", dinner: "", ...(d.meals || {}) }, cheers: row.cheers ?? 0 }; };
// merge server data into local on poll: keep my own edits, take partner's from server, sync cheers on my slot
const mergeDays = (prev, server, me) => {
  const out = {}; const dates = new Set([...Object.keys(prev), ...Object.keys(server)]);
  dates.forEach((dk) => {
    const pd = prev[dk] || {}, sd = server[dk] || {}; const day = {};
    ["a", "b"].forEach((slot) => {
      const ps = pd[slot], ss = sd[slot];
      if (slot === me) { if (ps) day[slot] = { ...ps, cheers: ss ? ss.cheers : ps.cheers }; else if (ss) day[slot] = ss; }
      else { if (ss) day[slot] = ss; else if (ps) day[slot] = ps; }
    });
    if (Object.keys(day).length) out[dk] = day;
  });
  return out;
};
const SNACKS = ["안 먹음", "조금", "보통", "많이"];
const MOODS = ["😞", "😕", "😐", "🙂", "😄"];
const GOALS_DATE = "__goals__";
const defaultGoal = () => ({ bedtime: "23:30", wake: "07:00", sleepHours: 7.5, exerciseWeekly: 4, exerciseDays: [], name: "" });
const VAPID_PUBLIC = "BOi2fKS_xvYbfB75PT7GWfxlY5H_bmxWA-1ySlFSRtCSKutpAB0Ux_MmuUUcp1WCqcxdQofsNv10K1mgvt34RwI";
const urlB64ToUint8 = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(s); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };

const THEME = {
  a: { name: "테사호드관", type: "불꽃", emoji: "🔥", c1: "#FF7043", c2: "#EC4040", soft: "#FFE0CC", soft2: "#FFF0E6", grat: "#FFF7E8", gratLine: "#F2D9A0", gratTxt: "#C98A1E", sky: "linear-gradient(180deg,#FFB37A,#FF8A5B)", glowD: "#3a1f18" },
  b: { name: "지인", type: "페어리", emoji: "✨", c1: "#FF8FB3", c2: "#B07BE0", soft: "#FBD7E8", soft2: "#FFF1F7", grat: "#FFF5FC", gratLine: "#EFC9E2", gratTxt: "#C45C9E", sky: "linear-gradient(180deg,#FFB6D2,#C79BE8)", glowD: "#2e1f3a" },
};

// theme variables for light / night
const themeVars = (t, night) => {
  const base = { "--c1": t.c1, "--c2": t.c2, "--sky": t.sky, "--grattxt": t.gratTxt };
  if (!night) return {
    ...base, "--pageBg": t.soft2, "--glowc": t.soft, "--card": "#ffffff", "--field": "#ffffff",
    "--soft": t.soft, "--soft2": t.soft2, "--grat": t.grat, "--gratline": t.gratLine,
    "--ink": "#3E3531", "--muted": "#AEA399", "--line": "#EFE6DB", "--good": "#F0F8F1",
    "--glass": "rgba(255,255,255,.62)", "--shadow": "rgba(120,90,60,.14)",
  };
  return {
    ...base, "--pageBg": "#171526", "--glowc": t.glowD, "--card": "#232135", "--field": "#2c2a40",
    "--soft": "#3a3752", "--soft2": "#1f1d30", "--grat": "#2a2740", "--gratline": "#403a5e", "--grattxt": "#E7C46B",
    "--ink": "#ECE6DE", "--muted": "#9a94a8", "--line": "rgba(255,255,255,.08)", "--good": "rgba(110,190,140,.14)",
    "--glass": "rgba(30,28,46,.55)", "--shadow": "rgba(0,0,0,.4)",
  };
};

function FireBuddy({ sleepy }) {
  return (
    <svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
      <path d="M40 6c6 12 2 16 8 22 4-2 6-7 5-12 9 9 14 20 14 30 0 16-12 28-27 28S13 62 13 46c0-11 7-21 16-28-1 6 1 11 5 13 4-7-1-13 6-25z" fill="#FF7043" />
      <path d="M40 30c4 6 2 9 5 13 2-1 3-4 3-7 5 6 8 12 8 18 0 9-7 16-16 16s-16-7-16-16c0-6 4-12 9-16-1 4 1 7 3 8 2-4-1-8 4-16z" fill="#FFCA28" />
      {sleepy ? (<path d="M29 52q4 4 8 0M43 52q4 4 8 0" stroke="#3a2a20" strokeWidth="2.4" fill="none" strokeLinecap="round" />)
        : (<><circle cx="33" cy="52" r="4.2" fill="#3a2a20" /><circle cx="47" cy="52" r="4.2" fill="#3a2a20" /><circle cx="34.2" cy="50.6" r="1.4" fill="#fff" /><circle cx="48.2" cy="50.6" r="1.4" fill="#fff" /></>)}
      <ellipse cx="27" cy="58" rx="3.4" ry="2" fill="#FF8A65" opacity=".7" /><ellipse cx="53" cy="58" rx="3.4" ry="2" fill="#FF8A65" opacity=".7" />
      <path d={sleepy ? "M38 59h4" : "M37 58q3 3 6 0"} stroke="#3a2a20" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}
function FairyBuddy() { return <img src="/seal.jpg" alt="지인" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />; }

const LS_CODE = "couple-code", LS_ME = "couple-me", LS_NIGHT = "couple-night";

export default function Page() {
  const [code, setCode] = useState(null);
  const [me, setMe] = useState("a");
  const [ready, setReady] = useState(false);
  const [night, setNight] = useState(false);
  const [view, setView] = useState("today"); // today | review | calendar
  const [codeInput, setCodeInput] = useState("");
  const [meInput, setMeInput] = useState("a");

  const [days, setDays] = useState({});
  const [goals, setGoals] = useState({ a: defaultGoal(), b: defaultGoal() });
  const [date, setDate] = useState(today());
  const [page, setPage] = useState("a");
  const [loading, setLoading] = useState(true);
  const [showGoals, setShowGoals] = useState(false);
  const [monthRef, setMonthRef] = useState(today());
  const [burstKey, setBurstKey] = useState(0);
  const [celebrate, setCelebrate] = useState(null); // {key,msg}
  const [pushState, setPushState] = useState("loading"); // loading|unsupported|off|on|denied|busy
  const [pushMsg, setPushMsg] = useState("");
  const [savedFlash, setSavedFlash] = useState(null);
  const [openSet, setOpenSet] = useState({});
  const [initFilled, setInitFilled] = useState({});
  const saveTimers = useRef({});

  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CODE); const m = localStorage.getItem(LS_ME); const n = localStorage.getItem(LS_NIGHT);
      if (c) { setCode(c); setPage(m === "b" ? "b" : "a"); setMe(m === "b" ? "b" : "a"); }
      if (n === "1") setNight(true); else if (n === "0") setNight(false);
      else { const h = new Date().getHours(); if (h >= 20 || h < 6) setNight(true); }
    } catch (e) {}
    setReady(true);
  }, []);

  // register service worker + detect push capability/state
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setPushState("unsupported"); return; }
    navigator.serviceWorker.register("/sw.js").then(async (reg) => {
      try {
        const sub = await reg.pushManager.getSubscription();
        if (Notification.permission === "denied") setPushState("denied");
        else setPushState(sub ? "on" : "off");
      } catch (e) { setPushState("off"); }
    }).catch(() => setPushState("unsupported"));
  }, []);

  const toggleNight = () => setNight((v) => { const nv = !v; try { localStorage.setItem(LS_NIGHT, nv ? "1" : "0"); } catch (e) {} return nv; });

  useEffect(() => {
    if (!code) return;
    let alive = true;
    const parseRows = (rows) => {
      const nd = {}, ng = { a: defaultGoal(), b: defaultGoal() };
      (rows || []).forEach((r) => {
        if (r.date === GOALS_DATE) ng[r.slot] = { ...defaultGoal(), ...(r.data || {}) };
        else { nd[r.date] = nd[r.date] || {}; nd[r.date][r.slot] = entryFromRow(r); }
      });
      return { nd, ng };
    };
    const load = async (initial) => {
      const { data: rows, error } = await supabase.rpc("gs_get", { p_code: code });
      if (!alive) return;
      if (error) { if (initial) setLoading(false); return; }
      const { nd, ng } = parseRows(rows);
      if (initial) { setDays(nd); setGoals(ng); setLoading(false); }
      else { setDays((prev) => mergeDays(prev, nd, me)); setGoals((prev) => ({ ...ng, [me]: prev[me] })); }
    };
    setLoading(true); load(true);
    const iv = setInterval(() => load(false), 10000);
    return () => { alive = false; clearInterval(iv); };
  }, [code, me]);

  // 날짜/사람 변경 시: 이미 채워진 항목은 접힌 상태로 시작
  useEffect(() => {
    const en = (days[date] && days[date][page]) || blankEntry();
    setOpenSet({});
    setInitFilled({
      ex: !!en.exercise,
      snack: en.snack >= 0,
      mood: (en.mood || 0) > 0,
      meals: !!(en.meals && (en.meals.breakfast || en.meals.lunch || en.meals.dinner)),
      grat: (en.gratitude || []).some((x) => (x || "").trim()),
      refl: !!(en.reflection || "").trim(),
    });
  }, [date, page, loading]);

  const login = () => { const c = codeInput.trim().toLowerCase(); if (!c) return; try { localStorage.setItem(LS_CODE, c); localStorage.setItem(LS_ME, meInput); } catch (e) {} setCode(c); setMe(meInput); setPage(meInput); };
  const logout = () => { try { localStorage.removeItem(LS_CODE); localStorage.removeItem(LS_ME); } catch (e) {} setCode(null); setDays({}); setCodeInput(""); };

  const getEntry = (slot) => (days[date] && days[date][slot]) || blankEntry();
  const pushData = (slot, entry) => {
    const k = `${date}:${slot}`;
    if (saveTimers.current[k]) clearTimeout(saveTimers.current[k]);
    saveTimers.current[k] = setTimeout(() => { supabase.rpc("gs_save_data", { p_code: code, p_date: date, p_slot: slot, p_data: dataForDb(entry) }).then(() => {}); }, 600);
  };
  const updateEntry = (slot, patch) => { if (slot !== me) return; setDays((prev) => { const day = { ...(prev[date] || {}) }; const entry = { ...(day[slot] || blankEntry()), ...patch }; day[slot] = entry; pushData(slot, entry); return { ...prev, [date]: day }; }); };
  const flushSave = (slot) => { const k = `${date}:${slot}`; if (saveTimers.current[k]) { clearTimeout(saveTimers.current[k]); delete saveTimers.current[k]; } const entry = getEntry(slot); supabase.rpc("gs_save_data", { p_code: code, p_date: date, p_slot: slot, p_data: dataForDb(entry) }).then(() => { setSavedFlash({ slot, ts: Date.now() }); setTimeout(() => setSavedFlash((f) => (f && f.slot === slot ? null : f)), 1800); }); };
  const updateMeal = (slot, key, val) => { const e = getEntry(slot); updateEntry(slot, { meals: { ...e.meals, [key]: val } }); };
  const sendCheer = (slot) => { setBurstKey((k) => k + 1); setDays((prev) => { const day = { ...(prev[date] || {}) }; const entry = { ...(day[slot] || blankEntry()) }; entry.cheers = (entry.cheers || 0) + 1; day[slot] = entry; supabase.rpc("gs_save_cheers", { p_code: code, p_date: date, p_slot: slot, p_cheers: entry.cheers }).then(() => {}); return { ...prev, [date]: day }; }); };
  const saveGoal = (slot, patch) => { if (slot !== me) return; setGoals((prev) => { const g = { ...prev[slot], ...patch }; const next = { ...prev, [slot]: g }; supabase.rpc("gs_save_goal", { p_code: code, p_slot: slot, p_data: g }).then(() => {}); if (patch.bedtime && pushState === "on") supabase.rpc("gs_update_bedtime", { p_code: code, p_slot: me, p_bedtime: patch.bedtime }).then(() => {}); return next; }); };
  const fireCelebrate = (msg) => { setCelebrate({ key: Date.now(), msg }); setTimeout(() => setCelebrate(null), 2200); };

  const togglePush = async () => {
    setPushMsg("");
    if (pushState === "unsupported") { setPushMsg("아이폰은 먼저 '홈 화면에 추가'로 앱을 설치한 뒤에 알림을 켤 수 있어요 🙏"); return; }
    if (pushState === "denied") { setPushMsg("브라우저/기기 설정에서 이 사이트의 알림 권한을 허용으로 바꿔주세요."); return; }
    if (pushState === "on") {
      setPushState("busy");
      try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) await sub.unsubscribe(); await supabase.rpc("gs_delete_sub", { p_code: code, p_slot: me }); } catch (e) {}
      setPushState("off"); setPushMsg("알림을 껐어요.");
      return;
    }
    // turn on
    setPushState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setPushState(perm === "denied" ? "denied" : "off"); setPushMsg("알림 권한이 필요해요."); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const tz = -new Date().getTimezoneOffset();
      await supabase.rpc("gs_save_sub", { p_code: code, p_slot: me, p_endpoint: sub.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_bedtime: (goals[me] && goals[me].bedtime) || "23:30", p_tz: tz });
      setPushState("on"); setPushMsg("알림을 켰어요! 🔔");
    } catch (e) { setPushState("off"); setPushMsg("알림 설정에 실패했어요. 잠시 후 다시 시도해줘요."); }
  };

  const hasEntry = (e) => !!e && (e.bed || e.wake || e.exercise || e.exNote || e.snack >= 0 || e.snackNote || e.mood > 0 || (e.meals && (e.meals.breakfast || e.meals.lunch || e.meals.dinner)) || e.gratitude?.some((g) => g.trim()) || e.reflection?.trim());
  const streakFor = (slot) => { let n = 0, cur = today(); for (let i = 0; i < 400; i++) { const d = days[cur]; if (d && hasEntry(d[slot])) { n++; cur = addDays(cur, -1); } else break; } return n; };

  const weekDates = (ref) => { const [y, m, d] = ref.split("-").map(Number); const dt = new Date(y, m - 1, d); const dow = (dt.getDay() + 6) % 7; const mon = new Date(y, m - 1, d - dow); return [...Array(7)].map((_, i) => ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))); };
  const metricsFor = (slot, weekArr) => {
    let durs = [], beds = [], exDays = 0, logged = 0;
    weekArr.forEach((dk) => { if (dk > today()) return; const e = days[dk]?.[slot]; if (!e) return; if (hasEntry(e)) logged++; const mm = sleepMinutes(e.bed, e.wake); if (mm) { durs.push(mm); beds.push(bedMin(e.bed)); } if (e.exercise) exDays++; });
    const avg = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null;
    const spread = beds.length >= 2 ? Math.max(...beds) - Math.min(...beds) : null;
    return { durs, beds, exDays, logged, avg, spread, nSleep: durs.length };
  };
  const regLabel = (spread) => { if (spread == null) return { txt: "기록 부족", dots: 0, c: "#B0A59C" }; if (spread <= 60) return { txt: "아주 규칙적", dots: 5, c: "#3DAE7B" }; if (spread <= 90) return { txt: "규칙적", dots: 4, c: "#6FB98F" }; if (spread <= 120) return { txt: "보통", dots: 3, c: "#E0A23B" }; if (spread <= 180) return { txt: "조금 들쭉날쭉", dots: 2, c: "#E08A3B" }; return { txt: "들쭉날쭉", dots: 1, c: "#DC6B57" }; };
  const makeFeedback = (cur, prev, goal) => {
    const good = [], tip = [];
    if (cur.spread != null) { if (cur.spread <= 60) good.push("취침 시간이 아주 일정했어요 👍"); else tip.push("취침 시간을 1시간 이내로 모아보기"); }
    if (cur.avg != null) { const gm = goal.sleepHours * 60; if (cur.avg >= gm - 30) good.push(`평균 ${fmtSleep(cur.avg)} 잘 잤어요`); else tip.push(`30분 더 자보기 (목표 ${goal.sleepHours}시간)`); }
    if (cur.exDays >= goal.exerciseWeekly) good.push(`운동 목표 달성! (${cur.exDays}회)`); else if (cur.exDays > 0) tip.push(`운동 ${goal.exerciseWeekly - cur.exDays}회 더 채우기`); else tip.push("이번 주 운동 시작해보기");
    let trend = "";
    if (prev.avg != null && cur.avg != null) { if (cur.avg > prev.avg + 15) trend = "지난주보다 더 잤어요 ↑"; else if (cur.avg < prev.avg - 15) trend = "지난주보다 덜 잤어요 ↓"; else trend = "지난주와 비슷해요 →"; }
    return { good, tip, trend, empty: cur.nSleep === 0 && cur.exDays === 0 && cur.logged === 0 };
  };

  // 3번: 최근 14일 수면 빚 (부족은 쌓이고, 더 잔 날은 갚아짐)
  const sleepDebtFor = (slot, goal) => {
    let net = 0, n = 0;
    for (let i = 0; i < 14; i++) {
      const e2 = days[addDays(today(), -i)]?.[slot];
      const m = e2 ? sleepMinutes(e2.bed, e2.wake) : null;
      if (m != null) { n++; net += goal.sleepHours * 60 - m; }
    }
    return { debt: Math.max(0, Math.round(net)), n };
  };
  // 5번: 수면 <-> 기분 상관 인사이트 (최근 14일)
  const moodInsightFor = (slot, goal) => {
    const good = [], bad = [];
    for (let i = 0; i < 14; i++) {
      const e2 = days[addDays(today(), -i)]?.[slot];
      if (!e2 || !e2.mood) continue;
      const m = sleepMinutes(e2.bed, e2.wake);
      if (m == null) continue;
      (m >= goal.sleepHours * 60 - 30 ? good : bad).push(e2.mood);
    }
    if (good.length >= 2 && bad.length >= 2) {
      const avg = (x) => x.reduce((s, v) => s + v, 0) / x.length;
      const ga = avg(good), ba = avg(bad);
      if (ga - ba >= 0.4) return `잘 잔 날 기분이 더 좋았어요 (${ga.toFixed(1)} vs ${ba.toFixed(1)}) 🙂`;
    }
    return null;
  };
  // 4번: 이번 주 우리 둘 공동 지표
  const coupleWeek = (weekArr) => {
    let cheersTotal = 0, bothDays = 0;
    weekArr.forEach((dk) => { if (dk > today()) return; const d = days[dk] || {}; cheersTotal += (d.a?.cheers || 0) + (d.b?.cheers || 0); if (hasEntry(d.a) && hasEntry(d.b)) bothDays++; });
    return { cheersTotal, bothDays };
  };
  // 월간 리포트: 특정 연/월의 지표 (durs, exDays, spread 등)
  const monthMetrics = (slot, year, month) => {
    const dim = new Date(year, month, 0).getDate();
    let durs = [], beds = [], exDays = 0, logged = 0;
    for (let d = 1; d <= dim; d++) {
      const dk = `${year}-${pad(month)}-${pad(d)}`;
      if (dk > today()) break;
      const e2 = days[dk]?.[slot]; if (!e2) continue;
      if (hasEntry(e2)) logged++;
      const mm = sleepMinutes(e2.bed, e2.wake);
      if (mm) { durs.push(mm); beds.push(bedMin(e2.bed)); }
      if (e2.exercise) exDays++;
    }
    const avg = durs.length ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : null;
    const spread = beds.length >= 2 ? Math.max(...beds) - Math.min(...beds) : null;
    return { avg, exDays, logged, spread, nSleep: durs.length };
  };

  const wrapStyle = ready ? themeVars(THEME[page || "a"], night) : themeVars(THEME.a, false);

  if (!ready) return <div className="td-wrap" style={themeVars(THEME.a, false)}><style>{css}</style><div className="td-loading">불러오는 중…</div></div>;

  if (!code) {
    return (
      <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
        <style>{css}</style>
        <div className="td-login">
          <div className="td-loginbuddy td-breathe"><FireBuddy sleepy={false} /></div>
          <h1>우리의 하루</h1>
          <p>둘만의 공유 코드를 입력하면 같은 기록을 함께 봐요.</p>
          <input className="td-input" placeholder="공유 코드 (예: tessa-jiin-93f2k)" value={codeInput} onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          <div className="td-whopick">
            <span>나는</span>
            {["a", "b"].map((p) => (<button key={p} className={"td-whobtn" + (meInput === p ? " on" : "")} onClick={() => setMeInput(p)} style={{ "--tc": THEME[p].c1 }}>{THEME[p].emoji} {THEME[p].name}</button>))}
          </div>
          <button className="td-loginbtn" onClick={login}>시작하기</button>
          <small className="td-loginhint">같은 코드를 두 사람이 입력하면 연결돼요.</small>
        </div>
      </div>
    );
  }

  const t = THEME[page]; const g = goals[page]; const e = getEntry(page);
  const names = { a: (goals.a && goals.a.name) || THEME.a.name, b: (goals.b && goals.b.name) || THEME.b.name };
  const mine = page === me;
  const yEntry = days[addDays(date, -1)]?.[page];
  const yb = yEntry && yEntry.bed && yEntry.wake ? yEntry : null;
  const mins = sleepMinutes(e.bed, e.wake); const mood = sleepMood(mins);
  const charge = mins ? Math.min(100, Math.round((mins / (g.sleepHours * 60)) * 100)) : 0;
  const { md, dow } = labelDate(date); const isToday = date === today();
  const thisWeek = weekDates(today()); const lastWeek = weekDates(addDays(today(), -7));
  const cur = metricsFor(page, thisWeek); const prev = metricsFor(page, lastWeek);
  const reg = regLabel(cur.spread); const fb = makeFeedback(cur, prev, g);
  const exPct = Math.min(100, Math.round((cur.exDays / Math.max(1, g.exerciseWeekly)) * 100));
  const sd = sleepDebtFor(page, g);
  const sdColor = sd.debt === 0 ? "#3DAE7B" : sd.debt <= 120 ? "#6FB98F" : sd.debt <= 300 ? "#E0A23B" : "#DC6B57";
  const moodTip = moodInsightFor(page, g);
  const cw = coupleWeek(thisWeek);
  const nowD = new Date();
  const thisMonth = monthMetrics(page, nowD.getFullYear(), nowD.getMonth() + 1);
  const lastMonthD = new Date(nowD.getFullYear(), nowD.getMonth() - 1, 1);
  const lastMonth = monthMetrics(page, lastMonthD.getFullYear(), lastMonthD.getMonth() + 1);
  const monthRegLabel = regLabel(thisMonth.spread);
  const streak = streakFor(page);
  const lvl = streak >= 14 ? 3 : streak >= 7 ? 2 : streak >= 3 ? 1 : 0;

  let bedNudge = null;
  if (page === me && isToday && !e.bed && g.bedtime) {
    const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
    const bm = g.bedtime.split(":").map(Number); const target = bm[0] * 60 + bm[1];
    let diff = target - nowMin; if (diff < -720) diff += 1440;
    if (diff >= 0 && diff <= 90) bedNudge = `곧 목표 취침 시간(${g.bedtime})이에요 🌙`;
  }

  const onExercise = () => {
    const willBeOn = !e.exercise;
    updateEntry(page, { exercise: willBeOn });
    if (willBeOn && !e.exercise) {
      const inWeek = thisWeek.includes(date);
      const already = e.exercise;
      const projected = cur.exDays + (inWeek && !already ? 1 : 0);
      if (inWeek && projected === g.exerciseWeekly && cur.exDays < g.exerciseWeekly) fireCelebrate("이번 주 운동 목표 달성! 🎉");
    }
  };

  const [my_, mm_] = monthRef.split("-").map(Number);
  const first = new Date(my_, mm_ - 1, 1); const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(my_, mm_, 0).getDate();
  const monthCells = [];
  for (let i = 0; i < startPad; i++) monthCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) monthCells.push(ymd(new Date(my_, mm_ - 1, d)));

  return (
    <div className={"td-wrap" + (night ? " night" : "")} style={wrapStyle}>
      <style>{css}</style>
      <div className="td-glow" />
      <div className="td-app">

        <div className="td-topbar">
          <span className="td-hello">{greeting()}, {names[me]} {night ? "🌙" : "☀️"}</span>
          <div className="td-topbtns">
            <button className="td-nightbtn" onClick={togglePush} aria-label="알림">{pushState === "on" ? "🔔" : "🔕"}</button>
            <button className="td-nightbtn" onClick={toggleNight} aria-label="테마 전환">{night ? "☀️" : "🌙"}</button>
          </div>
        </div>
        {pushMsg && <div className="td-pushmsg" onClick={() => setPushMsg("")}>{pushMsg}</div>}

        <div className="td-tabs td-glasscard">
          {["a", "b"].map((p) => (<button key={p} className={"td-tab" + (page === p ? " on" : "")} onClick={() => setPage(p)} style={{ "--tc": THEME[p].c1 }}><span>{THEME[p].emoji}</span>{names[p]}{p === me ? " (나)" : ""}</button>))}
        </div>

        {view === "today" && (<>
          {!mine && <div className="td-viewonly">👀 {names[page]}의 하루 · 응원볼만 보낼 수 있어요</div>}
          <div className="td-datenav">
            <button onClick={() => setDate(addDays(date, -1))} aria-label="이전">‹</button>
            <div className="td-date"><b>{md}</b><small>{dow}요일{isToday ? " · 오늘" : ""}</small>{!isToday && <button className="td-gototoday" onClick={() => setDate(today())}>오늘로 ↩</button>}</div>
            <button onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="다음">›</button>
          </div>

          <div className="td-hero td-card">
            <div className="td-buddywrap">
              <div className={"td-buddy td-breathe lvl" + lvl}>
                {page === "a" ? <FireBuddy sleepy={mood.sleepy} /> : <FairyBuddy />}
                {lvl > 0 && <span className="td-spark s1">✨</span>}
                {lvl > 1 && <span className="td-spark s2">✨</span>}
                {lvl > 2 && <span className="td-spark s3">⭐</span>}
              </div>
              <div className="td-name">{names[page]}<span className="td-badge">{t.emoji}{t.type}</span></div>
              <div className="td-streak">🔥 {streak}일 연속{lvl > 0 ? ` · Lv.${lvl}` : ""}</div>
            </div>

            {bedNudge && <div className="td-nudge">{bedNudge}</div>}

            <div className="td-sleepcard">
              <div className="td-sleephead"><span>😴 오늘 수면</span><b>{fmtSleep(mins)}</b></div>
              <div className="td-times">
                <label><i>🌙 잘 때</i><input type="time" value={e.bed} disabled={!mine} onChange={(ev) => updateEntry(page, { bed: ev.target.value })} /></label>
                <label><i>☀️ 일어난 때</i><input type="time" value={e.wake} disabled={!mine} onChange={(ev) => updateEntry(page, { wake: ev.target.value })} /></label>
              </div>
              {mine && yb && (!e.bed || !e.wake) && <button className="td-yesterday" onClick={() => updateEntry(page, { bed: yb.bed, wake: yb.wake })}>↩ 어제와 같게 ({yb.bed} → {yb.wake})</button>}
              <div className="td-charge"><div className="td-chargefill" style={{ width: charge + "%" }}><span className="td-shimmer" /></div></div>
              <div className="td-moodmsg">{mood.emoji} {mood.msg}</div>
              <div className="td-reg">
                <span>취침 규칙성(이번 주)</span>
                <span className="td-regdots">{[1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: i <= reg.dots ? reg.c : "var(--soft)" }} />)}</span>
                <b style={{ color: reg.c }}>{reg.txt}</b>
              </div>
              <div className="td-debt">🧾 최근 14일 수면 빚 <b style={{ color: sdColor }}>{sd.debt === 0 ? (sd.n > 0 ? "없음! 🎉" : "—") : fmtSleep(sd.debt)}</b></div>
              <div className="td-goalhint">🎯 목표 취침 {g.bedtime} · 기상 {g.wake} · {g.sleepHours}시간</div>
            </div>
          </div>

          <div className="td-progress">
            <div className="td-progitem td-card">
              <div className="td-proglabel">😴 수면 규칙성</div>
              <div className="td-progdots">{[1, 2, 3, 4, 5].map((i) => <i key={i} style={{ background: i <= reg.dots ? reg.c : "var(--soft)" }} />)}</div>
            </div>
            <div className="td-progitem td-card">
              <div className="td-proglabel">💪 이번 주 운동 {cur.exDays}/{g.exerciseWeekly}</div>
              <div className="td-progbar"><div className="td-progfill" style={{ width: exPct + "%" }} /></div>
            </div>
          </div>

          <div className="td-card td-maincard">
            {[
              { k: "ex", label: "💪 운동", filled: !!e.exercise, sum: e.exercise ? ("완료" + (e.exNote ? " · " + e.exNote : "")) : "미기록",
                body: (<>
                  <button className={"td-toggle" + (e.exercise ? " on" : "")} onClick={onExercise} disabled={!mine}>{e.exercise ? "✓ 오늘 운동 완료!" : "오늘 운동했어?"}</button>
                  {e.exercise && <input className="td-input" placeholder="뭐 했어? (예: 런닝 30분)" value={e.exNote} disabled={!mine} onChange={(ev) => updateEntry(page, { exNote: ev.target.value })} />}
                </>) },
              { k: "snack", label: "🍪 간식", filled: e.snack >= 0, sum: e.snack >= 0 ? (SNACKS[e.snack] + (e.snackNote ? " · " + e.snackNote : "")) : "미기록",
                body: (<>
                  <div className="td-chips">{SNACKS.map((s, i) => (<button key={i} className={"td-chip" + (e.snack === i ? " on" : "")} disabled={!mine} onClick={() => updateEntry(page, { snack: e.snack === i ? -1 : i })}>{s}</button>))}</div>
                  {e.snack > 0 && <input className="td-input" placeholder="뭐 먹었어? (예: 초콜릿, 과자)" value={e.snackNote} disabled={!mine} onChange={(ev) => updateEntry(page, { snackNote: ev.target.value })} />}
                </>) },
              { k: "mood", label: "🙂 오늘 기분", filled: (e.mood || 0) > 0, sum: (e.mood || 0) > 0 ? MOODS[e.mood - 1] : "미기록",
                body: (<div className="td-chips">{MOODS.map((m2, i) => (<button key={i} className={"td-chip td-moodchip" + (e.mood === i + 1 ? " on" : "")} disabled={!mine} onClick={() => updateEntry(page, { mood: e.mood === i + 1 ? 0 : i + 1 })}>{m2}</button>))}</div>) },
              ...(page === "b" ? [{ k: "meals", label: "🍽️ 오늘의 식단", cls: " td-meals", filled: !!(e.meals.breakfast || e.meals.lunch || e.meals.dinner), sum: [e.meals.breakfast, e.meals.lunch, e.meals.dinner].filter(Boolean).join(" / ") || "미기록",
                body: (<>
                  <div className="td-mealrow"><span>🌅 아침</span><input className="td-input td-mealinput" placeholder="아침에 뭐 먹었어?" value={e.meals.breakfast} disabled={!mine} onChange={(ev) => updateMeal(page, "breakfast", ev.target.value)} /></div>
                  <div className="td-mealrow"><span>🌞 점심</span><input className="td-input td-mealinput" placeholder="점심에 뭐 먹었어?" value={e.meals.lunch} disabled={!mine} onChange={(ev) => updateMeal(page, "lunch", ev.target.value)} /></div>
                  <div className="td-mealrow"><span>🌙 저녁</span><input className="td-input td-mealinput" placeholder="저녁에 뭐 먹었어?" value={e.meals.dinner} disabled={!mine} onChange={(ev) => updateMeal(page, "dinner", ev.target.value)} /></div>
                </>) }] : []),
              { k: "grat", label: "⭐ 오늘의 3감사", cls: " td-gratblock", labelCls: " td-gratlabel", filled: (e.gratitude || []).some((x) => (x || "").trim()), sum: (e.gratitude || []).filter((x) => (x || "").trim()).length ? (e.gratitude || []).filter((x) => (x || "").trim()).length + "개 작성" : "미기록",
                body: (<>{[0, 1, 2].map((i) => (<input key={i} className="td-input td-gratinput" placeholder={`${i + 1}. 감사한 일`} value={e.gratitude[i]} disabled={!mine} onChange={(ev) => { const gg = [...e.gratitude]; gg[i] = ev.target.value; updateEntry(page, { gratitude: gg }); }} />))}</>) },
              { k: "refl", label: "📓 한 줄 후기", filled: !!(e.reflection || "").trim(), sum: (e.reflection || "").trim() ? ((e.reflection || "").length > 22 ? (e.reflection || "").slice(0, 22) + "…" : e.reflection) : "미기록",
                body: (<textarea className="td-area" rows={2} placeholder="오늘 하루는 어땠어?" value={e.reflection} disabled={!mine} onChange={(ev) => updateEntry(page, { reflection: ev.target.value })} />) },
            ].map((b) => {
              const open = openSet[b.k] != null ? openSet[b.k] : (mine ? !initFilled[b.k] : false);
              return (
                <div key={b.k} className={"td-block" + (b.cls || "")}>
                  <button className="td-bhead" onClick={() => setOpenSet((o) => ({ ...o, [b.k]: !open }))}>
                    <span className={"td-blabel2" + (b.labelCls || "")}>{b.label}</span>
                    {!open && <span className={"td-bsum" + (b.filled ? " ok" : "")}>{b.filled ? "✓ " : ""}{b.sum}</span>}
                    <i className="td-bcaret">{open ? "▴" : "▾"}</i>
                  </button>
                  {open && <div className="td-bbody">{b.body}</div>}
                </div>
              );
            })}
            {(e.cheers > 0 || !mine) && (
              <div className="td-cheerrow">
                {e.cheers > 0 && <span className="td-cheercount">받은 응원 {e.cheers}</span>}
                {!mine && (
                  <button className="td-cheerbtn" onClick={() => sendCheer(page)}>
                    <span className="td-ball" style={{ "--bt": t.c1 }}><span className="td-balltop" /><span className="td-ballband" /><span className="td-ballbtn">♥</span></span>{names[page]}에게 응원볼
                    {burstKey > 0 && <span className="td-burst" key={burstKey}>{[...Array(8)].map((_, i) => <b key={i} style={{ "--tx": (i * 10 - 35) + "px", "--dl": (i % 4) * 0.05 + "s" }}>♥</b>)}</span>}
                  </button>
                )}
              </div>
            )}
            {mine && (
              <div className="td-savebar">
                <button className="td-savebtn" onClick={() => flushSave(page)}>💾 지금 저장하기</button>
                {savedFlash && savedFlash.slot === page && <span className="td-savedok">저장됨 ✓</span>}
              </div>
            )}
          </div>

          <button className="td-goalbtn td-card" onClick={() => setShowGoals((v) => !v)}>🎯 {names[page]} {mine ? "목표 설정" : "목표 보기"} {showGoals ? "▲" : "▼"}</button>
          {showGoals && (
            <div className="td-goalpanel td-card">
              <div className="td-goalrow"><label>이름</label><input type="text" value={g.name || ""} placeholder={THEME[page].name} disabled={!mine} onChange={(ev) => saveGoal(page, { name: ev.target.value })} style={{ width: 140 }} /></div>
              <div className="td-goalrow"><label>목표 취침</label><input type="time" value={g.bedtime} disabled={!mine} onChange={(ev) => saveGoal(page, { bedtime: ev.target.value })} /></div>
              <div className="td-goalrow"><label>목표 기상</label><input type="time" value={g.wake} disabled={!mine} onChange={(ev) => saveGoal(page, { wake: ev.target.value })} /></div>
              <div className="td-goalrow"><label>목표 수면(시간)</label><input type="number" step="0.5" min="4" max="12" value={g.sleepHours} disabled={!mine} onChange={(ev) => saveGoal(page, { sleepHours: parseFloat(ev.target.value) || 7.5 })} /></div>
              <div className="td-goalrow"><label>주간 운동(회)</label><input type="number" min="1" max="7" value={g.exerciseWeekly} disabled={!mine} onChange={(ev) => saveGoal(page, { exerciseWeekly: parseInt(ev.target.value) || 4 })} /></div>
              <div className="td-goalrow td-goaldays"><label>운동 요일</label><div className="td-daychips">{DOW_MON.map((d, i) => { const on = (g.exerciseDays || []).includes(i); return <button key={i} className={"td-daychip" + (on ? " on" : "")} disabled={!mine} onClick={() => { const arr = new Set(g.exerciseDays || []); on ? arr.delete(i) : arr.add(i); saveGoal(page, { exerciseDays: [...arr] }); }}>{d}</button>; })}</div></div>
            </div>
          )}
        </>)}

        {view === "review" && (<>
          <div className="td-review td-card">
            <h3>📊 {names[page]} 이번 주 리뷰</h3>
            {fb.empty ? (<p className="td-reviewempty">이번 주 기록을 채우면 리뷰가 나와요 🙂</p>) : (<>
              {fb.good.length > 0 && <div className="td-fbgood">👏 잘한 점: {fb.good.join(" · ")}</div>}
              <div className="td-reviewgrid">
                <div className="td-rv"><span>평균 수면</span><b>{cur.avg ? fmtSleep(cur.avg) : "—"}</b></div>
                <div className="td-rv"><span>취침 규칙성</span><b style={{ color: reg.c }}>{reg.txt}</b></div>
                <div className="td-rv"><span>운동</span><b>{cur.exDays}/{g.exerciseWeekly}회</b></div>
                <div className="td-rv"><span>수면 빚(14일)</span><b style={{ color: sdColor }}>{sd.debt === 0 ? "없음 🎉" : fmtSleep(sd.debt)}</b></div>
                <div className="td-rv"><span>지난주 대비</span><b>{fb.trend || "—"}</b></div>
                <div className="td-rv"><span>기록한 날</span><b>{cur.logged}일</b></div>
              </div>
              {moodTip && <div className="td-fbgood">💡 {moodTip}</div>}
              {fb.tip.length > 0 && <div className="td-fbtip">🌱 다음 주 제안: {fb.tip[0]}</div>}
            </>)}
          </div>
          <div className="td-couple td-card">
            <h3>💞 이번 주 우리 둘</h3>
            <div className="td-couplerow">
              <div className="td-rv"><span>함께 기록한 날</span><b>{cw.bothDays}일</b></div>
              <div className="td-rv"><span>주고받은 응원</span><b>{cw.cheersTotal}개</b></div>
            </div>
            <p className="td-couplemsg">{cw.bothDays >= 5 ? "이번 주도 둘 다 꾸준했어요, 최고! 🎉" : cw.bothDays >= 2 ? "함께 쌓아가는 중이에요 🌱" : "이번 주도 같이 시작해볼까요? 😊"}</p>
          </div>
          <div className="td-monthreport td-card">
            <h3>📅 {names[page]} 이번 달 리포트</h3>
            {thisMonth.nSleep === 0 ? (<p className="td-reviewempty">이번 달 기록을 채우면 리포트가 나와요 🙂</p>) : (<>
              <div className="td-reviewgrid">
                <div className="td-rv"><span>이번 달 평균 수면</span><b>{thisMonth.avg ? fmtSleep(thisMonth.avg) : "—"}</b></div>
                <div className="td-rv"><span>이번 달 규칙성</span><b style={{ color: monthRegLabel.c }}>{monthRegLabel.txt}</b></div>
                <div className="td-rv"><span>이번 달 운동</span><b>{thisMonth.exDays}회</b></div>
                <div className="td-rv"><span>지난 달 대비</span><b>{lastMonth.avg && thisMonth.avg ? (thisMonth.avg > lastMonth.avg + 15 ? "더 잤어요 ↑" : thisMonth.avg < lastMonth.avg - 15 ? "덜 잤어요 ↓" : "비슷해요 →") : "—"}</b></div>
              </div>
              <div className="td-fbtip">📆 이번 주 평균({cur.avg ? fmtSleep(cur.avg) : "—"})이 이번 달 평균({thisMonth.avg ? fmtSleep(thisMonth.avg) : "—"})보다 {(cur.avg && thisMonth.avg) ? (cur.avg > thisMonth.avg ? "좋은 흐름이에요 👍" : cur.avg < thisMonth.avg ? "살짝 아쉬워요, 이번 주 조금 더 챙겨봐요 🌱" : "비슷해요") : "데이터가 더 필요해요"}</div>
            </>)}
          </div>
          <div className="td-week td-card">
            <h3>🛌 이번 주 수면 리듬</h3>
            <div className="td-bars">
              {thisWeek.map((dk) => {
                const dd = days[dk] || {}; const ma = sleepMinutes(dd.a?.bed, dd.a?.wake); const mb = sleepMinutes(dd.b?.bed, dd.b?.wake); const lab = labelDate(dk);
                return (<button key={dk} className={"td-daycol" + (dk === date ? " sel" : "")} onClick={() => { setDate(dk); setView("today"); }}>
                  <div className="td-barpair"><span className="td-bar" style={{ height: (ma ? Math.min(100, ma / 540 * 100) : 0) + "%", background: THEME.a.c1 }} /><span className="td-bar" style={{ height: (mb ? Math.min(100, mb / 540 * 100) : 0) + "%", background: THEME.b.c1 }} /></div>
                  <span className="td-daylab">{lab.short}</span>
                </button>);
              })}
            </div>
            <div className="td-legend"><span><i style={{ background: THEME.a.c1 }} />{names.a}</span><span><i style={{ background: THEME.b.c1 }} />{names.b}</span></div>
          </div>
        </>)}

        {view === "calendar" && (
          <div className="td-month td-card">
            <div className="td-monthhead">
              <button onClick={() => { const [y, m] = monthRef.split("-").map(Number); setMonthRef(ymd(new Date(y, m - 2, 1))); }}>‹</button>
              <h3>🗓️ {my_}년 {mm_}월 · {names[page]}</h3>
              <button onClick={() => { const [y, m] = monthRef.split("-").map(Number); setMonthRef(ymd(new Date(y, m, 1))); }}>›</button>
            </div>
            <div className="td-monthdow">{DOW_MON.map((d) => <span key={d}>{d}</span>)}</div>
            <div className="td-monthgrid">
              {monthCells.map((dk, i) => {
                if (!dk) return <span key={"e" + i} className="td-mcell empty" />;
                const en = days[dk]?.[page]; const mm = en ? sleepMinutes(en.bed, en.wake) : null;
                const slept = mm != null; const goalMet = mm != null && mm >= (g.sleepHours - 0.5) * 60; const ex = en?.exercise;
                const dnum = parseInt(dk.split("-")[2], 10);
                return (<button key={dk} className={"td-mcell" + (dk === date ? " sel" : "")} onClick={() => { setDate(dk); setView("today"); }} style={{ background: goalMet ? "var(--soft)" : (slept ? "var(--soft2)" : "transparent") }}>
                  <span className="td-mnum">{dnum}</span>{ex && <span className="td-mdot" style={{ background: t.c1 }} />}
                </button>);
              })}
            </div>
            <div className="td-mlegend"><span><i style={{ background: "var(--soft)" }} />수면목표</span><span><i className="dot" style={{ background: t.c1 }} />운동</span></div>
          </div>
        )}

        <div className="td-foot"><span>{loading ? "동기화 중…" : "✓ 동기화 중(10초)"} · {code}</span><button onClick={logout}>코드 변경</button></div>
      </div>

      {celebrate && <div className="td-confetti" key={celebrate.key}>{[...Array(24)].map((_, i) => <b key={i} style={{ "--l": (i * 4.1) % 100 + "%", "--dl": (i % 6) * 0.1 + "s", "--rot": (i * 37) + "deg", background: i % 2 ? "var(--c1)" : "var(--c2)" }} />)}<div className="td-celebmsg">{celebrate.msg}</div></div>}

      <nav className="td-bottomnav td-glasscard">
        {[["today", "📝", "오늘"], ["review", "📊", "리뷰"], ["calendar", "🗓️", "캘린더"]].map(([v, ic, lb]) => (
          <button key={v} className={"td-navbtn" + (view === v ? " on" : "")} onClick={() => setView(v)}><span>{ic}</span>{lb}</button>
        ))}
      </nav>
    </div>
  );
}

const css = `
@import url('https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap');
.td-wrap{ --ink:#3E3531; --muted:#AEA399; position:relative; font-family:'Gowun Dodum',system-ui,sans-serif; background:var(--pageBg,#FFF1E6); color:var(--ink); min-height:100vh; padding:12px 12px 92px; transition:background .4s,color .4s; -webkit-text-size-adjust:100%; -webkit-font-smoothing:antialiased; overflow-x:hidden; }
.td-wrap *{ box-sizing:border-box; }
.td-glow{ position:fixed; top:-15%; left:50%; transform:translateX(-50%); width:120%; height:44%; background:radial-gradient(ellipse at center, var(--glowc) 0%, transparent 70%); opacity:.7; pointer-events:none; z-index:0; transition:background .4s; }
.td-loading{ text-align:center; padding:80px 0; color:var(--muted); font-family:'Jua'; }
.td-app{ position:relative; z-index:1; width:100%; max-width:460px; margin:0 auto; }
.td-card{ background:var(--card); border-radius:22px; box-shadow:0 8px 22px var(--shadow), 0 1px 0 rgba(255,255,255,.4) inset; }
.td-glasscard{ background:var(--glass); -webkit-backdrop-filter:blur(14px); backdrop-filter:blur(14px); border:1px solid var(--line); }

.td-topbar{ display:flex; align-items:center; justify-content:space-between; padding:2px 4px 10px; }
.td-topbtns{ display:flex; gap:8px; }
.td-pushmsg{ background:var(--card); border:1px solid var(--line); color:var(--ink); font-size:13px; text-align:center; padding:9px 12px; border-radius:12px; margin-bottom:10px; cursor:pointer; box-shadow:0 3px 10px var(--shadow); }
.td-hello{ font-family:'Jua'; font-size:15px; color:var(--ink); }
.td-nightbtn{ width:38px; height:38px; border:none; border-radius:50%; background:var(--card); box-shadow:0 3px 10px var(--shadow); font-size:17px; cursor:pointer; }

.td-login{ width:100%; max-width:380px; margin:8vh auto 0; background:var(--card); border-radius:24px; padding:26px 22px; box-shadow:0 10px 30px var(--shadow); text-align:center; position:relative; z-index:1; }
.td-loginbuddy{ width:90px; height:90px; margin:0 auto 10px; border-radius:50%; background:var(--sky); display:flex; align-items:center; justify-content:center; padding:9px; }
.td-login h1{ font-family:'Jua'; font-size:26px; margin:0 0 6px; }
.td-login p{ font-size:14px; color:var(--muted); margin:0 0 18px; }
.td-whopick{ display:flex; align-items:center; gap:7px; margin:12px 0; flex-wrap:wrap; justify-content:center; font-size:14px; color:var(--muted); }
.td-whobtn{ border:2px solid var(--soft); background:var(--card); color:var(--ink); font-family:'Jua'; font-size:14px; padding:8px 13px; border-radius:999px; cursor:pointer; }
.td-whobtn.on{ background:var(--tc); border-color:var(--tc); color:#fff; }
.td-loginbtn{ width:100%; margin-top:8px; padding:14px; border:none; border-radius:14px; background:var(--c1); color:#fff; font-family:'Jua'; font-size:17px; cursor:pointer; }
.td-loginhint{ display:block; margin-top:12px; color:var(--muted); font-size:12px; }

.td-tabs{ display:flex; gap:6px; margin-bottom:12px; padding:6px; border-radius:18px; }
.td-tab{ flex:1; min-width:0; border:none; background:transparent; color:var(--ink); font-family:'Jua'; font-size:14px; padding:10px 6px; border-radius:13px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; opacity:.6; transition:.2s; }
.td-tab span{ font-size:15px; } .td-tab.on{ background:var(--tc); color:#fff; opacity:1; box-shadow:0 4px 12px var(--shadow); }

.td-datenav{ display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px; }
.td-datenav button{ width:34px; height:34px; flex:0 0 auto; border-radius:50%; border:none; background:var(--card); font-size:19px; cursor:pointer; color:var(--ink); box-shadow:0 3px 8px var(--shadow); }
.td-datenav button:disabled{ opacity:.35; }
.td-date{ text-align:center; } .td-date b{ font-family:'Jua'; font-size:20px; display:block; line-height:1.15; } .td-date small{ font-size:12px; color:var(--muted); }

.td-hero{ padding:16px; margin-bottom:12px; }
.td-buddywrap{ display:flex; flex-direction:column; align-items:center; gap:4px; margin-bottom:12px; }
.td-buddy{ position:relative; width:88px; height:88px; border-radius:50%; background:var(--sky); display:flex; align-items:center; justify-content:center; padding:9px; overflow:visible; }
.td-buddy img,.td-buddy svg{ border-radius:50%; }
.td-buddy.lvl2{ box-shadow:0 0 0 3px rgba(255,255,255,.5),0 0 18px var(--c1); }
.td-buddy.lvl3{ box-shadow:0 0 0 3px #FFE08A,0 0 26px var(--c1); }
.td-spark{ position:absolute; font-size:15px; animation:twinkle 1.8s ease-in-out infinite; }
.td-spark.s1{ top:-4px; right:-2px; } .td-spark.s2{ bottom:2px; left:-6px; animation-delay:.5s; } .td-spark.s3{ top:6px; left:-4px; animation-delay:.9s; }
.td-name{ font-family:'Jua'; font-size:21px; display:flex; align-items:center; gap:7px; color:var(--ink); }
.td-badge{ font-family:'Jua'; font-size:11px; background:var(--c1); color:#fff; padding:3px 9px; border-radius:999px; }
.td-streak{ font-size:13px; color:var(--muted); }
.td-nudge{ background:var(--soft2); border:1px dashed var(--c1); color:var(--c2); font-family:'Jua'; font-size:13px; text-align:center; padding:8px; border-radius:12px; margin-bottom:10px; }
.td-sleepcard{ background:var(--soft2); border-radius:16px; padding:14px; }
.td-sleephead{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px; }
.td-sleephead span{ font-family:'Jua'; font-size:16px; } .td-sleephead b{ font-family:'Jua'; font-size:22px; color:var(--c2); }
.td-times{ display:flex; gap:8px; }
.td-times label{ flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
.td-times input{ width:100%; border:2px solid var(--soft); border-radius:11px; padding:9px 6px; font-family:'Gowun Dodum'; font-size:15px; color:var(--ink); background:var(--field); }
.td-charge{ height:14px; background:var(--soft); border-radius:999px; margin-top:11px; overflow:hidden; }
.td-chargefill{ position:relative; height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:999px; transition:width .5s; overflow:hidden; }
.td-shimmer{ position:absolute; inset:0; background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%); transform:translateX(-100%); animation:shimmer 2.4s ease-in-out infinite; }
.td-moodmsg{ font-family:'Jua'; font-size:14px; margin-top:9px; text-align:center; color:var(--ink); }
.td-reg{ display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:11px; border-top:1px solid var(--line); font-size:13px; color:var(--muted); flex-wrap:wrap; }
.td-reg b{ font-family:'Jua'; font-size:13px; } .td-regdots{ display:flex; gap:3px; } .td-regdots i{ width:9px; height:9px; border-radius:50%; }
.td-goalhint{ font-size:12px; color:var(--muted); margin-top:8px; text-align:center; }

.td-progress{ display:flex; gap:10px; margin-bottom:12px; }
.td-progitem{ flex:1; padding:12px 13px; }
.td-proglabel{ font-family:'Jua'; font-size:13px; margin-bottom:8px; color:var(--ink); }
.td-progdots{ display:flex; gap:4px; } .td-progdots i{ flex:1; height:8px; border-radius:4px; }
.td-progbar{ height:8px; background:var(--soft); border-radius:4px; overflow:hidden; } .td-progfill{ height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:4px; transition:width .5s; }

.td-maincard{ padding:16px; }
.td-block{ margin-bottom:16px; } .td-block:last-of-type{ margin-bottom:8px; }
.td-blabel{ font-family:'Jua'; font-size:15px; margin-bottom:8px; color:var(--ink); }
.td-toggle{ width:100%; padding:13px; border:2px dashed var(--soft); border-radius:13px; background:var(--field); font-family:'Jua'; font-size:15px; color:var(--muted); cursor:pointer; transition:.15s; }
.td-toggle.on{ background:var(--c1); border-style:solid; border-color:var(--c1); color:#fff; animation:pop .35s ease; }
.td-input{ width:100%; margin-top:9px; padding:11px 13px; border:2px solid var(--soft); border-radius:12px; font-family:'Gowun Dodum'; font-size:15px; background:var(--field); color:var(--ink); }
.td-input::placeholder,.td-area::placeholder{ color:var(--muted); opacity:.7; }
.td-chips{ display:flex; gap:6px; }
.td-chip{ flex:1; min-width:0; padding:10px 0; border:2px solid var(--soft); border-radius:11px; background:var(--field); font-family:'Jua'; font-size:13px; color:var(--ink); cursor:pointer; }
.td-chip.on{ background:var(--c1); border-color:var(--c1); color:#fff; animation:pop .3s ease; }
.td-meals .td-mealrow{ display:flex; align-items:center; gap:9px; margin-top:8px; } .td-meals .td-mealrow:first-of-type{ margin-top:0; }
.td-meals .td-mealrow span{ font-family:'Jua'; font-size:13px; width:52px; flex:0 0 auto; color:var(--ink); }
.td-mealinput{ margin-top:0; }
.td-gratblock{ background:var(--grat); border:2px solid var(--gratline); border-radius:15px; padding:13px; }
.td-gratlabel{ color:var(--grattxt); } .td-gratinput{ margin-top:8px; } .td-gratinput:first-of-type{ margin-top:0; }
.td-area{ width:100%; padding:11px 13px; border:2px solid var(--soft); border-radius:13px; font-family:'Gowun Dodum'; font-size:15px; resize:vertical; background:var(--field); color:var(--ink); }
.td-cheerrow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
.td-cheercount{ font-family:'Jua'; font-size:13px; color:var(--c2); }
.td-cheerbtn{ position:relative; margin-left:auto; border:2px solid var(--c1); color:var(--c2); background:var(--card); padding:10px 16px; border-radius:999px; font-family:'Jua'; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:8px; overflow:visible; }
.td-cheerbtn:active{ transform:scale(.95); }
.td-ball{ position:relative; width:20px; height:20px; border-radius:50%; overflow:hidden; display:inline-block; border:2px solid #2b2b2b; flex:0 0 auto; background:#fff; }
.td-balltop{ position:absolute; inset:0 0 50% 0; background:var(--bt); }
.td-ballband{ position:absolute; top:50%; left:0; right:0; height:3px; transform:translateY(-50%); background:#2b2b2b; }
.td-ballbtn{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:9px; height:9px; background:#fff; border:1.5px solid #2b2b2b; border-radius:50%; font-size:6px; line-height:7px; text-align:center; color:#ff5c8a; }
.td-burst{ position:absolute; top:50%; left:50%; pointer-events:none; }
.td-burst b{ position:absolute; color:var(--c1); font-size:14px; animation:floatup .9s ease-out forwards; animation-delay:var(--dl); transform:translate(-50%,-50%); }

.td-goalbtn{ width:100%; margin-top:12px; padding:12px; border:none; font-family:'Jua'; font-size:14px; color:var(--c2); cursor:pointer; }
.td-goalpanel{ padding:14px; margin-top:8px; }
.td-goalrow{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; } .td-goalrow:last-child{ margin-bottom:0; }
.td-goalrow label{ font-size:14px; color:var(--ink); flex:0 0 auto; }
.td-goalrow input{ border:2px solid var(--soft); border-radius:10px; padding:8px 10px; font-family:'Gowun Dodum'; font-size:15px; width:110px; text-align:center; background:var(--field); color:var(--ink); }
.td-goaldays{ align-items:flex-start; flex-direction:column; }
.td-daychips{ display:flex; gap:5px; width:100%; }
.td-daychip{ flex:1; padding:7px 0; border:2px solid var(--soft); border-radius:9px; background:var(--field); font-family:'Jua'; font-size:12px; cursor:pointer; color:var(--ink); }
.td-daychip.on{ background:var(--c1); border-color:var(--c1); color:#fff; }

.td-review{ padding:16px; margin-bottom:12px; }
.td-review h3{ font-family:'Jua'; font-size:15px; margin:0 0 12px; color:var(--ink); }
.td-reviewempty{ color:var(--muted); font-size:14px; text-align:center; margin:8px 0; }
.td-reviewgrid{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:12px; }
.td-rv{ background:var(--soft2); border-radius:12px; padding:10px 12px; }
.td-rv span{ display:block; font-size:12px; color:var(--muted); margin-bottom:3px; } .td-rv b{ font-family:'Jua'; font-size:14px; color:var(--ink); }
.td-fbgood{ background:var(--good); border-radius:11px; padding:10px 12px; font-size:13px; margin-bottom:7px; color:var(--ink); }
.td-fbtip{ background:var(--grat); border-radius:11px; padding:10px 12px; font-size:13px; color:var(--ink); }

.td-week{ padding:16px; }
.td-week h3{ font-family:'Jua'; font-size:15px; margin:0 0 14px; color:var(--ink); }
.td-bars{ display:flex; gap:5px; align-items:flex-end; }
.td-daycol{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; background:none; border:none; cursor:pointer; padding:5px 1px; border-radius:9px; }
.td-daycol.sel{ background:var(--soft); }
.td-barpair{ display:flex; gap:3px; align-items:flex-end; height:60px; }
.td-bar{ width:8px; border-radius:5px 5px 0 0; min-height:4px; transition:height .4s; }
.td-daylab{ font-size:10px; color:var(--muted); font-family:'Jua'; }
.td-legend{ display:flex; gap:16px; justify-content:center; margin-top:12px; font-size:12px; color:var(--muted); font-family:'Jua'; }
.td-legend span{ display:flex; align-items:center; gap:5px; } .td-legend i{ width:11px; height:11px; border-radius:4px; }

.td-month{ padding:16px; }
.td-monthhead{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
.td-monthhead h3{ font-family:'Jua'; font-size:15px; margin:0; color:var(--ink); }
.td-monthhead button{ width:30px; height:30px; border:none; border-radius:50%; background:var(--soft2); font-size:17px; cursor:pointer; color:var(--ink); }
.td-monthdow{ display:grid; grid-template-columns:repeat(7,1fr); margin-bottom:6px; }
.td-monthdow span{ text-align:center; font-size:11px; color:var(--muted); font-family:'Jua'; }
.td-monthgrid{ display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
.td-mcell{ position:relative; aspect-ratio:1; border:none; border-radius:9px; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; background:transparent; }
.td-mcell.empty{ cursor:default; } .td-mcell.sel{ outline:2px solid var(--c1); }
.td-mnum{ font-size:12px; color:var(--ink); font-family:'Gowun Dodum'; }
.td-mdot{ position:absolute; bottom:4px; width:5px; height:5px; border-radius:50%; }
.td-mlegend{ display:flex; gap:14px; justify-content:center; margin-top:12px; font-size:11px; color:var(--muted); font-family:'Jua'; }
.td-mlegend span{ display:flex; align-items:center; gap:5px; } .td-mlegend i{ width:12px; height:12px; border-radius:4px; } .td-mlegend i.dot{ width:7px; height:7px; border-radius:50%; }

.td-debt{ font-size:13px; color:var(--muted); margin-top:9px; text-align:center; } .td-debt b{ font-family:'Jua'; }
.td-moodchip{ font-size:19px; padding:8px 0; }
.td-couple{ padding:16px; margin-bottom:12px; }
.td-couple h3{ font-family:'Jua'; font-size:15px; margin:0 0 10px; color:var(--ink); }
.td-couplerow{ display:grid; grid-template-columns:1fr 1fr; gap:9px; margin-bottom:10px; }
.td-couplemsg{ font-family:'Jua'; font-size:13px; color:var(--c2); text-align:center; margin:0; }
.td-savebar{ display:flex; align-items:center; gap:10px; margin-top:10px; }
.td-savebtn{ flex:1; padding:12px; border:none; border-radius:13px; background:var(--soft2); color:var(--c2); font-family:'Jua'; font-size:14px; cursor:pointer; }
.td-savebtn:active{ transform:scale(.98); }
.td-savedok{ font-family:'Jua'; font-size:13px; color:#3DAE7B; animation:pop .3s ease; }
.td-monthreport{ padding:16px; margin-top:12px; }
.td-monthreport h3{ font-family:'Jua'; font-size:15px; margin:0 0 12px; color:var(--ink); }
.td-viewonly{ text-align:center; font-family:'Jua'; font-size:12px; color:var(--muted); background:var(--glass); border:1px dashed var(--line); border-radius:12px; padding:8px; margin-bottom:10px; }
.td-gototoday{ display:block; margin:5px auto 0; border:none; background:var(--soft); color:var(--c2); font-family:'Jua'; font-size:11px; padding:3px 12px; border-radius:999px; cursor:pointer; }
.td-yesterday{ width:100%; margin-top:9px; padding:9px; border:1px dashed var(--soft); border-radius:11px; background:transparent; color:var(--muted); font-family:'Jua'; font-size:13px; cursor:pointer; }
.td-bhead{ width:100%; display:flex; align-items:center; gap:8px; background:none; border:none; padding:0; cursor:pointer; text-align:left; }
.td-blabel2{ font-family:'Jua'; font-size:15px; color:var(--ink); }
.td-bsum{ margin-left:auto; font-size:12px; color:var(--muted); max-width:56%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.td-bsum.ok{ color:var(--c2); font-family:'Jua'; }
.td-bcaret{ font-style:normal; color:var(--muted); font-size:11px; flex:0 0 auto; }
.td-bbody{ margin-top:9px; }
.td-maincard input:disabled,.td-maincard textarea:disabled,.td-times input:disabled,.td-goalrow input:disabled{ opacity:.95; }
.td-toggle:disabled,.td-chip:disabled,.td-daychip:disabled{ cursor:default; }
.td-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:16px; font-size:12px; color:var(--muted); }
.td-foot button{ border:none; background:none; color:var(--muted); text-decoration:underline; cursor:pointer; font-size:12px; font-family:inherit; }

.td-bottomnav{ position:fixed; left:50%; transform:translateX(-50%); bottom:12px; z-index:20; width:calc(100% - 24px); max-width:436px; display:flex; gap:4px; padding:6px; border-radius:20px; box-shadow:0 8px 24px var(--shadow); }
.td-navbtn{ flex:1; border:none; background:transparent; color:var(--muted); font-family:'Jua'; font-size:11px; padding:8px 0; border-radius:14px; cursor:pointer; display:flex; flex-direction:column; align-items:center; gap:3px; }
.td-navbtn span{ font-size:19px; } .td-navbtn.on{ background:var(--c1); color:#fff; }

.td-confetti{ position:fixed; inset:0; pointer-events:none; z-index:40; overflow:hidden; }
.td-confetti b{ position:absolute; top:-20px; left:var(--l); width:9px; height:14px; border-radius:2px; transform:rotate(var(--rot)); animation:fall 2.1s ease-in forwards; animation-delay:var(--dl); }
.td-celebmsg{ position:absolute; top:38%; left:50%; transform:translate(-50%,-50%); background:var(--card); color:var(--ink); font-family:'Jua'; font-size:17px; padding:14px 22px; border-radius:16px; box-shadow:0 8px 24px var(--shadow); animation:pop .4s ease; }

@keyframes twinkle{ 0%,100%{ opacity:.4; transform:scale(.8);} 50%{ opacity:1; transform:scale(1.2);} }
@keyframes shimmer{ 0%{ transform:translateX(-100%);} 60%,100%{ transform:translateX(200%);} }
@keyframes pop{ 0%{ transform:scale(.9);} 50%{ transform:scale(1.06);} 100%{ transform:scale(1);} }
@keyframes floatup{ 0%{ opacity:1; transform:translate(-50%,-50%);} 100%{ opacity:0; transform:translate(calc(-50% + var(--tx)),-260%);} }
@keyframes fall{ 0%{ opacity:1; top:-20px;} 100%{ opacity:.9; top:105%;} }
.td-breathe{ animation:breathe 3.4s ease-in-out infinite; }
@keyframes breathe{ 0%,100%{ transform:scale(1);} 50%{ transform:scale(1.04);} }
@media (prefers-reduced-motion: reduce){ .td-breathe,.td-shimmer,.td-spark,.td-burst b,.td-confetti b{ animation:none!important; } .td-bar,.td-chargefill,.td-progfill,.td-wrap{ transition:none; } }
`;

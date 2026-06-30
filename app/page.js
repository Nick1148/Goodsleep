"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

// ── date / sleep utils ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const addDays = (k, n) => { const [y, m, d] = k.split("-").map(Number); return ymd(new Date(y, m - 1, d + n)); };
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const labelDate = (k) => { const [y, m, d] = k.split("-").map(Number); const dt = new Date(y, m - 1, d); return { md: `${m}월 ${d}일`, dow: DOW[dt.getDay()], short: `${m}/${d}` }; };
const sleepMinutes = (bed, wake) => { if (!bed || !wake) return null; const [bh, bm] = bed.split(":").map(Number); const [wh, wm] = wake.split(":").map(Number); let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440; return m; };
const fmtSleep = (m) => m == null ? "—" : (m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${Math.floor(m / 60)}시간`);
const sleepMood = (m) => {
  if (m == null) return { emoji: "🌙", msg: "오늘 몇 시간 잤어?", sleepy: true };
  const h = m / 60;
  if (h < 5) return { emoji: "🥱", msg: "많이 피곤하겠다…", sleepy: true };
  if (h < 6.5) return { emoji: "😪", msg: "조금 더 자도 좋아", sleepy: true };
  if (h <= 9) return { emoji: "😊", msg: "푹 잤네요!", sleepy: false };
  return { emoji: "💤", msg: "든든하게 충전 완료!", sleepy: false };
};
const FIELDS = () => ({ bed: "", wake: "", exercise: false, exNote: "", snack: -1, snackNote: "", gratitude: ["", "", ""], reflection: "" });
const blankEntry = () => ({ ...FIELDS(), cheers: 0 });
const dataForDb = (e) => { const { cheers, ...rest } = e; return rest; };
const entryFromRow = (row) => ({ ...FIELDS(), ...(row.data || {}), cheers: row.cheers ?? 0 });
const SNACKS = ["안 먹음", "조금", "보통", "많이"];

const THEME = {
  a: { name: "테사호드관", type: "불꽃", emoji: "🔥", c1: "#FF7043", c2: "#EC4040", soft: "#FFE0CC", soft2: "#FFF0E6", grat: "#FFF7E8", gratLine: "#F2D9A0", gratTxt: "#C98A1E", sky: "linear-gradient(180deg,#FFB37A,#FF8A5B)" },
  b: { name: "지인", type: "페어리", emoji: "✨", c1: "#FF8FB3", c2: "#B07BE0", soft: "#FBD7E8", soft2: "#FFF1F7", grat: "#FFF5FC", gratLine: "#EFC9E2", gratTxt: "#C45C9E", sky: "linear-gradient(180deg,#FFB6D2,#C79BE8)" },
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
function FairyBuddy({ sleepy }) {
  return (
    <img
      src="/seal.jpg"
      alt="지인"
      style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
    />
  );
}

const LS_CODE = "couple-code";
const LS_ME = "couple-me";

export default function Page() {
  const [code, setCode] = useState(null);
  const [me, setMe] = useState("a");
  const [ready, setReady] = useState(false);

  // login form state
  const [codeInput, setCodeInput] = useState("");
  const [meInput, setMeInput] = useState("a");

  const [days, setDays] = useState({});
  const [date, setDate] = useState(today());
  const [page, setPage] = useState("a");
  const [loading, setLoading] = useState(true);
  const saveTimers = useRef({});

  // restore session
  useEffect(() => {
    try {
      const c = localStorage.getItem(LS_CODE);
      const m = localStorage.getItem(LS_ME);
      if (c) { setCode(c); setPage(m === "b" ? "b" : "a"); setMe(m === "b" ? "b" : "a"); }
    } catch (e) {}
    setReady(true);
  }, []);

  // load + realtime when code set
  useEffect(() => {
    if (!code) return;
    let channel;
    (async () => {
      setLoading(true);
      const { data: rows, error } = await supabase.from("entries").select("*").eq("couple_code", code);
      const next = {};
      if (!error && rows) rows.forEach((r) => { next[r.date] = next[r.date] || {}; next[r.date][r.slot] = entryFromRow(r); });
      setDays(next);
      setLoading(false);

      channel = supabase
        .channel("entries-" + code)
        .on("postgres_changes", { event: "*", schema: "public", table: "entries", filter: `couple_code=eq.${code}` }, (payload) => {
          const row = payload.new;
          if (!row || !row.date || !row.slot) return;
          setDays((prev) => {
            const day = { ...(prev[row.date] || {}) };
            if (row.slot === me) {
              // my own row: keep my local edits, only sync cheers from partner
              const mine = day[me] || blankEntry();
              day[me] = { ...mine, cheers: row.cheers ?? mine.cheers };
            } else {
              day[row.slot] = entryFromRow(row);
            }
            return { ...prev, [row.date]: day };
          });
        })
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [code, me]);

  const login = () => {
    const c = codeInput.trim().toLowerCase();
    if (!c) return;
    try { localStorage.setItem(LS_CODE, c); localStorage.setItem(LS_ME, meInput); } catch (e) {}
    setCode(c); setMe(meInput); setPage(meInput);
  };
  const logout = () => {
    try { localStorage.removeItem(LS_CODE); localStorage.removeItem(LS_ME); } catch (e) {}
    setCode(null); setDays({}); setCodeInput("");
  };

  const getEntry = (slot) => (days[date] && days[date][slot]) || blankEntry();

  const pushData = (slot, entry) => {
    const k = `${date}:${slot}`;
    if (saveTimers.current[k]) clearTimeout(saveTimers.current[k]);
    saveTimers.current[k] = setTimeout(() => {
      supabase.from("entries").upsert(
        { couple_code: code, date, slot, data: dataForDb(entry), updated_at: new Date().toISOString() },
        { onConflict: "couple_code,date,slot" }
      ).then(() => {});
    }, 600);
  };

  const updateEntry = (slot, patch) => {
    setDays((prev) => {
      const day = { ...(prev[date] || {}) };
      const entry = { ...(day[slot] || blankEntry()), ...patch };
      day[slot] = entry;
      pushData(slot, entry);
      return { ...prev, [date]: day };
    });
  };

  const sendCheer = (slot) => {
    setDays((prev) => {
      const day = { ...(prev[date] || {}) };
      const entry = { ...(day[slot] || blankEntry()) };
      entry.cheers = (entry.cheers || 0) + 1;
      day[slot] = entry;
      supabase.from("entries").upsert(
        { couple_code: code, date, slot, cheers: entry.cheers, updated_at: new Date().toISOString() },
        { onConflict: "couple_code,date,slot" }
      ).then(() => {});
      return { ...prev, [date]: day };
    });
  };

  const hasEntry = (e) => !!e && (e.bed || e.wake || e.exercise || e.exNote || e.snack >= 0 || e.snackNote || e.gratitude?.some((g) => g.trim()) || e.reflection?.trim());
  const streakFor = (slot) => { let n = 0, cur = today(); for (let i = 0; i < 400; i++) { const d = days[cur]; if (d && hasEntry(d[slot])) { n++; cur = addDays(cur, -1); } else break; } return n; };

  // ── login screen ──
  if (!ready) return <div className="td-wrap" style={themeVars(THEME.a)}><style>{css}</style><div className="td-loading">불러오는 중…</div></div>;
  if (!code) {
    return (
      <div className="td-wrap" style={themeVars(THEME.a)}>
        <style>{css}</style>
        <div className="td-login">
          <div className="td-loginbuddy"><FireBuddy sleepy={false} /></div>
          <h1>우리의 하루</h1>
          <p>둘만의 공유 코드를 입력하면 같은 기록을 함께 봐요.</p>
          <input className="td-input" placeholder="공유 코드 (예: jiin-tessa-2026)" value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} />
          <div className="td-whopick">
            <span>나는</span>
            {["a", "b"].map((p) => (
              <button key={p} className={"td-whobtn" + (meInput === p ? " on" : "")} onClick={() => setMeInput(p)} style={{ "--tc": THEME[p].c1 }}>
                {THEME[p].emoji} {THEME[p].name}
              </button>
            ))}
          </div>
          <button className="td-loginbtn" onClick={login}>시작하기</button>
          <small className="td-loginhint">같은 코드를 두 사람이 입력하면 연결돼요.</small>
        </div>
      </div>
    );
  }

  // ── main ──
  const week = []; for (let i = 6; i >= 0; i--) week.push(addDays(today(), -i));
  let wSum = 0, wCnt = 0; week.forEach((dk) => { const m = sleepMinutes(days[dk]?.[page]?.bed, days[dk]?.[page]?.wake); if (m) { wSum += m; wCnt++; } });
  const wAvg = wCnt ? Math.round(wSum / wCnt) : null;
  const { md, dow } = labelDate(date); const isToday = date === today();
  const t = THEME[page]; const e = getEntry(page); const mins = sleepMinutes(e.bed, e.wake); const mood = sleepMood(mins);
  const charge = mins ? Math.min(100, Math.round((mins / 480) * 100)) : 0;

  return (
    <div className="td-wrap" style={themeVars(t)}>
      <style>{css}</style>
      <div className="td-app">

        <div className="td-tabs">
          {["a", "b"].map((p) => (
            <button key={p} className={"td-tab" + (page === p ? " on" : "")} onClick={() => setPage(p)} style={{ "--tc": THEME[p].c1 }}>
              <span>{THEME[p].emoji}</span>{THEME[p].name}{p === me ? " (나)" : ""}
            </button>
          ))}
        </div>

        <div className="td-datenav">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="이전">‹</button>
          <div className="td-date"><b>{md}</b><small>{dow}요일{isToday ? " · 오늘" : ""}</small></div>
          <button onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="다음">›</button>
        </div>

        <div className="td-hero">
          <div className="td-buddywrap">
            <div className="td-buddy">{page === "a" ? <FireBuddy sleepy={mood.sleepy} /> : <FairyBuddy sleepy={mood.sleepy} />}</div>
            <div className="td-name">{t.name}<span className="td-badge">{t.emoji}{t.type}</span></div>
            <div className="td-streak">🔥 {streakFor(page)}일 연속</div>
          </div>
          <div className="td-sleepcard">
            <div className="td-sleephead"><span>😴 오늘 수면</span><b>{fmtSleep(mins)}</b></div>
            <div className="td-times">
              <label><i>🌙 잘 때</i><input type="time" value={e.bed} onChange={(ev) => updateEntry(page, { bed: ev.target.value })} /></label>
              <label><i>☀️ 일어난 때</i><input type="time" value={e.wake} onChange={(ev) => updateEntry(page, { wake: ev.target.value })} /></label>
            </div>
            <div className="td-charge"><div className="td-chargefill" style={{ width: charge + "%" }} /></div>
            <div className="td-moodmsg">{mood.emoji} {mood.msg}{wAvg ? <span className="td-avg"> · 이번 주 평균 {fmtSleep(wAvg)}</span> : null}</div>
          </div>
        </div>

        <div className="td-card">
          <div className="td-block">
            <div className="td-blabel">💪 운동</div>
            <button className={"td-toggle" + (e.exercise ? " on" : "")} onClick={() => updateEntry(page, { exercise: !e.exercise })}>{e.exercise ? "✓ 오늘 운동 완료!" : "오늘 운동했어?"}</button>
            {e.exercise && <input className="td-input" placeholder="뭐 했어? (예: 런닝 30분)" value={e.exNote} onChange={(ev) => updateEntry(page, { exNote: ev.target.value })} />}
          </div>
          <div className="td-block">
            <div className="td-blabel">🍪 간식</div>
            <div className="td-chips">{SNACKS.map((s, i) => (<button key={i} className={"td-chip" + (e.snack === i ? " on" : "")} onClick={() => updateEntry(page, { snack: e.snack === i ? -1 : i })}>{s}</button>))}</div>
            {e.snack > 0 && <input className="td-input" placeholder="뭐 먹었어? (예: 초콜릿, 과자, 아이스크림)" value={e.snackNote} onChange={(ev) => updateEntry(page, { snackNote: ev.target.value })} />}
          </div>
          <div className="td-block td-gratblock">
            <div className="td-blabel td-gratlabel">⭐ 오늘의 3감사</div>
            {[0, 1, 2].map((i) => (<input key={i} className="td-input td-gratinput" placeholder={`${i + 1}. 감사한 일`} value={e.gratitude[i]} onChange={(ev) => { const g = [...e.gratitude]; g[i] = ev.target.value; updateEntry(page, { gratitude: g }); }} />))}
          </div>
          <div className="td-block">
            <div className="td-blabel">📓 한 줄 후기</div>
            <textarea className="td-area" rows={2} placeholder="오늘 하루는 어땠어?" value={e.reflection} onChange={(ev) => updateEntry(page, { reflection: ev.target.value })} />
          </div>
          <div className="td-cheerrow">
            {e.cheers > 0 && <span className="td-cheercount">받은 응원 {e.cheers}</span>}
            <button className="td-cheerbtn" onClick={() => sendCheer(page)}><span className="td-ball" style={{ "--bt": t.c1 }}><span className="td-balltop" /><span className="td-ballband" /><span className="td-ballbtn">♥</span></span>응원볼 던지기</button>
          </div>
        </div>

        <div className="td-week">
          <h3>📊 이번 주 수면 리듬</h3>
          <div className="td-bars">
            {week.map((dk) => {
              const d = days[dk] || {}; const ma = sleepMinutes(d.a?.bed, d.a?.wake); const mb = sleepMinutes(d.b?.bed, d.b?.wake); const lab = labelDate(dk);
              return (
                <button key={dk} className={"td-daycol" + (dk === date ? " sel" : "")} onClick={() => setDate(dk)}>
                  <div className="td-barpair">
                    <span className="td-bar" style={{ height: (ma ? Math.min(100, ma / 540 * 100) : 0) + "%", background: THEME.a.c1 }} />
                    <span className="td-bar" style={{ height: (mb ? Math.min(100, mb / 540 * 100) : 0) + "%", background: THEME.b.c1 }} />
                  </div>
                  <span className="td-daylab">{lab.short}</span>
                </button>
              );
            })}
          </div>
          <div className="td-legend"><span><i style={{ background: THEME.a.c1 }} />{THEME.a.name}</span><span><i style={{ background: THEME.b.c1 }} />{THEME.b.name}</span></div>
        </div>

        <div className="td-foot">
          <span>{loading ? "동기화 중…" : "✓ 실시간 동기화됨"} · 코드: {code}</span>
          <button onClick={logout}>코드 변경</button>
        </div>
      </div>
    </div>
  );
}

const themeVars = (t) => ({ "--c1": t.c1, "--c2": t.c2, "--soft": t.soft, "--soft2": t.soft2, "--grat": t.grat, "--gratline": t.gratLine, "--grattxt": t.gratTxt, "--sky": t.sky });

const css = `
@import url('https://fonts.googleapis.com/css2?family=Jua&family=Gowun+Dodum&display=swap');
.td-wrap{ --ink:#3E3531; --muted:#AEA399; font-family:'Gowun Dodum',system-ui,sans-serif; background:var(--soft2,#FFF1E6); color:var(--ink); min-height:100vh; padding:14px 12px 30px; transition:background .35s; -webkit-text-size-adjust:100%; -webkit-font-smoothing:antialiased; }
.td-wrap *{ box-sizing:border-box; }
.td-loading{ text-align:center; padding:80px 0; color:var(--muted); font-family:'Jua'; }
.td-app{ width:100%; max-width:440px; margin:0 auto; }

.td-login{ width:100%; max-width:380px; margin:8vh auto 0; background:#fff; border-radius:24px; padding:26px 22px; box-shadow:0 8px 24px rgba(0,0,0,.08); text-align:center; }
.td-loginbuddy{ width:90px; height:90px; margin:0 auto 10px; border-radius:50%; background:var(--sky); display:flex; align-items:center; justify-content:center; padding:9px; }
.td-login h1{ font-family:'Jua'; font-size:26px; margin:0 0 6px; }
.td-login p{ font-size:14px; color:var(--muted); margin:0 0 18px; }
.td-whopick{ display:flex; align-items:center; gap:7px; margin:12px 0; flex-wrap:wrap; justify-content:center; font-size:14px; color:var(--muted); }
.td-whobtn{ border:2px solid var(--soft); background:#fff; color:var(--ink); font-family:'Jua'; font-size:14px; padding:8px 13px; border-radius:999px; cursor:pointer; }
.td-whobtn.on{ background:var(--tc); border-color:var(--tc); color:#fff; }
.td-loginbtn{ width:100%; margin-top:8px; padding:14px; border:none; border-radius:14px; background:var(--c1); color:#fff; font-family:'Jua'; font-size:17px; cursor:pointer; }
.td-loginhint{ display:block; margin-top:12px; color:var(--muted); font-size:12px; }

.td-tabs{ display:flex; gap:8px; margin-bottom:12px; }
.td-tab{ flex:1; min-width:0; border:none; background:#fff; color:var(--ink); font-family:'Jua'; font-size:14px; padding:11px 6px; border-radius:14px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; opacity:.6; box-shadow:0 2px 6px rgba(0,0,0,.05); }
.td-tab span{ font-size:15px; } .td-tab.on{ background:var(--tc); color:#fff; opacity:1; }

.td-datenav{ display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom:12px; }
.td-datenav button{ width:34px; height:34px; flex:0 0 auto; border-radius:50%; border:none; background:#fff; font-size:19px; cursor:pointer; color:var(--ink); box-shadow:0 2px 5px rgba(0,0,0,.06); }
.td-datenav button:disabled{ opacity:.35; }
.td-date{ text-align:center; } .td-date b{ font-family:'Jua'; font-size:20px; display:block; line-height:1.15; } .td-date small{ font-size:12px; color:var(--muted); }

.td-hero{ background:#fff; border-radius:22px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.07); margin-bottom:12px; }
.td-buddywrap{ display:flex; flex-direction:column; align-items:center; gap:4px; margin-bottom:14px; }
.td-buddy{ width:84px; height:84px; border-radius:50%; background:var(--sky); display:flex; align-items:center; justify-content:center; padding:8px; }
.td-name{ font-family:'Jua'; font-size:21px; display:flex; align-items:center; gap:7px; }
.td-badge{ font-family:'Jua'; font-size:11px; background:var(--c1); color:#fff; padding:3px 9px; border-radius:999px; }
.td-streak{ font-size:13px; color:var(--muted); }
.td-sleepcard{ background:var(--soft2); border-radius:16px; padding:14px; }
.td-sleephead{ display:flex; align-items:baseline; justify-content:space-between; margin-bottom:10px; }
.td-sleephead span{ font-family:'Jua'; font-size:16px; } .td-sleephead b{ font-family:'Jua'; font-size:22px; color:var(--c2); }
.td-times{ display:flex; gap:8px; }
.td-times label{ flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
.td-times input{ width:100%; border:2px solid var(--soft); border-radius:11px; padding:9px 6px; font-family:'Gowun Dodum'; font-size:15px; color:var(--ink); background:#fff; }
.td-charge{ height:13px; background:var(--soft); border-radius:999px; margin-top:11px; overflow:hidden; }
.td-chargefill{ height:100%; background:linear-gradient(90deg,var(--c1),var(--c2)); border-radius:999px; transition:width .4s; }
.td-moodmsg{ font-family:'Jua'; font-size:14px; margin-top:9px; text-align:center; } .td-avg{ color:var(--muted); font-size:12px; }

.td-card{ background:#fff; border-radius:22px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.07); }
.td-block{ margin-bottom:16px; } .td-block:last-of-type{ margin-bottom:8px; }
.td-blabel{ font-family:'Jua'; font-size:15px; margin-bottom:8px; }
.td-toggle{ width:100%; padding:13px; border:2px dashed var(--soft); border-radius:13px; background:#fff; font-family:'Jua'; font-size:15px; color:var(--muted); cursor:pointer; }
.td-toggle.on{ background:var(--c1); border-style:solid; border-color:var(--c1); color:#fff; }
.td-input{ width:100%; margin-top:9px; padding:11px 13px; border:2px solid var(--soft); border-radius:12px; font-family:'Gowun Dodum'; font-size:15px; background:#fff; color:var(--ink); }
.td-input::placeholder,.td-area::placeholder{ color:#cabfb4; }
.td-chips{ display:flex; gap:6px; }
.td-chip{ flex:1; min-width:0; padding:10px 0; border:2px solid var(--soft); border-radius:11px; background:#fff; font-family:'Jua'; font-size:13px; color:var(--ink); cursor:pointer; }
.td-chip.on{ background:var(--c1); border-color:var(--c1); color:#fff; }
.td-gratblock{ background:var(--grat); border:2px solid var(--gratline); border-radius:15px; padding:13px; }
.td-gratlabel{ color:var(--grattxt); } .td-gratinput{ margin-top:8px; } .td-gratinput:first-of-type{ margin-top:0; }
.td-area{ width:100%; padding:11px 13px; border:2px solid var(--soft); border-radius:13px; font-family:'Gowun Dodum'; font-size:15px; resize:vertical; background:#fff; color:var(--ink); }
.td-cheerrow{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-top:4px; }
.td-cheercount{ font-family:'Jua'; font-size:13px; color:var(--c2); }
.td-cheerbtn{ margin-left:auto; border:2px solid var(--c1); color:var(--c2); background:#fff; padding:10px 16px; border-radius:999px; font-family:'Jua'; font-size:14px; cursor:pointer; display:flex; align-items:center; gap:8px; }
.td-cheerbtn:active{ transform:scale(.95); }
.td-ball{ position:relative; width:20px; height:20px; border-radius:50%; overflow:hidden; display:inline-block; border:2px solid #2b2b2b; flex:0 0 auto; background:#fff; }
.td-balltop{ position:absolute; inset:0 0 50% 0; background:var(--bt); }
.td-ballband{ position:absolute; top:50%; left:0; right:0; height:3px; transform:translateY(-50%); background:#2b2b2b; }
.td-ballbtn{ position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:9px; height:9px; background:#fff; border:1.5px solid #2b2b2b; border-radius:50%; font-size:6px; line-height:7px; text-align:center; color:#ff5c8a; }

.td-week{ background:#fff; border-radius:22px; padding:16px; box-shadow:0 6px 18px rgba(0,0,0,.07); margin-top:12px; }
.td-week h3{ font-family:'Jua'; font-size:15px; margin:0 0 14px; }
.td-bars{ display:flex; gap:5px; align-items:flex-end; }
.td-daycol{ flex:1; min-width:0; display:flex; flex-direction:column; align-items:center; gap:6px; background:none; border:none; cursor:pointer; padding:5px 1px; border-radius:9px; }
.td-daycol.sel{ background:var(--soft); }
.td-barpair{ display:flex; gap:3px; align-items:flex-end; height:60px; }
.td-bar{ width:8px; border-radius:5px 5px 0 0; min-height:4px; transition:height .35s; }
.td-daylab{ font-size:10px; color:var(--muted); font-family:'Jua'; }
.td-legend{ display:flex; gap:16px; justify-content:center; margin-top:12px; font-size:12px; color:var(--muted); font-family:'Jua'; }
.td-legend span{ display:flex; align-items:center; gap:5px; } .td-legend i{ width:11px; height:11px; border-radius:4px; }
.td-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:16px; font-size:12px; color:var(--muted); }
.td-foot button{ border:none; background:none; color:var(--muted); text-decoration:underline; cursor:pointer; font-size:12px; font-family:inherit; }
@media (prefers-reduced-motion: reduce){ .td-bar,.td-chargefill,.td-wrap{ transition:none; } }
`;

// 10분마다 실행: 취침 10분 전 리마인더 / 주간 리뷰(일요일) / 월간 리포트(매월 말일) 발송
const webpush = require("web-push");

const { SUPABASE_URL, ANON, BACKUP_SECRET, VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
webpush.setVapidDetails("mailto:goodsleep@nick.app", VAPID_PUBLIC, VAPID_PRIVATE);

const pad = (n) => String(n).padStart(2, "0");
const BED_MSG = { title: "우리의 하루", body: "이제 잘 시간이야. 푹 자 🌙", tag: "bed" };
const REVIEW_MSG = { title: "우리의 하루", body: "이번 주 너의 행동일지 리뷰야, 확인하장 📊", tag: "review" };
const MONTHLY_MSG = { title: "우리의 하루", body: "이번 달 리포트가 나왔어요 📅 확인해볼까요?", tag: "monthly" };

const dayOfYear = (dk) => { const [y, m, d] = dk.split("-").map(Number); return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000); };
const QUOTES = {
  a: {
    tired: ["잘 못 잔 밤도 몸은 기억하고 있어. 오늘은 무리하지 않아도 괜찮아.", "피곤함은 약점이 아니라 신호야. 오늘은 그 신호를 따라가봐.", "쉬어가는 것도 나아가는 방법 중 하나야.", "느린 아침이라고 나쁜 하루는 아니야.", "몸이 무거운 날엔, 마음이라도 가볍게 두자."],
    rested: ["잘 잔 아침은 그 자체로 하루의 절반을 이긴 거야.", "충전된 오늘, 무엇이든 시도해볼 만해.", "좋은 잠은 최고의 전략이었어.", "맑은 정신으로 시작하는 하루, 반갑다.", "오늘의 컨디션을 오늘 안에 다 쓸 필요는 없어. 천천히 써도 돼."],
    exercise: ["몸을 움직이는 건 마음을 정돈하는 일이기도 해.", "오늘은 몸에게 안부를 물어볼 차례야.", "작은 움직임이 큰 변화를 만든다는 걸, 넌 이미 알고 있잖아.", "땀 한 방울이 오늘의 생각을 더 또렷하게 해줄 거야.", "운동은 미래의 나에게 보내는 선물이야."],
    monday: ["한 주의 시작은 완벽할 필요 없어. 그냥 시작하면 돼.", "월요일의 무게는 누구에게나 있어. 너만 그런 게 아니야.", "새로운 7일, 어제와 다르게 살아볼 이유는 충분해.", "천천히 켜지는 엔진도 결국 잘 달려.", "이번 주도, 너답게."],
    weekend: ["주말엔 아무것도 안 해도 잘하고 있는 거야.", "쉼도 계획의 일부야.", "오늘은 시간에 쫓기지 않아도 되는 날.", "여백이 있어야 다음 문장을 쓸 수 있어.", "느긋함도 재능이야."],
    general: ["오늘 하루도, 있는 그대로 잘 지내보자.", "완벽한 하루보다, 솔직한 하루가 낫다.", "작게 쌓인 것들이 결국 단단한 걸 만들어.", "지금 이 순간에 집중하는 것만으로도 충분해.", "오늘의 나에게 조금 너그러워지자."],
  },
  b: {
    tired: ["어젯밤 잠이 부족했지? 오늘은 나한테 조금 기대도 돼 🤍", "피곤한 날엔 커피 한 잔이 우리 편이야 ☕", "무리하지 말고, 딱 할 수 있는 만큼만 하자!", "졸린 눈도 예뻐. 오늘 하루도 잘 부탁해 🌙", "잠이 부족해도, 넌 오늘도 충분히 잘하고 있어."],
    rested: ["잘 잤다니 완전 다행이야! 오늘 컨디션 최고겠다 ✨", "상쾌한 아침이네! 오늘 하루도 반짝반짝하자 🌟", "푹 잔 너, 오늘 뭘 해도 잘될 것 같아!", "좋은 잠은 좋은 하루의 시작! 오늘도 화이팅 💪", "컨디션 좋은 너를 보니까 나도 기분 좋다 😊"],
    exercise: ["오늘은 몸 움직이는 날! 살살 몸 풀어보자 🏃‍♀️", "운동하고 나면 기분이 뿅 좋아질 거야!", "오늘의 운동, 내가 옆에서 응원할게 📣", "땀 흘리고 난 뒤의 개운함, 기대해도 좋아!", "몸도 마음도 튼튼하게, 오늘도 화이팅!"],
    monday: ["월요일이지만 우리 씩씩하게 가보자! 🐣", "새로운 한 주, 좋은 일만 가득하길!", "월요병엔 애정이 특효약이래 (내가 방금 만든 말) 💕", "이번 주도 우리 잘 해낼 수 있어!", "월요일도 네 편이 있다는 거, 잊지 마 🤍"],
    weekend: ["주말이다! 오늘은 마음껏 게을러도 괜찮아 🛋️", "느긋한 하루 보내, 나도 같이 뒹굴거릴게 😌", "주말엔 뭐 하고 놀까, 생각만 해도 신나!", "푹 쉬는 것도 오늘의 할 일이야!", "주말 햇살처럼 나른하고 좋은 하루 보내 ☀️"],
    general: ["오늘 하루도 네가 있어서 든든해 🤍", "좋은 아침! 오늘도 예쁜 하루 보내자 🌸", "매일 조금씩 애쓰는 너, 진짜 멋져!", "오늘도 너의 하루를 응원할게!", "작은 일에도 웃을 수 있는 하루 되길!"],
  },
};
const sleepMinutes = (bed, wake) => {
  if (!bed || !wake) return null;
  const [bh, bm] = bed.split(":").map(Number); const [wh, wm] = wake.split(":").map(Number);
  let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440; return m;
};

async function rpc(fn, body) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${txt}`);
  return txt ? JSON.parse(txt) : null;
}

async function sendRedemptionPushes() {
  const rows = await rpc("gs_redeem_unnotified", { p_secret: BACKUP_SECRET });
  if (!rows || !rows.length) return;
  const subs = await rpc("gs_push_targets", { p_secret: BACKUP_SECRET });
  for (const req of rows) {
    const partnerSlot = req.requester === "a" ? "b" : "a";
    const target = (subs || []).find((s) => s.couple_code === req.couple_code && s.slot === partnerSlot);
    if (target) {
      await send(target, { title: "우리의 하루", body: `🎁 ${req.title} 요청이 도착했어요!`, tag: "redeem" });
    }
    await rpc("gs_redeem_mark_notified", { p_secret: BACKUP_SECRET, p_id: req.id });
  }
}

async function sendMessagePushes() {
  const rows = await rpc("gs_msgs_unnotified", { p_secret: BACKUP_SECRET });
  if (!rows || !rows.length) return;
  const subs = await rpc("gs_push_targets", { p_secret: BACKUP_SECRET });
  for (const m of rows) {
    const target = (subs || []).find((s) => s.couple_code === m.couple_code && s.slot === m.to_slot);
    if (target) {
      const body = m.kind === "letter" ? "💌 숨겨둔 쪽지가 도착했어요! 열어보세요" : `💝 ${m.message} 선물이 도착했어요!`;
      await send(target, { title: "우리의 하루", body, tag: m.kind });
    }
    await rpc("gs_msg_mark_notified", { p_secret: BACKUP_SECRET, p_id: m.id });
  }
}

// 상대 활동 알림: 연인이 오늘 기록/질문답변을 남기면 상대에게 알림
async function sendActivityPushes() {
  const rows = await rpc("gs_activity_unnotified", { p_secret: BACKUP_SECRET });
  if (!rows || !rows.length) return;
  const subs = await rpc("gs_push_targets", { p_secret: BACKUP_SECRET });
  const BODY = {
    daily: "💛 연인이 오늘의 기록을 남겼어요! 나도 남겨볼까요?",
    qa: "💬 연인이 오늘의 질문에 답했어요! 확인해보세요",
  };
  for (const a of rows) {
    const partnerSlot = a.actor_slot === "a" ? "b" : "a";
    const target = (subs || []).find((s) => s.couple_code === a.couple_code && s.slot === partnerSlot);
    if (target) await send(target, { title: "우리의 하루", body: BODY[a.kind] || BODY.daily, tag: "activity" });
    await rpc("gs_activity_mark_notified", { p_secret: BACKUP_SECRET, p_id: a.id });
  }
}

async function send(row, msg) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(msg)
    );
    return true;
  } catch (err) {
    console.log(`send fail ${row.couple_code}/${row.slot}: ${err.statusCode || err.message}`);
    if (err.statusCode === 404 || err.statusCode === 410) {
      await rpc("gs_delete_sub", { p_code: row.couple_code, p_slot: row.slot }).catch(() => {});
    }
    return false;
  }
}

const coupleCache = {};
async function getCoupleData(code) {
  if (coupleCache[code]) return coupleCache[code];
  const rows = await rpc("gs_get", { p_code: code }).catch(() => []);
  const days = {}, goals = {};
  (rows || []).forEach((r) => {
    if (r.date === "__goals__") goals[r.slot] = r.data || {};
    else { days[r.date] = days[r.date] || {}; days[r.date][r.slot] = r.data || {}; }
  });
  coupleCache[code] = { days, goals };
  return coupleCache[code];
}
function quoteFor(slot, localDate, dowMon, days, goals) {
  const g = goals[slot] || {};
  const exerciseDays = g.exerciseDays || [];
  const sleepHours = g.sleepHours || 7.5;
  let cat = "general";
  if (exerciseDays.includes(dowMon)) cat = "exercise";
  else {
    const yDate = new Date(new Date(localDate).getTime() - 86400000);
    const yKey = `${yDate.getUTCFullYear()}-${pad(yDate.getUTCMonth() + 1)}-${pad(yDate.getUTCDate())}`;
    const y = days[yKey]?.[slot];
    const m = y ? sleepMinutes(y.bed, y.wake) : null;
    if (m != null && m < sleepHours * 60 - 30) cat = "tired";
    else if (m != null && m >= sleepHours * 60 - 15) cat = "rested";
    else if (dowMon === 0) cat = "monday";
    else if (dowMon >= 5) cat = "weekend";
  }
  const tone = (g.quoteTone === "a" || g.quoteTone === "b") ? g.quoteTone : slot;
  const pool = QUOTES[tone][cat];
  return pool[dayOfYear(localDate) % pool.length];
}

(async () => {
  const rows = await rpc("gs_push_targets", { p_secret: BACKUP_SECRET });
  if (!rows || !rows.length) { console.log("no subscribers"); return; }
  const now = Date.now();
  let sent = 0;
  for (const row of rows) {
    const local = new Date(now + (row.tz_offset ?? 540) * 60000);
    const localDate = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
    const lHM = local.getUTCHours() * 60 + local.getUTCMinutes();
    const lDow = local.getUTCDay(); // 0=일요일
    const [bh, bm] = (row.bedtime || "23:30").split(":").map(Number);
    const bed = bh * 60 + bm;

    // 취침 리마인더: 목표 취침 정확히 10분 전 기준, ±5분 창(10분 cron 대응), 하루 1회
    const target = (bed - 10 + 1440) % 1440;
    const diff = Math.min((lHM - target + 1440) % 1440, (target - lHM + 1440) % 1440);
    const inBed = diff <= 5;
    console.log(`${row.slot}: local=${pad(Math.floor(lHM/60))}:${pad(lHM%60)} bedtime=${row.bedtime} target=${pad(Math.floor(target/60))}:${pad(target%60)} inWindow=${inBed} last_bed=${row.last_bed}`);
    if (inBed && row.last_bed !== localDate) {
      const { goals: bg } = await getCoupleData(row.couple_code);
      const bmsg = (bg[row.slot] && (bg[row.slot].bedMsg || "").trim()) || BED_MSG.body;
      if (await send(row, { ...BED_MSG, body: bmsg })) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "bed", p_date: localDate }); sent++; }
    }

    // 주간 리뷰: 일요일 19:30~21:30 로컬, 주 1회
    if (lDow === 0 && lHM >= 19 * 60 + 30 && lHM <= 21 * 60 + 30 && row.last_review !== localDate) {
      if (await send(row, REVIEW_MSG)) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "review", p_date: localDate }); sent++; }
    }

    // 월간 리포트: 매월 마지막날 20:00~22:00 로컬, 월 1회
    const tomorrow = new Date(local.getTime() + 86400000);
    const isLastDayOfMonth = tomorrow.getUTCMonth() !== local.getUTCMonth();
    if (isLastDayOfMonth && lHM >= 20 * 60 && lHM <= 22 * 60 && row.last_monthly !== localDate) {
      if (await send(row, MONTHLY_MSG)) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "monthly", p_date: localDate }); sent++; }
    }
  }
  console.log(`done. sent=${sent}, subscribers=${rows.length}`);
  await sendRedemptionPushes();
  await sendMessagePushes();
  await sendActivityPushes();
})().catch((e) => { console.error(e); process.exit(1); });

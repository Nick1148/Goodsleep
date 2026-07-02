// 10분마다 실행: 취침 10분 전 리마인더 / 주간 리뷰(일요일) / 월간 리포트(매월 말일) 발송
const webpush = require("web-push");

const { SUPABASE_URL, ANON, BACKUP_SECRET, VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
webpush.setVapidDetails("mailto:goodsleep@nick.app", VAPID_PUBLIC, VAPID_PRIVATE);

const pad = (n) => String(n).padStart(2, "0");
const BED_MSG = { title: "우리의 하루", body: "테사호드관이 명령한다. 자라. 🌙", tag: "bed" };
const REVIEW_MSG = { title: "우리의 하루", body: "이번 주 너의 행동일지 리뷰야, 확인하장 📊", tag: "review" };
const MONTHLY_MSG = { title: "우리의 하루", body: "이번 달 리포트가 나왔어요 📅 확인해볼까요?", tag: "monthly" };

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
      if (await send(row, BED_MSG)) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "bed", p_date: localDate }); sent++; }
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
})().catch((e) => { console.error(e); process.exit(1); });

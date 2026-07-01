// 매 30분 실행: 각 구독자의 로컬 시간 기준으로 취침 리마인더 / 주간 리뷰 발송
const webpush = require("web-push");

const { SUPABASE_URL, ANON, BACKUP_SECRET, VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
webpush.setVapidDetails("mailto:goodsleep@nick.app", VAPID_PUBLIC, VAPID_PRIVATE);

const pad = (n) => String(n).padStart(2, "0");
const BED_MSG = { title: "우리의 하루", body: "테사호드관이 명령한다. 자라. 🌙", tag: "bed" };
const REVIEW_MSG = { title: "우리의 하루", body: "이번 주 너의 행동일지 리뷰야, 확인하장 📊", tag: "review" };

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
      // 만료된 구독 정리
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

    // 취침 리마인더: 목표 취침 60분 전 ~ 5분 후, 하루 1회
    const inBed = (lHM >= bed - 60 && lHM <= bed + 5) || (bed < 60 && lHM >= bed - 60 + 1440);
    if (inBed && row.last_bed !== localDate) {
      if (await send(row, BED_MSG)) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "bed", p_date: localDate }); sent++; }
    }

    // 주간 리뷰: 일요일 20:00~21:00 로컬, 주 1회
    if (lDow === 0 && lHM >= 20 * 60 && lHM <= 21 * 60 && row.last_review !== localDate) {
      if (await send(row, REVIEW_MSG)) { await rpc("gs_mark_notified", { p_secret: BACKUP_SECRET, p_code: row.couple_code, p_slot: row.slot, p_type: "review", p_date: localDate }); sent++; }
    }
  }
  console.log(`done. sent=${sent}, subscribers=${rows.length}`);
})().catch((e) => { console.error(e); process.exit(1); });

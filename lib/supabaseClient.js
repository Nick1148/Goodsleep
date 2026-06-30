import { createClient } from "@supabase/supabase-js";

// 공개(publishable) 키 — 브라우저에 노출되는 클라이언트 키라 코드에 둬도 안전.
// Vercel 환경변수를 설정하면 그 값이 우선 사용됨.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://cfztxjblbwrxtsvlpnyp.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_KEY || "sb_publishable_tGZr2Zsa-iLW-Hr2sNUNkg_QYbGPt8G";

export const supabase = createClient(url, key, {
  realtime: { params: { eventsPerSecond: 5 } },
});

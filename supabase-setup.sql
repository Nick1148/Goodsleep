-- ============================================================
--  우리의 하루 — Supabase 테이블 설정
--  Supabase 대시보드 > SQL Editor 에 붙여넣고 RUN 하세요.
-- ============================================================

create table if not exists public.entries (
  couple_code text not null,                  -- 둘만의 공유 코드
  date        text not null,                  -- 'YYYY-MM-DD'
  slot        text not null,                  -- 'a' (테사호드관) | 'b' (지인)
  data        jsonb not null default '{}'::jsonb,
  cheers      integer not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (couple_code, date, slot)
);

-- RLS 켜기
alter table public.entries enable row level security;

-- ⚠️ 예전에는 여기서 "couple access" (using true) 정책을 만들어 anon 키로 누구나 읽고 쓸 수 있었다.
--    지금은 테이블에 직접 접근하는 정책을 두지 않고, 로그인 + 커플 연결을 확인하는
--    gs2_* 함수(SECURITY DEFINER)로만 읽고 쓴다. 이 파일을 다시 실행해도 열리지 않도록 정책을 지운다.
drop policy if exists "couple access" on public.entries;
-- 함수 권한 정리는 supabase/migrations/20261027_security_hardening.sql 참고.

-- 실시간 동기화 켜기
alter publication supabase_realtime add table public.entries;

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

-- 익명(공개) 키로 읽기/쓰기 허용 (공유 코드 방식이라 로그인 없음)
drop policy if exists "couple access" on public.entries;
create policy "couple access" on public.entries
  for all
  using (true)
  with check (true);

-- 실시간 동기화 켜기
alter publication supabase_realtime add table public.entries;

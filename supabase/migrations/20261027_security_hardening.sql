-- ============================================================
--  우리의 하루 — 보안 보강 마이그레이션 (2026-10-27 점검)
--
--  이 파일은 아직 운영 DB에 적용하지 않았습니다.
--  Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 RUN 하면 됩니다.
--  여러 번 실행해도 안전하게(idempotent) 작성했습니다.
--
--  고치는 것
--  1) 로그인 없이(anon 키만으로) 공유 코드만 알면 기록을 읽고/덮어쓸 수 있던 경로 차단
--     - gs2_* 함수: 커플에 연결된 로그인 사용자만 실행 가능 (gs2_require_member)
--     - 레거시 gs_* (코드 기반) 함수: anon/authenticated 실행 권한 회수
--  2) 푸시 스크립트가 쓰던 gs_get / gs_delete_sub 를 비밀값(vault backup_secret) 확인 버전으로 교체
--  3) 응원(cheers)이 상대가 아니라 '보낸 사람' 기록에 쌓이던 버그 수정 + 원자적 +1
--  4) 포인트 선물 시 뽀뽀(kiss) 잔액까지 합쳐 계산하던 버그 수정
--  5) 뽑기 비용을 클라이언트가 0으로 보내면 공짜로 뽑히던 문제 차단
--  6) 입력 검증: 날짜 형식, 기록 크기, 답변/쪽지/리워드 길이
-- ============================================================

begin;

-- ── 1. 연결된 커플 구성원인지 확인하는 공통 가드 ─────────────────
create or replace function public.gs2_require_member()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or not exists (select 1 from public.couple_members where user_id = auth.uid()) then
    raise exception 'not_linked' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.gs2_require_member() from public, anon;
grant execute on function public.gs2_require_member() to authenticated;

-- gs2_* 모든 함수 맨 앞에 가드 삽입 (gs2_create_couple 은 커플 생성 전이라 제외)
do $$
declare r record; v_def text;
begin
  for r in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'gs2\_%'
      and p.proname not in ('gs2_create_couple', 'gs2_require_member')
  loop
    v_def := pg_get_functiondef(r.oid);
    if position('gs2_require_member' in v_def) = 0 then
      v_def := regexp_replace(v_def, E'\nbegin\n', E'\nbegin\n  perform public.gs2_require_member();\n');
      execute v_def;
    end if;
  end loop;
end $$;

-- gs2_ctx: 로그인 정보가 없으면 더 이상 p_code/p_slot 을 믿지 않음
create or replace function public.gs2_ctx(p_code text, p_slot text default null)
returns table(code text, slot text)
language plpgsql
security definer
set search_path = public
as $$
declare v_who record;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.slot is null then raise exception 'not_linked' using errcode = '42501'; end if;
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  return query select v_who.couple_code, v_who.slot;
end;
$$;

-- ── 2. 푸시 스크립트용 비밀값 확인 함수 (비밀값은 vault 에만 있음) ──
create or replace function public.gs_secret_ok(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_secret is not null
     and p_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'backup_secret' limit 1);
$$;
revoke all on function public.gs_secret_ok(text) from public, anon, authenticated;

create or replace function public.gs_get_secret(p_secret text, p_code text)
returns setof public.entries
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.gs_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  return query select * from public.entries where couple_code = p_code;
end;
$$;

create or replace function public.gs_delete_sub_secret(p_secret text, p_code text, p_slot text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.gs_secret_ok(p_secret) then raise exception 'forbidden' using errcode = '42501'; end if;
  delete from public.push_subs where couple_code = p_code and slot = p_slot;
end;
$$;

-- ── 레거시 코드 기반 gs_* 함수 권한 회수 ─────────────────────────
-- 남기는 것: gs_whoami, gs_partner_slot, gs_link_couple(로그인 필요),
--           p_secret 으로 보호되는 함수(gs_backup, gs_push_targets, *_unnotified, *_notified,
--           gs_get_secret, gs_delete_sub_secret)
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'gs\_%'
      and p.proname not in ('gs_whoami', 'gs_partner_slot', 'gs_link_couple', 'gs_secret_ok',
                            'gs_backup', 'gs_push_targets', 'gs_mark_notified',
                            'gs_get_secret', 'gs_delete_sub_secret')
      and p.proname not like '%unnotified'
      and p.proname not like '%mark_notified'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ── 3. 응원: 상대 기록에 +1 (원자적) ─────────────────────────────
-- 기존 클라이언트가 보내는 p_cheers(절대값)는 무시하고 서버에서 1씩 올린다.
create or replace function public.gs2_save_cheers(p_code text, p_date text, p_slot text, p_cheers integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_who record; v_target text;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
  v_target := public.gs_partner_slot(v_who.slot);
  insert into public.entries (couple_code, date, slot, cheers, updated_at)
  values (p_code, p_date, v_target, 1, now())
  on conflict (couple_code, date, slot) do update set cheers = public.entries.cheers + 1, updated_at = now();
end;
$$;

-- ── 4. 포인트 선물: 마일리지(mile) 잔액만 사용 ─────────────────────
create or replace function public.gs2_mileage_gift(p_code text, p_from text, p_to text, p_amount integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_who record; v_from text; v_to text; v_balance int; v_gid text;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then return false; end if;
  v_from := v_who.slot; v_to := public.gs_partner_slot(v_from);
  if p_amount is null or p_amount <= 0 or p_amount > 100000 then return false; end if;

  perform pg_advisory_xact_lock(hashtext('gs_mile:' || p_code || ':' || v_from));
  select coalesce(sum(delta),0) into v_balance from public.mileage_ledger
   where couple_code = p_code and slot = v_from and coalesce(currency,'mile') = 'mile';
  if v_balance < p_amount then return false; end if;
  v_gid := gen_random_uuid()::text;
  insert into public.mileage_ledger (couple_code, slot, delta, reason, ref_date) values (p_code, v_from, -p_amount, 'gift_to_' || v_gid, current_date);
  insert into public.mileage_ledger (couple_code, slot, delta, reason, ref_date) values (p_code, v_to, p_amount, 'gift_from_' || v_gid, current_date);
  insert into public.couple_messages (couple_code, from_slot, to_slot, kind, message) values (p_code, v_from, v_to, 'gift', p_amount || 'p');
  return true;
end;
$$;

-- ── 5. 뽑기 최소 비용 (1회 20, 10연차 18) ────────────────────────
do $$
declare v_oid oid; v_def text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gs2_gacha';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('p_cost < 18' in v_def) = 0 then
      v_def := replace(v_def, 'if p_cost is null or p_cost < 0 then', 'if p_cost is null or p_cost < 18 then');
      execute v_def;
    end if;
  end if;
end $$;

-- ── 6. 입력 검증 ────────────────────────────────────────────────
create or replace function public.gs2_save_data(p_code text, p_date text, p_slot text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_who record;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  if p_date !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'bad date'; end if;
  -- 미래 날짜 기록 금지 (한국 시간 기준, 시차 여유 1일)
  if p_date::date > (now() at time zone 'Asia/Seoul')::date + 1 then raise exception 'future date'; end if;
  if p_data is not null and jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  if pg_column_size(p_data) > 32768 then raise exception 'data too large'; end if;

  insert into public.entries (couple_code, date, slot, data, updated_at)
  values (p_code, p_date, v_who.slot, coalesce(p_data,'{}'::jsonb), now())
  on conflict (couple_code, date, slot) do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.gs2_save_goal(p_code text, p_slot text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_who record;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  if p_data is not null and jsonb_typeof(p_data) <> 'object' then raise exception 'bad data'; end if;
  if pg_column_size(p_data) > 32768 then raise exception 'data too large'; end if;

  insert into public.entries (couple_code, date, slot, data, updated_at)
  values (p_code, '__goals__', v_who.slot, coalesce(p_data,'{}'::jsonb), now())
  on conflict (couple_code, date, slot) do update set data = excluded.data, updated_at = now();
end;
$$;

create or replace function public.gs2_qa_save(p_code text, p_slot text, p_qdate date, p_answer text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_who record;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  if p_answer is null or length(btrim(p_answer)) = 0 or length(p_answer) > 1000 then raise exception 'bad answer'; end if;

  insert into public.couple_answers (couple_code, qdate, slot, answer)
  values (p_code, p_qdate, v_who.slot, p_answer)
  on conflict (couple_code, qdate, slot) do update set answer = excluded.answer;
end;
$$;

create or replace function public.gs2_msg_send(p_code text, p_from text, p_to text, p_kind text, p_message text, p_deliver date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_who record; v_from text; v_to text;
begin
  perform public.gs2_require_member();
  select * into v_who from public.gs_whoami();
  if v_who.couple_code <> p_code then raise exception 'couple mismatch'; end if;
  if p_kind not in ('cheer', 'letter') then raise exception 'bad kind'; end if;
  if p_message is null or length(btrim(p_message)) = 0 or length(p_message) > 1000 then raise exception 'bad message'; end if;
  v_from := v_who.slot;
  v_to := public.gs_partner_slot(v_from);

  insert into public.couple_messages (couple_code, from_slot, to_slot, kind, message, deliver_date)
  values (p_code, v_from, v_to, p_kind, p_message, p_deliver);
end;
$$;

do $$
declare v_oid oid; v_def text;
begin
  -- 예측(guess) 200자, 리워드 이름 40자 제한: 기존 본문 앞에 검증만 추가
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gs2_guess_save';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('bad guess' in v_def) = 0 then
      v_def := replace(v_def, '  perform public.gs2_require_member();' || E'\n',
        '  perform public.gs2_require_member();' || E'\n' ||
        '  if p_guess is null or length(btrim(p_guess)) = 0 or length(p_guess) > 200 then raise exception ''bad guess''; end if;' || E'\n');
      execute v_def;
    end if;
  end if;

  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'gs2_catalog_add';
  if v_oid is not null then
    v_def := pg_get_functiondef(v_oid);
    if position('bad title' in v_def) = 0 then
      v_def := replace(v_def, '  perform public.gs2_require_member();' || E'\n',
        '  perform public.gs2_require_member();' || E'\n' ||
        '  if p_title is null or length(btrim(p_title)) = 0 or length(p_title) > 40 then raise exception ''bad title''; end if;' || E'\n');
      execute v_def;
    end if;
  end if;
end $$;

-- 새로 만든 함수들의 실행 권한 정리
revoke all on function public.gs_get_secret(text, text) from public;
revoke all on function public.gs_delete_sub_secret(text, text, text) from public;
grant execute on function public.gs_get_secret(text, text) to anon;
grant execute on function public.gs_delete_sub_secret(text, text, text) to anon;

-- gs2_* 는 로그인 사용자만
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'gs2\_%'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;

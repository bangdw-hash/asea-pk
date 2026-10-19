-- 전광판(board.html) 입력 데이터 저장소 — Supabase 프로젝트 asea-workspace
-- 새 스키마 brd 만 사용한다(기존 bgt/awd/svy/public 테이블은 건드리지 않음).
-- 읽기: brd_get() 누구나 / 쓰기: brd_login(비밀번호) → 토큰 → brd_save(토큰, ...)
-- 초기 비밀번호는 이 파일에 넣지 않는다. 설치 후 brd_init_pw(...) 를 SQL 편집기에서 1회 실행한다.

create schema if not exists brd;
revoke all on schema brd from public, anon, authenticated;

create table if not exists brd.sheets (
  name       text primary key,
  content    jsonb       not null,
  ver        int         not null default 1,
  updated_at timestamptz not null default now()
);
create table if not exists brd.hist (
  id   bigserial primary key,
  name text        not null,
  content jsonb    not null,
  ver  int         not null,
  at   timestamptz not null default now()
);
create index if not exists brd_hist_name_id on brd.hist (name, id desc);
create table if not exists brd.cfg   (k text primary key, v text not null);
create table if not exists brd.sess  (token text primary key, exp timestamptz not null);
create table if not exists brd.fails (at timestamptz not null default now());

alter table brd.sheets enable row level security;
alter table brd.hist   enable row level security;
alter table brd.cfg    enable row level security;
alter table brd.sess   enable row level security;
alter table brd.fails  enable row level security;
revoke all on all tables in schema brd from public, anon, authenticated;

-- 공개 읽기: 화면에 표시되는 내용만 들어 있다(비밀번호·토큰은 brd.cfg/sess 에만 있고 노출되지 않음)
create or replace function public.brd_get() returns jsonb
language sql stable security definer set search_path = brd, public as $$
  select coalesce(jsonb_object_agg(name, jsonb_build_object('c', content, 'v', ver, 't', updated_at)), '{}'::jsonb) from brd.sheets
$$;

create or replace function brd.ok_token(p text) returns boolean
language sql stable security definer set search_path = brd, public as $$
  select exists (select 1 from brd.sess where token = p and exp > now())
$$;

-- 로그인: 10분 안에 8번 틀리면 잠금(잠금 중에는 기록을 더 쌓지 않음). 성공하면 12시간짜리 토큰을 돌려준다.
-- 만료된 토큰·실패 기록·30개를 넘는 이력의 정리는 DELETE 가 필요하므로 이 파일에서는 하지 않는다(용량이 매우 작음).
create or replace function public.brd_login(p_pw text) returns jsonb
language plpgsql security definer set search_path = brd, public, extensions as $$
declare h text; t text;
begin
  if (select count(*) from brd.fails where at > now() - interval '10 minutes') >= 8 then return jsonb_build_object('ok', false, 'err', 'locked'); end if;
  select v into h from brd.cfg where k = 'pw';
  if h is null or p_pw is null or length(p_pw) > 200 or extensions.crypt(p_pw, h) <> h then
    insert into brd.fails default values;
    return jsonb_build_object('ok', false, 'err', 'bad_password');
  end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  insert into brd.sess values (t, now() + interval '12 hours');
  return jsonb_build_object('ok', true, 'token', t);
end $$;

create or replace function public.brd_save(p_token text, p_name text, p_content jsonb, p_ver int) returns jsonb
language plpgsql security definer set search_path = brd, public as $$
declare cur int; nv int;
begin
  if not brd.ok_token(p_token) then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if p_name not in ('notice','welcome','slides','rental','fonts','settings','theme') then
    return jsonb_build_object('ok', false, 'err', 'bad_sheet'); end if;
  if p_content is null or jsonb_typeof(p_content) <> 'object' or length(p_content::text) > 300000 then
    return jsonb_build_object('ok', false, 'err', 'bad_content'); end if;
  select ver into cur from brd.sheets where name = p_name for update;
  if cur is null then
    if p_ver is not null and p_ver <> 0 then return jsonb_build_object('ok', false, 'err', 'conflict', 'ver', 0); end if;
    nv := 1;
    insert into brd.sheets (name, content, ver) values (p_name, p_content, nv);
  else
    if p_ver is null or p_ver <> cur then return jsonb_build_object('ok', false, 'err', 'conflict', 'ver', cur); end if;
    nv := cur + 1;
    update brd.sheets set content = p_content, ver = nv, updated_at = now() where name = p_name;
  end if;
  insert into brd.hist (name, content, ver) values (p_name, p_content, nv);
  return jsonb_build_object('ok', true, 'ver', nv, 't', now());
end $$;

create or replace function public.brd_hist(p_token text, p_name text) returns jsonb
language plpgsql security definer set search_path = brd, public as $$
begin
  if not brd.ok_token(p_token) then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  return jsonb_build_object('ok', true, 'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ver', ver, 'at', at) order by id desc)
    from (select * from brd.hist where name = p_name order by id desc limit 15) x), '[]'::jsonb));
end $$;

-- 이전 저장본으로 되돌리기: 새 버전으로 다시 저장하므로 기록이 남는다
create or replace function public.brd_restore(p_token text, p_name text, p_id bigint) returns jsonb
language plpgsql security definer set search_path = brd, public as $$
declare c jsonb; cur int; nv int;
begin
  if not brd.ok_token(p_token) then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  select content into c from brd.hist where id = p_id and name = p_name;
  if c is null then return jsonb_build_object('ok', false, 'err', 'not_found'); end if;
  select ver into cur from brd.sheets where name = p_name for update;
  nv := coalesce(cur, 0) + 1;
  insert into brd.sheets (name, content, ver) values (p_name, c, nv)
    on conflict (name) do update set content = excluded.content, ver = excluded.ver, updated_at = now();
  insert into brd.hist (name, content, ver) values (p_name, c, nv);
  return jsonb_build_object('ok', true, 'ver', nv);
end $$;

create or replace function public.brd_setpw(p_token text, p_new text) returns jsonb
language plpgsql security definer set search_path = brd, public, extensions as $$
begin
  if not brd.ok_token(p_token) then return jsonb_build_object('ok', false, 'err', 'auth'); end if;
  if p_new is null or length(p_new) < 8 or length(p_new) > 200 then return jsonb_build_object('ok', false, 'err', 'weak'); end if;
  insert into brd.cfg (k, v) values ('pw', extensions.crypt(p_new, extensions.gen_salt('bf'))) on conflict (k) do update set v = excluded.v;
  update brd.sess set exp = now();            -- 다른 곳의 로그인은 모두 끊는다
  return jsonb_build_object('ok', true);
end $$;

-- 최초 비밀번호 설정(SQL 편집기에서만 실행: anon/authenticated 에는 권한을 주지 않는다)
create or replace function brd.init_pw(p_new text) returns void
language plpgsql security definer set search_path = brd, public, extensions as $$
begin
  insert into brd.cfg (k, v) values ('pw', extensions.crypt(p_new, extensions.gen_salt('bf'))) on conflict (k) do update set v = excluded.v;
end $$;

revoke all on function public.brd_get(), public.brd_login(text), public.brd_save(text, text, jsonb, int),
  public.brd_hist(text, text), public.brd_restore(text, text, bigint), public.brd_setpw(text, text),
  brd.ok_token(text), brd.init_pw(text) from public;
grant execute on function public.brd_get(), public.brd_login(text), public.brd_save(text, text, jsonb, int),
  public.brd_hist(text, text), public.brd_restore(text, text, bigint), public.brd_setpw(text, text) to anon, authenticated;

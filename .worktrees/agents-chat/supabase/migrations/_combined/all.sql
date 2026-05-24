-- ===== 20260512_001_create_players_table.sql =====
-- players: 선수 이름 매핑 마스터 테이블
-- api_football_id 를 PK 로 사용 (외부 시스템 키와 1:1 매칭).
-- sport CHECK 제약으로 종목 혼입 차단 (예: NBA 선수가 축구 리그에 매핑되는 사고 방지).

create extension if not exists pg_trgm;

create table if not exists public.players (
  api_football_id bigint primary key,
  sport text not null check (sport in ('soccer','basketball','baseball','hockey')),

  -- 외부 응답 원본
  name_en text not null,            -- 풀네임 (예: "Cheick Doucouré")
  short_name text,                  -- 약식 ("C. Doucouré")
  team_id bigint,                   -- 소속 팀 (api-football)
  team_name_en text,
  league_id bigint,                 -- 매핑 당시 리그 (변동 가능, 참고용)
  position text,                    -- "Goalkeeper" | "Defender" | "Midfielder" | "Attacker"
  nationality text,
  date_of_birth date,
  photo_url text,

  -- 한글 매핑
  name_ko text,                     -- 풀네임 한글 ("셰크 두쿠레")
  name_ko_alt text[] default '{}',  -- 별명·통용 표기 배열 (예: {"두쿠레","C 두쿠레"})
  source text check (source in (
    'manual', 'wiki', 'gpt', 'gemini', 'seed', 'crowd'
  )),
  source_confidence smallint default 0,  -- 0~100

  -- 메타
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ===== 인덱스 =====
create index if not exists players_sport_id_idx
  on public.players (sport, api_football_id);

create index if not exists players_name_en_idx
  on public.players (lower(name_en));

create index if not exists players_short_name_idx
  on public.players (lower(short_name));

-- 풀텍스트 fuzzy (한글 일부 매칭)
create index if not exists players_name_ko_trgm_idx
  on public.players using gin (name_ko gin_trgm_ops);

-- 별명 배열 검색 (GIN)
create index if not exists players_name_ko_alt_gin_idx
  on public.players using gin (name_ko_alt);

create index if not exists players_team_idx
  on public.players (team_id);

-- 매핑되지 않은 선수 빠른 검색
create index if not exists players_unmapped_idx
  on public.players (sport)
  where name_ko is null;

-- ===== updated_at 자동 갱신 =====
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at
  before update on public.players
  for each row execute function public.set_updated_at();

-- ===== RLS =====
alter table public.players enable row level security;

-- 읽기: 공개 (이름 매핑은 비밀이 아니라 검색 가능)
drop policy if exists "players_read_public" on public.players;
create policy "players_read_public"
  on public.players for select
  using (true);

-- 쓰기: service_role 만 (Next.js server actions / 백엔드 잡)
-- 별도 INSERT/UPDATE/DELETE 정책 미설정 → anon/authenticated 차단

-- ===== 20260512_002_create_mapping_queue.sql =====
-- player_mapping_queue: 매핑 누락 큐
-- 영문 fallback 으로 표시된 선수를 자동 적재. encounter_count 로 빈도 추적
-- → 자주 등장하는 선수부터 우선 매핑할 수 있게 한다.

create table if not exists public.player_mapping_queue (
  id bigserial primary key,
  api_football_id bigint,                  -- 있을 수도/없을 수도 (예: 라인업 string 만 들어온 경우 null)
  sport text not null check (sport in ('soccer','basketball','baseball','hockey')),
  raw_name_en text not null,               -- fallback 시점의 원본 영문 ("C. Doucoure")
  team_id bigint,
  team_name_en text,
  league_code text,                        -- 'EPL' | 'LALIGA' | ...

  encounter_count int not null default 1,  -- 같은 (sport, raw_name_en) 조합이 N회 검출됐는지

  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'mapped', 'rejected', 'duplicate')),

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_to_api_football_id bigint,       -- mapped 처리 시 어떤 players row 로 귀결됐는지
  notes text,

  -- 같은 (sport, raw_name_en) 조합은 1 row 로 유지 → upsert RPC 에서 활용
  unique (sport, raw_name_en)
);

create index if not exists pmq_status_count_idx
  on public.player_mapping_queue (status, encounter_count desc);

create index if not exists pmq_sport_status_idx
  on public.player_mapping_queue (sport, status);

alter table public.player_mapping_queue enable row level security;
-- 정책 없음 → service_role 만 접근 가능

-- ===== 20260512_003_create_mapping_conflict_log.sql =====
-- player_mapping_conflict_log: 매핑 충돌·이상 감지 로그
-- - 서로 다른 sport 에 같은 한글명 매핑 (예: 농구·축구에 같은 "제임스")
-- - 한 풀네임 + 다른 sport (예: NBA LeBron James 가 축구 컨텍스트에 들어옴)
-- - sport 불일치 sanity 체크 실패 등

create table if not exists public.player_mapping_conflict_log (
  id bigserial primary key,
  conflict_type text not null,
  -- e.g. 'duplicate_name_ko_across_sports' | 'sport_mismatch' | 'fallback_collision'

  -- 사례 1: 같은 한글명, 다른 sport
  name_ko text,
  sports text[],                            -- {'soccer','basketball'}
  player_ids bigint[],                      -- 충돌하는 api_football_id 목록

  -- 사례 2: sport 불일치 (예: soccer 컨텍스트에 basketball 선수)
  expected_sport text,
  actual_sport text,
  league_code text,
  involved_player_id bigint,
  involved_player_name text,

  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),

  resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,                          -- service-role caller 이름 등
  notes text,

  created_at timestamptz not null default now()
);

-- 미해결 충돌만 빠르게 조회 (부분 인덱스)
create index if not exists pmcl_unresolved_idx
  on public.player_mapping_conflict_log (severity, created_at desc)
  where resolved = false;

alter table public.player_mapping_conflict_log enable row level security;
-- 정책 없음 → service_role 만 접근 가능

-- ===== 20260512_004_create_queue_upsert_rpc.sql =====
-- upsert_mapping_queue: 매핑 누락 큐에 적재하거나 encounter_count 증가.
-- Next.js 잡에서 fallback 발생 시 호출.
-- SECURITY DEFINER 로 service_role 권한으로 실행 (RLS 우회).

create or replace function public.upsert_mapping_queue(
  p_api_football_id bigint,
  p_sport text,
  p_raw_name_en text,
  p_team_id bigint default null,
  p_team_name_en text default null,
  p_league_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sport not in ('soccer','basketball','baseball','hockey') then
    raise exception 'invalid sport: %', p_sport;
  end if;

  insert into public.player_mapping_queue
    (api_football_id, sport, raw_name_en, team_id, team_name_en, league_code)
  values
    (p_api_football_id, p_sport, p_raw_name_en, p_team_id, p_team_name_en, p_league_code)
  on conflict (sport, raw_name_en) do update set
    encounter_count = public.player_mapping_queue.encounter_count + 1,
    last_seen_at = now(),
    -- 새 정보가 있으면 갱신
    api_football_id =
      coalesce(public.player_mapping_queue.api_football_id, excluded.api_football_id),
    team_id =
      coalesce(public.player_mapping_queue.team_id, excluded.team_id),
    team_name_en =
      coalesce(public.player_mapping_queue.team_name_en, excluded.team_name_en),
    league_code =
      coalesce(public.player_mapping_queue.league_code, excluded.league_code);
end;
$$;

-- 호출 허용 — service_role 만 (anon/authenticated 는 따로 GRANT 안 함)
revoke all on function public.upsert_mapping_queue(bigint, text, text, bigint, text, text) from public;
grant execute on function public.upsert_mapping_queue(bigint, text, text, bigint, text, text) to service_role;

-- ===== 20260512_005_create_conflict_detection_rpc.sql =====
-- detect_name_conflicts: 서로 다른 sport 에 동일 한글명이 매핑된 케이스 탐지.
-- 결과를 row 로 반환하고 동시에 conflict_log 에도 적재 (severity = warning).

create or replace function public.detect_name_conflicts()
returns table (
  name_ko text,
  sports text[],
  player_ids bigint[],
  player_count int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select
      p.name_ko,
      array_agg(distinct p.sport order by p.sport) as sports,
      array_agg(p.api_football_id order by p.api_football_id) as player_ids,
      count(*)::int as cnt
    from public.players p
    where p.name_ko is not null
    group by p.name_ko
    having count(distinct p.sport) > 1
  loop
    -- 결과 row 반환
    name_ko := r.name_ko;
    sports := r.sports;
    player_ids := r.player_ids;
    player_count := r.cnt;
    return next;

    -- 같은 시점 중복 로그 방지 — 이미 미해결로 있으면 skip
    if not exists (
      select 1 from public.player_mapping_conflict_log
      where conflict_type = 'duplicate_name_ko_across_sports'
        and name_ko = r.name_ko
        and resolved = false
    ) then
      insert into public.player_mapping_conflict_log
        (conflict_type, name_ko, sports, player_ids, severity)
      values
        ('duplicate_name_ko_across_sports', r.name_ko, r.sports, r.player_ids, 'warning');
    end if;
  end loop;
  return;
end;
$$;

revoke all on function public.detect_name_conflicts() from public;
grant execute on function public.detect_name_conflicts() to service_role;


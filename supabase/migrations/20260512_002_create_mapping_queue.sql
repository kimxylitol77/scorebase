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

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

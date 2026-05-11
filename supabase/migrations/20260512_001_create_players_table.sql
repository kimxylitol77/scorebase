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

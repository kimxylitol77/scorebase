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

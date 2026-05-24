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

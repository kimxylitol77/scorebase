// 감독 페이지(/coaches/[id]) 존재 판정 — 라인업 등에서 감독명에 링크를 걸 때 쓴다.
// 페이지의 coachOf() 와 같은 판정(team-coaches 현직 + legends)을 미러링한다 —
// 무조건 링크하면 미등재 감독이 404 로 떨어진다(선수 링크 linkableIds 와 같은 원칙).
import rawCoaches from "../../data/team-coaches.json";
import rawLegends from "../../data/coach-legends.json";

const KNOWN = new Set<string>();
for (const c of Object.values(rawCoaches as Record<string, { id?: string }>)) {
  if (c.id) KNOWN.add(c.id);
}
for (const id of Object.keys(rawLegends as Record<string, unknown>)) KNOWN.add(id);

/** ts 감독 id 에 /coaches/[id] 페이지가 있으면 그 경로, 없으면 null. */
export function coachPageHref(id: string | undefined | null): string | null {
  return id && KNOWN.has(id) ? `/coaches/${id}` : null;
}

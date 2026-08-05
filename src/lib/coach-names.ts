// 감독 영문 이름 → 한국어 표기. data/team-coaches.json 의 nameKo 를 사전으로 재사용한다.
//
// 왜 사전이 부분적인가. team-coaches.json 은 8리그(193팀)만 Haiku 로 한글화해 둔 것이고,
// Team.coach 는 collect-all-team-coaches 가 전 리그를 원문으로 채운다. 겹치는 범위는
// 한글로 나가고 나머지는 원문 그대로다 — 원문이라도 "감독 없음" 보다 낫다.
import raw from "../../data/team-coaches.json";

interface CoachEntry {
  name?: string;
  nameKo?: string | null;
}

const KO_BY_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of Object.values(raw as Record<string, CoachEntry>)) {
    if (c?.name && c.nameKo) m.set(c.name.trim().toLowerCase(), c.nameKo);
  }
  return m;
})();

/** 한글이면 그대로, 사전에 있으면 한글, 없으면 원문. 빈 값은 null. */
export function toKoreanCoachName(name?: string | null): string | null {
  const t = (name ?? "").trim();
  if (!t) return null;
  if (/[가-힣]/.test(t)) return t;
  return KO_BY_NAME.get(t.toLowerCase()) ?? t;
}

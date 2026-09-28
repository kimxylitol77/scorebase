// ESPN 포스트시즌 자리표시자 팀 판별 — 대진 미확정 자리에 음수 id("-2") 가짜 팀("White Sox/Astros")을 넣어 보낸다.
// 이걸 저장하면 가짜 팀 row 와 가짜 대진 경기가 생긴다(2026-09-28 MLB 와일드카드 8경기). 대진이 정해지면 ESPN 이
// 같은 경기에 진짜 팀을 넣으므로 그때 수집하면 된다.

interface EspnEventLike {
  competitions?: Array<{ competitors?: Array<{ team?: { id?: string | number } }> }>;
}

/** 두 팀 모두 양수 숫자 id 인 경기만 true */
export function hasRealEspnTeams(e: EspnEventLike): boolean {
  const cs = e.competitions?.[0]?.competitors ?? [];
  return cs.length >= 2 && cs.every((c) => /^[1-9]\d*$/.test(String(c.team?.id ?? "")));
}

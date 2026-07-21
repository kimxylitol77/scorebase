// 라이브 박스스코어(ts player_id) → 선수 상세 페이지 링크 해소.
//   ts 선수 id 와 KBO/NPB 공식 pid 는 체계가 달라 직접 매핑이 없다. 유일한 고리가 이름이라
//   data/baseball-rosters.json(팀별 공식 pid+이름)에서 **그 경기 두 팀 로스터 안에서만** 매칭한다.
//   - 전역 매칭이 아니라 경기 참가 2팀으로 한정 → 동명이인 오연결 위험 최소화.
//   - 팀 내에서도 동명이인이면 링크를 걸지 않는다(잘못된 선수로 보내느니 텍스트 유지).
//   - NPB 는 로스터가 한자("山下 舜平大"), ts 이름이 한글 음역이라 현재 매칭 0 —
//     npb.jp 카나 수집이 붙으면 이 함수 수정 없이 자동으로 링크가 생긴다.
import rosters from "../../../data/baseball-rosters.json";

interface RosterPlayer {
  id: string;
  name: string;
  group: string;
}

const norm = (s: string) => s.replace(/\s+/g, "").trim();

export function buildBaseballPlayerHrefs(opts: {
  league: "KBO" | "NPB";
  teamIds: (number | null | undefined)[]; // 경기 참가 팀 DB Team.id (home/away)
  playerNameById: Record<string, string>; // ts player_id → 표시명
}): Record<string, string> {
  const R = rosters as Record<string, RosterPlayer[]>;
  const idx = new Map<string, string[]>();
  for (const tid of opts.teamIds) {
    if (tid == null) continue;
    for (const p of R[String(tid)] ?? []) {
      const k = norm(p.name);
      if (!k) continue;
      idx.set(k, [...(idx.get(k) ?? []), p.id]);
    }
  }
  if (idx.size === 0) return {};
  const out: Record<string, string> = {};
  for (const [tsId, name] of Object.entries(opts.playerNameById)) {
    if (!name) continue;
    const hits = idx.get(norm(name));
    if (hits && hits.length === 1) out[tsId] = `/players/${hits[0]}?league=${opts.league}`;
  }
  return out;
}

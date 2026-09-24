// 라이브 박스스코어(ts player_id) → 선수 상세 페이지 링크 해소.
//   ts 선수 id 와 KBO/NPB 공식 pid 는 체계가 달라 직접 매핑이 없다. 유일한 고리가 이름이라
//   data/baseball-rosters.json(팀별 공식 pid+이름)에서 **그 경기 두 팀 로스터 안에서만** 매칭한다.
//   - 전역 매칭이 아니라 경기 참가 2팀으로 한정 → 동명이인 오연결 위험 최소화.
//   - 팀 내에서도 동명이인이면 링크를 걸지 않는다(잘못된 선수로 보내느니 텍스트 유지).
//   - NPB 는 로스터가 한자("山下 舜平大"), ts 가 한글 음역이라 이름 매칭 불가 →
//     build-npb-player-link 가 카나를 수집해 만든 사전(ts id → 공식 pid)을 그대로 쓴다.
import rosters from "../../../data/baseball-rosters.json";
import npbLink from "../../../data/npb-player-link.json";
import { npbPlayerToKorean } from "./npb-player-names";
import { npbPlayerKo } from "./npb-player-ko";

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
  // NPB — 사전(ts id → 공식 pid) 직행. 사전 구축 시점에 유일 매칭만 채택돼 오연결 없음.
  if (opts.league === "NPB") {
    const M = npbLink as Record<string, string>;
    const out: Record<string, string> = {};
    for (const tsId of Object.keys(opts.playerNameById)) {
      const pid = M[tsId];
      if (pid) out[tsId] = `/players/${pid}?league=NPB`;
    }
    return out;
  }
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

/**
 * NPB 한글 표시명 → 공식 pid (그 팀 1군 로스터 안에서만). 시즌 스탯("타자 전력")은 번호 없이 한자→한글 이름만
 * 저장돼 있어서, 같은 변환(npbPlayerToKorean)과 로스터 표시 변환(npbPlayerKo)을 로스터 한자명에 돌려 역색인한다.
 * 같은 한글명이 둘이면 뺀다(오연결 방지).
 */
export function npbPidByKoreanName(teamId: number | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  const dup = new Set<string>();
  if (teamId == null) return out;
  for (const p of (rosters as Record<string, RosterPlayer[]>)[String(teamId)] ?? []) {
    for (const ko of new Set([npbPlayerToKorean(p.name), npbPlayerKo(p.id, p.name)])) {
      const k = norm(ko);
      if (!/[가-힣]/.test(k) || dup.has(k)) continue;
      if (out.has(k) && out.get(k) !== p.id) {
        out.delete(k);
        dup.add(k);
        continue;
      }
      out.set(k, p.id);
    }
  }
  return out;
}

/** NPB 시즌 스탯 타자 목록에 번호를 채운다 — 이미 있거나 못 찾으면 그대로. */
export function withNpbExternalIds<T extends { playerName: string; externalId: string | null }>(batters: T[], teamId: number | null | undefined): T[] {
  const idx = npbPidByKoreanName(teamId);
  return batters.map((b) => (b.externalId ? b : { ...b, externalId: idx.get(norm(b.playerName)) ?? null }));
}

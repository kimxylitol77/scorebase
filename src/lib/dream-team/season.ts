// 드림팀 시즌 리그 — 봇 라운드로빈 순위표·시즌 보너스 (게임 전용, 실데이터 무관)
import { simulateMatch } from "./simulate";
import type { BotTeam } from "./bots";

export interface SeasonGame {
  botId: string;
  home: boolean;
  my: number;
  op: number;
  outcome: "win" | "draw" | "loss";
  ts?: number;
}

export interface StandRow {
  id: string;
  name: string;
  isMe: boolean;
  played: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

// 한 시즌 길이 = 봇 5팀과 홈/원정 더블 라운드로빈 = 10경기
export function seasonLength(bots: BotTeam[]): number {
  return bots.length * 2;
}

// 시즌 일정 — 봇마다 홈/원정 2경기. (botId, home) 키로 중복 방지.
export function seasonFixtures(bots: BotTeam[]): { botId: string; home: boolean }[] {
  const out: { botId: string; home: boolean }[] = [];
  for (const b of bots) {
    out.push({ botId: b.id, home: true });
    out.push({ botId: b.id, home: false });
  }
  return out;
}

function applyResult(row: StandRow, gf: number, ga: number) {
  row.played++;
  row.gf += gf;
  row.ga += ga;
  if (gf > ga) {
    row.w++;
    row.pts += 3;
  } else if (gf < ga) {
    row.l++;
  } else {
    row.d++;
    row.pts += 1;
  }
}

// 순위표 — 봇끼리 경기는 시즌번호 기반 결정적 시뮬로 채우고, 내가 치른 경기를 합산.
// (내가 아직 안 한 경기는 미반영 — 진행 중엔 경기수가 팀마다 다를 수 있음)
export function computeStandings(myName: string, bots: BotTeam[], seasonGames: SeasonGame[], seasonNo: number): StandRow[] {
  const rows = new Map<string, StandRow>();
  rows.set("me", { id: "me", name: myName, isMe: true, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });
  for (const b of bots) rows.set(b.id, { id: b.id, name: b.name, isMe: false, played: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 });

  // 봇끼리 더블 라운드로빈 (모든 순서쌍 i!==j = 각 쌍 홈/원정 2경기)
  for (let i = 0; i < bots.length; i++) {
    for (let j = 0; j < bots.length; j++) {
      if (i === j) continue;
      const a = bots[i], b = bots[j];
      const seed = seasonNo * 100000 + i * 1000 + j * 10 + 7;
      const r = simulateMatch({ atk: a.avgOvr, def: a.avgOvr }, { atk: b.avgOvr, def: b.avgOvr }, seed, a.mentality, b.mentality);
      applyResult(rows.get(a.id)!, r.myScore, r.oppScore);
      applyResult(rows.get(b.id)!, r.oppScore, r.myScore);
    }
  }

  // 내 경기 — 나 + 상대 봇 양쪽 반영
  const me = rows.get("me")!;
  for (const g of seasonGames) {
    applyResult(me, g.my, g.op);
    const opp = rows.get(g.botId);
    if (opp) applyResult(opp, g.op, g.my);
  }

  return [...rows.values()].sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf || (x.isMe ? -1 : 1));
}

// 내 최종 순위 (1부터)
export function myRank(standings: StandRow[]): number {
  return standings.findIndex((r) => r.isMe) + 1;
}

// 시즌 종료 순위 보너스 자금(€M) — 우승이 가장 크게(승급 가속), 순위 내려갈수록 감소. 나+봇5=6팀 기준.
export function seasonBonus(rank: number): number {
  const table = [30, 18, 12, 6, 4, 2];
  return table[rank - 1] ?? 2;
}

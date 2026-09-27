// 게임 상태 → 화면용 뷰. 공개되지 않은 카드의 수치는 여기서 빠진다 (누출 방지의 단일 관문).
import { boardFinished, indexOf, isVisible, type GameState, type Lifeline, type Pool } from "./engine";
import { MODES } from "./modes";
import { assignSlots, scoreLineup, type Score } from "./scoring";
import type { SeasonRecord } from "./season";
import type { DraftMode, PoolCard, PoolFile, PoolTeam, Pos } from "./types";

export interface CardView {
  id: string;
  name: string;
  season: number;
  teamName: string;
  pos: Pos[];
  photo: string | null;
  picked: boolean;
  /** 공개된 카드에만 붙는다 */
  stats?: { off: number; def: number; total: number; line?: string; rank?: number };
}

export interface PickView extends CardView {
  slot: number; // 모드 slots 색인, 자리 없으면 -1
  color: string;
}

export interface GameView {
  id: string;
  mode: DraftMode;
  round: number;
  rounds: number;
  team: Pick<PoolTeam, "name" | "logo" | "color">;
  cards: CardView[];
  boardFinished: boolean;
  sorted: boolean;
  picksAllowed: number;
  picks: PickView[];
  score: Score;
  lockdownAt: number;
  used: Lifeline[];
  spyLeft: number;
  done: boolean;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

function publicCard(c: PoolCard, picked: boolean): CardView {
  return { id: c.id, name: c.name, season: c.season, teamName: c.teamName, pos: c.pos, photo: c.photo, picked };
}
function openCard(c: PoolCard, picked: boolean, rank?: number): CardView {
  return { ...publicCard(c, picked), stats: { off: c.off, def: c.def, total: r1(c.off + c.def), line: c.line, rank } };
}

export function pickViews(pool: Pool, ids: string[], slotsOf: string[]): PickView[] {
  const idx = indexOf(pool);
  const cards = ids.map((id) => idx.byId.get(id)!);
  const slots = assignSlots(cards, slotsOf);
  const color = new Map(pool.teams.map((t) => [t.key, t.color]));
  return cards.map((c, i) => ({ ...openCard(c, true), slot: slots[i], color: color.get(c.team) ?? "#444" }));
}

export function toView(id: string, pool: PoolFile, s: GameState): GameView {
  const idx = indexOf(pool);
  const team = pool.teams.find((t) => t.key === s.board.team)!;
  const all = s.board.cardIds.map((cid) => idx.byId.get(cid)!);
  const sorted = s.board.revealed || boardFinished(s);
  const order = sorted ? [...all].sort((a, b) => b.off + b.def - (a.off + a.def)) : all;
  const cards = order.map((c, i) =>
    isVisible(s, c.id) ? openCard(c, s.board.picked.includes(c.id), sorted ? i + 1 : undefined) : publicCard(c, false),
  );
  const mine = s.picks.map((cid) => idx.byId.get(cid)!);
  const slots = MODES[s.mode].slots;
  return {
    id,
    mode: s.mode,
    round: Math.min(s.picks.length + (boardFinished(s) ? 0 : 1), slots.length),
    rounds: slots.length,
    team: { name: team.name, logo: team.logo, color: team.color },
    cards,
    boardFinished: boardFinished(s),
    sorted,
    picksAllowed: s.board.picksAllowed,
    picks: pickViews(pool, s.picks, slots),
    score: scoreLineup(mine, pool.meta, slots),
    lockdownAt: pool.meta.lockdown,
    used: s.used,
    spyLeft: s.spyLeft,
    done: s.done,
  };
}

/** 결과 스냅샷 — DraftGame.lineup 에 저장, 결과·공유·리더보드가 읽는다 */
export interface ResultSnapshot {
  picks: PickView[];
  score: Score;
}
export type { SeasonRecord };

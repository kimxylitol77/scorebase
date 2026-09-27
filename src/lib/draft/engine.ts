// 드래프트 게임 엔진 — 판 생성·픽·찬스. 순수 함수이고 상태는 JSON 으로 그대로 저장된다.
import { pickOne, rngFor, weightedSample, type Rng } from "./rng";
import { MODES } from "./modes";
import type { DraftMode, PoolCard, PoolTeam, Pos } from "./types";

export const BOARD_SIZE = 21;
export const POSITION_BOARD_SIZE = 12;
/** 판을 낼 수 있는 구단의 최소 선수 수 — 21명이 안 돼도 이만큼이면 적은 카드로 판을 연다 */
export const MIN_TEAM_PLAYERS = 15;
export const LIFELINES = ["redeal", "swap", "position", "double", "reveal", "flash"] as const;
export type Lifeline = (typeof LIFELINES)[number];

export interface Board {
  team: string;
  cardIds: string[];
  revealed: boolean; // 전체 공개 찬스
  spied: string[];
  picked: string[];
  picksAllowed: number; // 더블 픽이면 2
}

export interface GameState {
  mode: DraftMode;
  seed: number;
  nonce: number;
  round: number; // 끝낸 판 수
  board: Board;
  picks: string[];
  usedTeams: string[];
  used: Lifeline[];
  spyLeft: number;
  done: boolean;
}

/** 엔진이 쓰는 풀 색인 */
export interface Pool {
  teams: PoolTeam[];
  cards: PoolCard[];
}
interface Index {
  byId: Map<string, PoolCard>;
  byTeam: Map<string, Map<string, PoolCard[]>>; // 구단 → 선수 → 그 구단에서의 시즌들
}
const indexCache = new WeakMap<Pool, Index>();
export function indexOf(pool: Pool): Index {
  const hit = indexCache.get(pool);
  if (hit) return hit;
  const byId = new Map<string, PoolCard>();
  const byTeam = new Map<string, Map<string, PoolCard[]>>();
  for (const c of pool.cards) {
    byId.set(c.id, c);
    const t = byTeam.get(c.team) ?? new Map<string, PoolCard[]>();
    t.set(c.pid, [...(t.get(c.pid) ?? []), c]);
    byTeam.set(c.team, t);
  }
  const idx = { byId, byTeam };
  indexCache.set(pool, idx);
  return idx;
}

export class DraftError extends Error {}

const best = (seasons: PoolCard[]) => Math.max(...seasons.map((c) => c.off + c.def));

function deal(pool: Pool, rng: Rng, team: string, exclude: Set<string>, size: number, pos?: Pos): string[] {
  const players = [...(indexOf(pool).byTeam.get(team)?.entries() ?? [])]
    .filter(([pid, seasons]) => !exclude.has(pid) && (!pos || seasons.some((c) => c.pos.includes(pos))));
  // 스타가 몇 명은 섞이도록 최고 시즌 기여도에 비례해 뽑는다
  const chosen = weightedSample(rng, players, ([, s]) => 1 + Math.max(0, best(s)) * 0.6, size);
  return chosen.map(([, seasons]) => pickOne(rng, pos ? seasons.filter((c) => c.pos.includes(pos)) : seasons).id);
}

function pickTeam(pool: Pool, rng: Rng, avoid: string[]): string {
  const idx = indexOf(pool);
  const ok = pool.teams.filter((t) => !avoid.includes(t.key) && (idx.byTeam.get(t.key)?.size ?? 0) >= MIN_TEAM_PLAYERS);
  if (ok.length) return pickOne(rng, ok).key;
  // 구단이 적은 리그(K리그)는 판 수만큼 돌면 남는 구단이 없다 — 직전 구단만 피해서 다시 쓴다
  const again = pool.teams.filter((t) => t.key !== avoid.at(-1) && (idx.byTeam.get(t.key)?.size ?? 0) >= MIN_TEAM_PLAYERS);
  if (!again.length) throw new DraftError("뽑을 수 있는 구단이 없습니다");
  return pickOne(rng, again).key;
}

function pickedPids(pool: Pool, s: GameState): Set<string> {
  const idx = indexOf(pool);
  return new Set(s.picks.map((id) => idx.byId.get(id)!.pid));
}

function newBoard(pool: Pool, s: GameState, team: string, opts?: { pos?: Pos; exclude?: string[] }): GameState {
  const rng = rngFor(s.seed, s.nonce);
  const exclude = pickedPids(pool, s);
  for (const pid of opts?.exclude ?? []) exclude.add(pid);
  let ids = deal(pool, rng, team, exclude, opts?.pos ? POSITION_BOARD_SIZE : BOARD_SIZE, opts?.pos);
  // 제외 때문에 판이 비면 제외를 풀고 다시
  if (ids.length < 5) ids = deal(pool, rng, team, pickedPids(pool, s), opts?.pos ? POSITION_BOARD_SIZE : BOARD_SIZE, opts?.pos);
  return {
    ...s,
    nonce: s.nonce + 1,
    board: { team, cardIds: ids, revealed: false, spied: [], picked: [], picksAllowed: s.board?.picksAllowed === 2 && !s.board.picked.length ? 2 : 1 },
    usedTeams: s.usedTeams.includes(team) ? s.usedTeams : [...s.usedTeams, team],
  };
}

export function startGame(pool: Pool, mode: DraftMode, seed: number): GameState {
  const base: GameState = {
    mode,
    seed,
    nonce: 0,
    round: 0,
    board: { team: "", cardIds: [], revealed: false, spied: [], picked: [], picksAllowed: 1 },
    picks: [],
    usedTeams: [],
    used: [],
    spyLeft: MODES[mode].spyCharges,
    done: false,
  };
  return newBoard(pool, base, pickTeam(pool, rngFor(seed, 1000), []));
}

const lineupSize = (s: GameState) => MODES[s.mode].slots.length;

/** 이 판에서 픽을 다 했는가 (다음 판으로 넘어갈 차례) */
export function boardFinished(s: GameState): boolean {
  return s.board.picked.length >= s.board.picksAllowed || s.picks.length >= lineupSize(s);
}

export function pick(pool: Pool, s: GameState, cardId: string): GameState {
  if (s.done) throw new DraftError("이미 끝난 게임입니다");
  if (boardFinished(s)) throw new DraftError("이 판에서는 더 뽑을 수 없습니다");
  if (!s.board.cardIds.includes(cardId) || s.board.picked.includes(cardId)) throw new DraftError("이 판에 없는 카드입니다");
  return { ...s, picks: [...s.picks, cardId], board: { ...s.board, picked: [...s.board.picked, cardId] } };
}

export function nextBoard(pool: Pool, s: GameState): GameState {
  if (s.done) throw new DraftError("이미 끝난 게임입니다");
  if (!boardFinished(s)) throw new DraftError("먼저 선수를 뽑아야 합니다");
  if (s.picks.length >= lineupSize(s)) return { ...s, done: true };
  const cleared = { ...s, round: s.round + 1, board: { ...s.board, picksAllowed: 1 } };
  return newBoard(pool, cleared, pickTeam(pool, rngFor(s.seed, 1000 + s.nonce), s.usedTeams));
}

export function applyLifeline(pool: Pool, s: GameState, kind: Lifeline, pos?: Pos): GameState {
  if (s.done) throw new DraftError("이미 끝난 게임입니다");
  if (s.used.includes(kind)) throw new DraftError("이미 쓴 찬스입니다");
  if (s.board.picked.length) throw new DraftError("픽을 한 판에서는 찬스를 쓸 수 없습니다");
  const used = [...s.used, kind];
  const idx = indexOf(pool);
  const current = s.board.cardIds.map((id) => idx.byId.get(id)!.pid);
  switch (kind) {
    case "redeal":
      return newBoard(pool, { ...s, used }, s.board.team, { exclude: current });
    case "swap":
      return newBoard(pool, { ...s, used }, pickTeam(pool, rngFor(s.seed, 2000 + s.nonce), s.usedTeams));
    case "position":
      if (!pos || !MODES[s.mode].slots.includes(pos)) throw new DraftError("포지션을 골라야 합니다");
      return newBoard(pool, { ...s, used }, s.board.team, { pos });
    case "double":
      if (lineupSize(s) - s.picks.length < 2) throw new DraftError("빈자리가 2개 이상일 때만 쓸 수 있습니다");
      return { ...s, used, board: { ...s.board, picksAllowed: 2 } };
    case "reveal":
      return { ...s, used, board: { ...s.board, revealed: true } };
    case "flash": {
      const rng = rngFor(s.seed, s.nonce);
      const cardIds = s.board.cardIds.map((id) => {
        const c = idx.byId.get(id)!;
        const seasons = idx.byTeam.get(c.team)!.get(c.pid)!;
        const others = seasons.filter((x) => x.id !== id);
        return others.length ? pickOne(rng, others).id : id;
      });
      return { ...s, used, nonce: s.nonce + 1, board: { ...s.board, cardIds, spied: [], revealed: false } };
    }
  }
}

export function spy(s: GameState, cardId: string): GameState {
  if (s.done) throw new DraftError("이미 끝난 게임입니다");
  if (s.spyLeft <= 0) throw new DraftError("돋보기를 다 썼습니다");
  if (boardFinished(s)) throw new DraftError("이미 공개된 판입니다");
  if (!s.board.cardIds.includes(cardId)) throw new DraftError("이 판에 없는 카드입니다");
  if (s.board.spied.includes(cardId)) return s;
  return { ...s, spyLeft: s.spyLeft - 1, board: { ...s.board, spied: [...s.board.spied, cardId] } };
}

/** 카드의 수치를 보여줘도 되는가 */
export function isVisible(s: GameState, cardId: string): boolean {
  return s.done || s.board.revealed || boardFinished(s) || s.board.spied.includes(cardId) || s.picks.includes(cardId);
}

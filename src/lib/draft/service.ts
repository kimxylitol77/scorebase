// 드래프트 게임 서버 서비스 — DraftGame 읽기·쓰기, 결과 확정, 리더보드. API 라우트와 페이지가 함께 쓴다.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DraftError, nextBoard, pick, spy, startGame, applyLifeline, LIFELINES, type GameState, type Lifeline } from "./engine";
import { getPool } from "./pool";
import { percentileOf, ringsOf } from "./scoring";
import { pickViews, toView, type GameView, type ResultSnapshot } from "./view";
import { indexOf } from "./engine";
import { scoreLineup } from "./scoring";
import type { DraftMode, Pos } from "./types";

export interface Actor {
  sessionId: string;
  userId: string | null;
  nickname: string | null;
}

export type DraftAction =
  | { action: "pick"; cardId: string }
  | { action: "spy"; cardId: string }
  | { action: "next" }
  | { action: "lifeline"; kind: Lifeline; pos?: Pos };

const asJson = (v: unknown) => v as unknown as Prisma.InputJsonValue;

export async function startDraft(mode: DraftMode, actor: Actor): Promise<GameView> {
  const pool = getPool(mode);
  const seed = Math.floor(Math.random() * 2 ** 31);
  const state = startGame(pool, mode, seed);
  const row = await prisma.draftGame.create({
    data: { mode, sessionId: actor.sessionId, userId: actor.userId, nickname: actor.nickname, state: asJson(state) },
    select: { id: true },
  });
  return toView(row.id, pool, state);
}

/** 이 세션이 하던 판 (24시간 이내) */
export async function resumeDraft(mode: DraftMode, sessionId: string): Promise<GameView | null> {
  const row = await prisma.draftGame.findFirst({
    where: { mode, sessionId, done: false, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, state: true },
  });
  return row ? toView(row.id, getPool(mode), row.state as unknown as GameState) : null;
}

export async function actDraft(gameId: string, actor: Actor, a: DraftAction): Promise<GameView> {
  const row = await prisma.draftGame.findUnique({ where: { id: gameId }, select: { id: true, mode: true, sessionId: true, state: true, done: true, userId: true } });
  if (!row || row.sessionId !== actor.sessionId) throw new DraftError("게임을 찾을 수 없습니다");
  if (row.done) throw new DraftError("이미 끝난 게임입니다");
  const mode = row.mode as DraftMode;
  const pool = getPool(mode);
  const prev = row.state as unknown as GameState;
  let next: GameState;
  switch (a.action) {
    case "pick":
      next = pick(pool, prev, a.cardId);
      break;
    case "spy":
      next = spy(prev, a.cardId);
      break;
    case "next":
      next = nextBoard(pool, prev);
      break;
    case "lifeline":
      if (!LIFELINES.includes(a.kind)) throw new DraftError("없는 찬스입니다");
      next = applyLifeline(pool, prev, a.kind, a.pos);
      break;
  }
  if (next.done) {
    const cards = next.picks.map((id) => indexOf(pool).byId.get(id)!);
    const score = scoreLineup(cards, pool.meta.lockdown);
    const percentile = percentileOf(score.total, pool.meta.quantiles);
    const snapshot: ResultSnapshot = { picks: pickViews(pool, next.picks), score };
    await prisma.draftGame.update({
      where: { id: row.id },
      data: {
        state: asJson(next),
        done: true,
        total: score.total,
        percentile,
        rings: ringsOf(percentile),
        lineup: asJson(snapshot),
        finishedAt: new Date(),
        // 도중에 로그인했으면 그 회원으로 등재
        userId: row.userId ?? actor.userId,
        ...(row.userId ? {} : { nickname: actor.nickname }),
      },
    });
  } else {
    await prisma.draftGame.update({ where: { id: row.id }, data: { state: asJson(next) } });
  }
  return toView(row.id, pool, next);
}

/** 비회원으로 끝낸 판을 로그인 뒤 내 기록으로 등록 */
export async function claimDraft(gameId: string, actor: Actor): Promise<boolean> {
  if (!actor.userId) return false;
  const r = await prisma.draftGame.updateMany({
    where: { id: gameId, sessionId: actor.sessionId, done: true, userId: null },
    data: { userId: actor.userId, nickname: actor.nickname },
  });
  return r.count > 0;
}

/** 백분위·반지는 저장값이 아니라 현재 기준선으로 다시 낸다 — 기준선을 재보정하면 옛 판에도 바로 반영된다 */
function standing(mode: DraftMode, total: number): { percentile: number; rings: number } {
  const percentile = percentileOf(total, getPool(mode).meta.quantiles);
  return { percentile, rings: ringsOf(percentile) };
}

/** KST 오늘 0시 */
function todayStart(): Date {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - 9 * 3600_000);
}

export interface DraftResult {
  id: string;
  mode: DraftMode;
  total: number;
  percentile: number;
  rings: number;
  nickname: string | null;
  registered: boolean;
  sessionId: string;
  snapshot: ResultSnapshot;
  finishedAt: Date;
  rankToday: number;
  countToday: number;
}

export async function getDraftResult(id: string): Promise<DraftResult | null> {
  const row = await prisma.draftGame.findUnique({ where: { id } });
  if (!row || !row.done || row.total == null || !row.lineup || !row.finishedAt) return null;
  const since = todayStart();
  const base = { mode: row.mode, done: true, finishedAt: { gte: since } };
  const [countToday, above] = await Promise.all([
    prisma.draftGame.count({ where: base }),
    prisma.draftGame.count({ where: { ...base, total: { gt: row.total } } }),
  ]);
  return {
    id: row.id,
    mode: row.mode as DraftMode,
    total: row.total,
    ...standing(row.mode as DraftMode, row.total),
    nickname: row.nickname,
    registered: !!row.userId,
    sessionId: row.sessionId,
    snapshot: row.lineup as unknown as ResultSnapshot,
    finishedAt: row.finishedAt,
    // 오늘 끝난 판이 아니면 오늘 순위는 의미가 없다 — 그때는 0
    rankToday: row.finishedAt >= since ? above + 1 : 0,
    countToday,
  };
}

export interface LeaderRow {
  id: string;
  nickname: string;
  total: number;
  rings: number;
  runs: number;
  snapshot: ResultSnapshot;
}

/** 회원만 등재, 회원당 최고 기록 1건 */
export async function getLeaderboard(mode: DraftMode, period: "today" | "all", limit = 20): Promise<LeaderRow[]> {
  const since = period === "today" ? todayStart() : new Date(0);
  const rows = await prisma.$queryRaw<Array<{ id: string; nickname: string | null; total: number; rings: number | null; runs: bigint; lineup: unknown }>>`
    SELECT b.id, b.nickname, b.total, b.rings, b.lineup, c.runs
    FROM (
      SELECT DISTINCT ON ("userId") id, "userId", nickname, total, rings, lineup
      FROM "DraftGame"
      WHERE mode = ${mode} AND done = true AND "userId" IS NOT NULL AND "finishedAt" >= ${since}
      ORDER BY "userId", total DESC, "finishedAt" ASC
    ) b
    JOIN (
      SELECT "userId", COUNT(*) AS runs FROM "DraftGame"
      WHERE mode = ${mode} AND done = true AND "userId" IS NOT NULL AND "finishedAt" >= ${since}
      GROUP BY "userId"
    ) c ON c."userId" = b."userId"
    ORDER BY b.total DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    nickname: r.nickname ?? "회원",
    total: r.total,
    rings: standing(mode, r.total).rings,
    runs: Number(r.runs),
    snapshot: r.lineup as ResultSnapshot,
  }));
}

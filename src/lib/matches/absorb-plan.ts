// 연기 경기 쌍둥이 흡수 계획 — stale 행에 붙은 데이터를 테이블별로 이전·삭제·차단 판정(순수 함수)
//
// 왜 필요한가. cleanup-stale-scheduled 는 연기된 경기의 옛 행을 새 시각의 반대 소스 쌍둥이로
// 흡수하는데, 종전엔 배당 스냅샷 외 종속이 하나라도 있으면 거부했다. 프리뷰 글·봇 픽만 붙어
// 있어도 "중복충돌"로 매 실행 같은 알림이 나가고 날짜 틀린 프리뷰가 게시된 채 남았다
// (2026-09-09 Middlesbrough vs Millwall 29회 반복). 규칙 근거는 reports/plans/stale-twin-absorb.

/** 옛 행과 함께 Cascade 로 사라져도 되는 테이블 — 쌍둥이 쪽 기록이 기준이다. */
const CASCADE_DROP = new Set([
  "OddsBookSnapshot",
  "AiPrediction",
  "PredictionContextSnapshot",
  "PredictionPostmortem",
  "LiveCommentary",
  "TsBaseballOddsHistory",
]);

/** 종료 후에만 생기는 데이터 — 미시작 쌍에 있으면 전제가 틀린 것이라 사람이 본다. */
const FINISHED_ONLY = new Set(["MatchStats", "BookClosingOdds"]);

const HANDLED = new Set([
  ...CASCADE_DROP,
  "OddsSnapshot",
  "TheSportsMatchCache",
  "Article",
  "MemberBotPick",
  "MatchVote",
  "UserMatchFollow",
  "Post",
  "PlayerEvent",
  "PushMatchAlert",
  "TelegramAlertLog",
  "BetmanOdds",
]);

export interface AbsorbInput {
  /** stale 행 기준 matchId 테이블별 건수 (information_schema 전수) */
  counts: Record<string, number>;
  articles: Array<{ id: number; type: string; status: string }>;
  picks: Array<{ id: number; botId: string; market: string }>;
  votes: Array<{ id: number; userId: string | null; sessionId: string | null; market: string }>;
  follows: Array<{ id: string; userId: string }>;
  twin: {
    picks: Array<{ botId: string; market: string }>;
    votes: Array<{ userId: string | null; sessionId: string | null; market: string }>;
    followUserIds: string[];
    oddsSnapshots: number;
    hasTsCache: boolean;
    betmanOdds: number;
  };
}

export interface AbsorbPlan {
  /** 비어 있지 않으면 흡수하지 않는다 (사람 판단) */
  blocked: string[];
  rejectArticleIds: number[];
  movePickIds: number[];
  deletePickIds: number[];
  moveVoteIds: number[];
  deleteVoteIds: number[];
  moveFollowIds: string[];
  deleteFollowIds: string[];
  movePosts: boolean;
  movePlayerEvents: boolean;
  /** 발송 기록은 옮기면 새 날짜 킥오프 알림이 "이미 보냄"으로 막힌다 — 삭제 */
  deleteAlertLogs: boolean;
  moveOddsSnapshots: boolean;
  moveTsCache: boolean;
  betman: "move" | "nullify" | "none";
}

export function planTwinAbsorb(input: AbsorbInput): AbsorbPlan {
  const { counts, twin } = input;
  const has = (table: string) => (counts[table] ?? 0) > 0;
  const blocked: string[] = [];

  for (const [table, n] of Object.entries(counts)) {
    if (!n) continue;
    if (FINISHED_ONLY.has(table)) blocked.push(`${table}=${n}(종료 후 데이터)`);
    else if (!HANDLED.has(table)) blocked.push(`${table}=${n}(규칙 없는 테이블)`);
  }
  const nonPreview = input.articles.filter((a) => a.type !== "PREVIEW");
  if (nonPreview.length) {
    blocked.push(`Article ${nonPreview.map((a) => `#${a.id}(${a.type})`).join(",")}(프리뷰 외 글)`);
  }

  const pickKeys = new Set(twin.picks.map((p) => `${p.botId}|${p.market}`));
  const movePickIds: number[] = [];
  const deletePickIds: number[] = [];
  for (const p of input.picks) {
    const key = `${p.botId}|${p.market}`;
    if (pickKeys.has(key)) deletePickIds.push(p.id);
    else {
      movePickIds.push(p.id);
      pickKeys.add(key);
    }
  }

  // 투표 고유키는 [matchId, userId, market]·[matchId, sessionId, market] — null 은 서로 충돌하지 않는다.
  const userKeys = new Set(twin.votes.filter((v) => v.userId).map((v) => `${v.userId}|${v.market}`));
  const sessionKeys = new Set(twin.votes.filter((v) => v.sessionId).map((v) => `${v.sessionId}|${v.market}`));
  const moveVoteIds: number[] = [];
  const deleteVoteIds: number[] = [];
  for (const v of input.votes) {
    const uk = v.userId ? `${v.userId}|${v.market}` : null;
    const sk = v.sessionId ? `${v.sessionId}|${v.market}` : null;
    if ((uk && userKeys.has(uk)) || (sk && sessionKeys.has(sk))) deleteVoteIds.push(v.id);
    else {
      moveVoteIds.push(v.id);
      if (uk) userKeys.add(uk);
      if (sk) sessionKeys.add(sk);
    }
  }

  const followUsers = new Set(twin.followUserIds);
  const moveFollowIds: string[] = [];
  const deleteFollowIds: string[] = [];
  for (const f of input.follows) {
    if (followUsers.has(f.userId)) deleteFollowIds.push(f.id);
    else {
      moveFollowIds.push(f.id);
      followUsers.add(f.userId);
    }
  }

  return {
    blocked,
    rejectArticleIds: input.articles
      .filter((a) => a.type === "PREVIEW" && a.status === "PUBLISHED")
      .map((a) => a.id),
    movePickIds,
    deletePickIds,
    moveVoteIds,
    deleteVoteIds,
    moveFollowIds,
    deleteFollowIds,
    movePosts: has("Post"),
    movePlayerEvents: has("PlayerEvent"),
    deleteAlertLogs: has("PushMatchAlert") || has("TelegramAlertLog"),
    moveOddsSnapshots: has("OddsSnapshot") && twin.oddsSnapshots === 0,
    moveTsCache: has("TheSportsMatchCache") && !twin.hasTsCache,
    betman: !has("BetmanOdds") ? "none" : twin.betmanOdds === 0 ? "move" : "nullify",
  };
}

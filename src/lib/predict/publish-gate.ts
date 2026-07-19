// AI 픽 발행 게이트 — 백테스트로 확인된 "승률 깎아먹는 픽 유형"을 저장 전 차단 (docs/prediction-gates).
// 규칙 3종: ① 1X2 시장 역행+저확신 ② 야구 핸디 HOME(-1.5 커버) ③ scorebase 외 모델의 OU.
// 판단 불가(배당 없음)면 통과 — 픽 개수 과도 감소 방지. env PREDICTION_PUBLISH_GATES=off 로 전체 해제.
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

export interface MatchOddsCtx {
  league: string;
  marketHome: number | null;
  marketDraw: number | null;
  marketAway: number | null;
  oddsHome: number | null;
  oddsDraw: number | null;
  oddsAway: number | null;
}

export type GateResult = { ok: true } | { ok: false; reason: string };

/** 1X2 시장 우세 방향 — vig 제거 확률 우선, 없으면 raw decimal implied (야구는 marketHome 미저장). */
function marketFavorite(ctx: MatchOddsCtx): string | null {
  if (ctx.marketHome != null && ctx.marketAway != null) {
    const trio: [string, number][] = [
      ["HOME", ctx.marketHome],
      ["DRAW", ctx.marketDraw ?? 0],
      ["AWAY", ctx.marketAway],
    ];
    trio.sort((a, b) => b[1] - a[1]);
    return trio[0][0];
  }
  if (ctx.oddsHome != null && ctx.oddsAway != null) {
    const trio: [string, number][] = [
      ["HOME", 1 / ctx.oddsHome],
      ["DRAW", ctx.oddsDraw != null ? 1 / ctx.oddsDraw : 0],
      ["AWAY", 1 / ctx.oddsAway],
    ];
    trio.sort((a, b) => b[1] - a[1]);
    return trio[0][0];
  }
  return null;
}

export function shouldPublishPick(
  model: string,
  market: string,
  pick: string,
  prob: number,
  line: number | null,
  ctx: MatchOddsCtx,
): GateResult {
  if (process.env.PREDICTION_PUBLISH_GATES === "off") return { ok: true };

  // ① 1X2 — 시장 우세와 반대 픽인데 확신도 낮음 (백테스트: 해당 픽 적중 30~44%)
  if (market === "1X2") {
    const fav = marketFavorite(ctx);
    if (fav != null && pick !== fav && prob < 0.6) {
      return { ok: false, reason: "1X2_AGAINST_MARKET_LOWCONF" };
    }
    return { ok: true };
  }

  // ② 야구 핸디 HOME(-1.5 커버) — 스킬 없음 (합산 41.1% ≈ 베이스 37.3%)
  if (market === "HANDICAP") {
    if (BASEBALL_LEAGUES.has(ctx.league) && pick === "HOME" && (line ?? 0) >= 1) {
      return { ok: false, reason: "HC_HOME_COVER_NO_SKILL" };
    }
    return { ok: true };
  }

  // ③ OU — scorebase(59%) 외 모델은 코인토스 이하(44~48%)
  if (market === "OU") {
    if (model !== "scorebase") {
      return { ok: false, reason: "OU_WEAK_MODEL" };
    }
    return { ok: true };
  }

  return { ok: true };
}

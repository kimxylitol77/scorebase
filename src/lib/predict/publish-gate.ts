// AI 픽 발행 게이트 — 백테스트로 확인된 "승률 깎아먹는 픽 유형"을 저장 전 차단 (docs/prediction-gates).
// 규칙 3종: ① 1X2 시장 역행+저확신 ② 야구 핸디 HOME(-1.5 커버) ③ OU 그림자 실측 통과제.
// 판단 불가(배당 없음)면 통과 — 픽 개수 과도 감소 방지. env PREDICTION_PUBLISH_GATES=off 로 전체 해제.
//
// ③ 은 원래 "scorebase 외 전 모델 차단"(07-19 백테스트: 타 모델 44~48%)이었으나, 미발행 픽도
// 계속 채점하는 설계 덕에 out-of-sample 재검증이 가능했고 그 근거가 기각됐다 (2026-08-01,
// 가동 후 표본 1,305건: 전 모델 50.7~58.5% — gpt-5.6 58.5% 는 scorebase 54.5% 보다 높았다).
// 고정 명단은 이렇게 낡는다 → 최근 그림자 성적이 기준을 넘는 모델만 발행하는 실측 통과제로 교체.
// 표본이 모자라거나 실측을 못 읽으면 기존처럼 차단(fail-closed) — 신규 좌석은 표본이 쌓이면
// (채점은 발행 여부와 무관하게 전 행 대상) 자동으로 통과권을 얻는다.
import { BASEBALL_LEAGUES } from "@/lib/sports/sport-leagues";

/** OU 실측 통과 기준 — 최근 창에서 이만큼 채점됐고 코인토스 아래가 아니어야 발행. */
export const OU_SHADOW_MIN_N = 120;
export const OU_SHADOW_MIN_ACC = 0.5;
/** 실측 집계 창(일) — 시즌·로스터가 바뀌므로 오래된 성적은 버린다. */
export const OU_SHADOW_WINDOW_DAYS = 60;

/** 모델별 OU 그림자 성적 (채점 완료분, 발행 여부 무관). */
export interface OuShadowStat {
  n: number;
  acc: number;
}

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
  /** OU 그림자 실측 (모델 → 성적). 미제공(null/undefined)이면 ③ 은 기존처럼 차단 — fail-closed. */
  ouStats?: ReadonlyMap<string, OuShadowStat> | null,
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

  // ③ OU — 그림자 실측 통과제. scorebase 는 앵커(채점 라인의 출처)라 항상 발행.
  //   타 모델은 최근 창 실측이 n>=120 && acc>=50% 일 때만 발행. 실측이 없으면(표본 부족·
  //   조회 실패·호출부가 stats 미전달) 기존 일괄 차단과 동일하게 동작한다 — 안전한 기본값.
  if (market === "OU") {
    if (model === "scorebase") return { ok: true };
    const s = ouStats?.get(model);
    if (s && s.n >= OU_SHADOW_MIN_N && s.acc >= OU_SHADOW_MIN_ACC) {
      return { ok: true };
    }
    return { ok: false, reason: "OU_WEAK_MODEL" };
  }

  return { ok: true };
}

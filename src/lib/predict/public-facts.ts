// 적중률 공개 문장 빌더 — /predictions/accuracy 「솔직한 요약」과 /predictions/statistics 인용 문장이 같은 숫자를 쓰게 한다.
// 좋은 숫자만 고르지 않는다: 최근 부진·마이너스 수익률·시장에 지는 리그도 같은 규칙으로 문장에 들어간다.
import { prisma } from "@/lib/db";
import { ACCURACY_LEAGUES, statForLeague, type MarketRate } from "@/lib/predict/accuracy-stats";
import { flatUnitRoiStats, headToHeadStats, type FlatUnitRoiStat, type HeadToHeadStat } from "@/lib/predict/model-vs-market";
import { pickClvStats, type PickClvStat } from "@/lib/predict/pick-clv";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export interface PublicFacts {
  leagueCount: number;
  oneXTwo: MarketRate;
  rolling30: MarketRate;
  strong: MarketRate;
  sinceLabel: string | null;
  flatRoi: FlatUnitRoiStat | null;
  headToHead: HeadToHeadStat | null;
  clv: PickClvStat | null;
}

// 리그 행을 "시장보다 약하다"고 부를 최소 표본 — 미만은 노이즈
export const WEAK_LEAGUE_MIN = 50;
// 최근 30일을 따로 말할 최소 표본
const ROLLING_MIN = 50;
// CLV 문장을 낼 최소 표본
export const CLV_MIN = 100;

// 적중률 페이지 표기와 맞춘다(LEAGUE_DISPLAY 는 MLB 를 "메이저리그"로 풀어 쓴다)
const SHORT_NAME: Record<string, string> = { LOL: "LCK", MLB: "MLB", NBA: "NBA", NHL: "NHL", KBO: "KBO", NPB: "NPB", MLS: "MLS" };
const leagueName = (lg: string) => SHORT_NAME[lg] ?? LEAGUE_DISPLAY[lg] ?? lg;
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const signedPct = (x: number, d = 1) => `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%`;
const n = (x: number) => x.toLocaleString("ko-KR");

export function sinceLabelOf(d: Date | null | undefined): string | null {
  return d
    ? d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" })
    : null;
}

/** 표본 ≥ WEAK_LEAGUE_MIN 인데 모델 적중이 시장보다 낮은 리그 — 격차 큰 순 */
export function weakLeagues(h2h: HeadToHeadStat | null) {
  if (!h2h) return [];
  return h2h.leagues
    .filter((l) => l.evaluated >= WEAK_LEAGUE_MIN && l.modelCorrect < l.marketCorrect)
    .map((l) => ({ league: l.league, name: leagueName(l.league), evaluated: l.evaluated, gap: (l.modelCorrect - l.marketCorrect) / l.evaluated }))
    .sort((a, b) => a.gap - b.gap);
}

/** 적중률 페이지 상단 요약 — 평서문, 사람이 읽는 톤 */
export function honestLines(f: PublicFacts): string[] {
  const out: string[] = [];
  const all = f.oneXTwo;
  out.push(
    `${f.sinceLabel ? `${f.sinceLabel}부터 ` : ""}종료된 ${n(all.evaluated)}경기에서 승패(1X2) 적중률은 ${pct(all.rate)}입니다.`,
  );
  if (f.rolling30.evaluated >= ROLLING_MIN) {
    const d = f.rolling30.rate - all.rate;
    const trend = Math.abs(d) < 0.01 ? "누적과 비슷합니다" : d > 0 ? `누적보다 ${(d * 100).toFixed(1)}%p 높습니다` : `누적보다 ${(-d * 100).toFixed(1)}%p 낮습니다`;
    out.push(`최근 30일(${n(f.rolling30.evaluated)}경기)은 ${pct(f.rolling30.rate)}로 ${trend}.`);
  }
  if (f.flatRoi && f.flatRoi.model.all.evaluated >= 100) {
    const m = f.flatRoi.model.all;
    const edge = m.roi - f.flatRoi.marketFav.all.roi;
    out.push(
      `모델 픽에 매 경기 1유닛을 걸었다고 치면 수익률은 ${signedPct(m.roi)}(${n(m.evaluated)}경기)이고, 매번 배당 낮은 쪽에 거는 기준선보다 ${edge >= 0 ? `${(edge * 100).toFixed(1)}%p 덜 잃었습니다` : `${(-edge * 100).toFixed(1)}%p 더 잃었습니다`}.`,
    );
  }
  const weak = weakLeagues(f.headToHead);
  if (weak.length > 0) {
    const names = weak.slice(0, 4).map((w) => `${w.name}(${(w.gap * 100).toFixed(1)}%p)`).join(", ");
    out.push(`같은 경기를 베팅시장과 나란히 채점하면 ${names}에서는 시장이 더 많이 맞혔습니다.`);
  }
  if (f.clv && f.clv.n >= CLV_MIN) {
    out.push(
      `프리뷰 글로 발행한 픽 ${n(f.clv.n)}건 중 ${pct(f.clv.beat / f.clv.n)}가 경기 직전 마감 배당보다 좋은 가격이었습니다(평균 ${signedPct(f.clv.avgClv, 2)}).`,
    );
  }
  return out;
}

/** 통계 페이지 인용 문장 — 한 줄씩 떼어 가도 뜻이 서도록 주어·표본·출처를 문장마다 넣는다 */
export function citableLines(f: PublicFacts): string[] {
  const out: string[] = [];
  const all = f.oneXTwo;
  out.push(
    `스코어베이스 AI 예측 모델의 승패(1X2) 적중률은 ${f.leagueCount}개 리그 ${n(all.evaluated)}경기 기준 ${pct(all.rate)}다${f.sinceLabel ? `(${f.sinceLabel}부터 종료 경기 전수 채점)` : ""}.`,
  );
  if (f.strong.evaluated >= 30) {
    const d = f.strong.rate - all.rate;
    out.push(`모델이 높은 확신을 보인 경기(Strong Pick) ${n(f.strong.evaluated)}경기의 적중률은 ${pct(f.strong.rate)}로, 전체 평균보다 ${(Math.abs(d) * 100).toFixed(1)}%p ${d >= 0 ? "높다" : "낮다"}.`);
  }
  if (f.rolling30.evaluated >= ROLLING_MIN) {
    out.push(`최근 30일 적중률은 ${n(f.rolling30.evaluated)}경기 기준 ${pct(f.rolling30.rate)}다.`);
  }
  if (f.headToHead && f.headToHead.evaluated >= 100) {
    const h = f.headToHead;
    out.push(
      `모델과 베팅시장 확률이 모두 있는 ${n(h.evaluated)}경기에서 모델은 ${pct(h.modelCorrect / h.evaluated)}, 시장 배당 1순위는 ${pct(h.marketCorrect / h.evaluated)}를 맞혔다.`,
    );
    if (h.disagree >= 30) {
      out.push(
        `모델이 시장과 다른 결과를 고른 ${n(h.disagree)}경기에서는 모델 ${pct(h.disagreeModelCorrect / h.disagree)}, 시장 ${pct(h.disagreeMarketCorrect / h.disagree)}가 적중했다.`,
      );
    }
  }
  if (f.flatRoi && f.flatRoi.model.all.evaluated >= 100) {
    const m = f.flatRoi.model.all;
    const fav = f.flatRoi.marketFav.all;
    out.push(
      `경기 전 마지막 평균 배당에 모델 픽으로 1유닛씩 걸었다는 후행 계산의 수익률은 ${n(m.evaluated)}경기 ${signedPct(m.roi)}이며, 매 경기 최저 배당에 건 기준선은 ${signedPct(fav.roi)}다.`,
    );
  }
  if (f.clv && f.clv.n >= CLV_MIN) {
    const c = f.clv;
    const other = c.n - c.beat;
    out.push(
      `발행된 프리뷰 픽 ${n(c.n)}건 중 ${pct(c.beat / c.n)}가 경기 직전 마감 배당보다 좋은 가격이었고, 평균 가격 차이는 ${signedPct(c.avgClv, 2)}다.`,
    );
    if (c.beat >= 30 && other >= 30) {
      out.push(
        `마감보다 좋은 가격이던 픽의 적중률은 ${pct(c.beatWins / c.beat)}(${n(c.beat)}건), 그렇지 않은 픽은 ${pct(c.otherWins / other)}(${n(other)}건)였다.`,
      );
    }
  }
  return out;
}

/** 통계 페이지용 — 적중률 페이지와 같은 함수·같은 캐시를 읽는다 */
export async function loadPublicFacts(): Promise<PublicFacts> {
  const [stats, flatRoi, headToHead, clv, dateAgg] = await Promise.all([
    Promise.all(ACCURACY_LEAGUES.map((lg) => statForLeague(lg))),
    flatUnitRoiStats(),
    headToHeadStats(),
    pickClvStats().catch(() => null),
    prisma.match.aggregate({ where: { predCorrect: { not: null } }, _min: { startTime: true } }),
  ]);
  const sum = (pick: (s: (typeof stats)[number]) => MarketRate): MarketRate => {
    const evaluated = stats.reduce((a, s) => a + pick(s).evaluated, 0);
    const correct = stats.reduce((a, s) => a + pick(s).correct, 0);
    return { evaluated, correct, rate: evaluated > 0 ? correct / evaluated : 0 };
  };
  return {
    leagueCount: ACCURACY_LEAGUES.length,
    oneXTwo: sum((s) => s.oneXTwo),
    rolling30: sum((s) => s.rolling30),
    strong: sum((s) => s.strong),
    sinceLabel: sinceLabelOf(dateAgg._min.startTime),
    flatRoi,
    headToHead,
    clv,
  };
}

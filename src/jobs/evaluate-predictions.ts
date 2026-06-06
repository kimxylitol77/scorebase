// 적중률 평가 잡.
// (1) PREVIEW 글: 글 시점에 저장한 predWinner 와 실제 결과 비교
// (2) Match 백테스트: 새로 종료된 모든 매치를 시점 기반 모델로 채움 (1X2/DC/OVER/BTTS)
//
// 사용:
//   npm run job:evaluate

import "@/lib/env";
import { prisma } from "@/lib/db";
import { buildMatchContext } from "@/lib/predict/build-context";
import {
  bestDoubleChance,
  dcCorrect,
  predictTotalMarket,
  predictBttsMarket,
  predictHandicapMarket,
  handicapCorrect,
  overActual,
  bttsActual,
  getSportProfile,
  SOCCER_LEAGUES_FOR_MARKETS,
} from "@/lib/predict/markets";
import {
  computeStarterAdjustment,
  applyStarterToWinProb,
} from "@/lib/predict/starter-adjust";
import {
  computeGoalieAdjustment,
  applyGoalieToWinProb,
} from "@/lib/predict/goalie-adjust";
import { blendWithMarket } from "@/lib/predict/market-blend";
import type { PredictMatch } from "@/lib/predict/types";
import { parseTsFootballScore } from "@/lib/sports/live-scores";

/**
 * 채점용 실제 점수 — 축구는 1X2/OU/핸디캡 모두 90분(정규시간) 기준.
 * DB.homeScore 는 승부차기 합산 오염 가능(예 UCL 결승 4-3) → cache 의 정규시간(regHome/regAway) 우선.
 * cache 없거나 축구 아니면 DB 점수 그대로.
 */
function gradingScore(
  league: string,
  dbHome: number,
  dbAway: number,
  detailLive: unknown,
): { home: number; away: number } {
  if (SOCCER_LEAGUES_FOR_MARKETS.has(league)) {
    const fs = parseTsFootballScore(detailLive);
    if (fs) return { home: fs.regHome, away: fs.regAway };
  }
  return { home: dbHome, away: dbAway };
}

function parseStarter(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function parseGoalie(s: string | null) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function actualWinnerOf(home: number, away: number): "HOME" | "DRAW" | "AWAY" {
  if (home > away) return "HOME";
  if (away > home) return "AWAY";
  return "DRAW";
}

export async function runEvaluate(opts?: { limit?: number }) {
  const limit = opts?.limit ?? 500;
  console.log("[evaluate] 시작");

  // PREVIEW 글 + 매치 종료 + predWinner 있고 아직 평가 안 됨
  const articles = await prisma.article.findMany({
    where: {
      type: "PREVIEW",
      predWinner: { not: null },
      evaluatedAt: null,
      match: {
        status: "FINISHED",
        homeScore: { not: null },
        awayScore: { not: null },
      },
    },
    include: {
      match: {
        select: {
          homeScore: true,
          awayScore: true,
          league: true,
          theSportsCache: { select: { detailLive: true } },
        },
      },
    },
    take: limit,
  });

  console.log(`[evaluate] 평가 대상: ${articles.length}건`);
  if (articles.length === 0) return { evaluated: 0, correct: 0 };

  let correctCount = 0;
  for (const a of articles) {
    if (!a.match || a.match.homeScore == null || a.match.awayScore == null) continue;
    const gs = gradingScore(
      a.match.league,
      a.match.homeScore,
      a.match.awayScore,
      a.match.theSportsCache?.detailLive,
    );
    const actual = actualWinnerOf(gs.home, gs.away);
    const isCorrect = a.predWinner === actual;
    await prisma.article.update({
      where: { id: a.id },
      data: { evaluatedAt: new Date(), correct: isCorrect },
    });
    if (isCorrect) correctCount++;
  }

  console.log(
    `[evaluate] 완료: ${correctCount}/${articles.length} 적중 (${Math.round((correctCount / articles.length) * 100)}%)`,
  );
  return { evaluated: articles.length, correct: correctCount };
}

/**
 * Match 백테스트: predCorrect 가 아직 null 인 FINISHED 매치를 찾아
 * 시점 기반 buildMatchContext + Poisson 으로 1X2/DC/OVER/BTTS 모두 채움.
 * 리그별로 한 번씩 prisma.findMany 해서 in-memory 컨텍스트 재사용.
 */
export async function runEvaluateMatches(opts?: { limit?: number }) {
  const limit = opts?.limit ?? 400;
  console.log("[evaluate/match] 시작");

  // 최신 매치 먼저 채점 (desc). asc 면 평가불가 컵/여자/마이너 리그 매치(양팀 prior<5 → 아래
  // MIN_PRIOR 에서 영구 skip)가 큐 머리를 점거해, take 만큼 집어도 전부 건너뛰고 끝나 최근 매치가
  // 영영 채점 안 됨 (19401 백로그 中 최古 250건이 100% 이런 매치였음 → 알림 17% starvation).
  // desc 면 평가 가능한 최근 매치가 항상 머리에 와 즉시 처리되고, 평가불가 매치는 바닥으로
  // 가라앉아 starvation 없음.
  const pending = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      homeScore: { not: null },
      awayScore: { not: null },
      predCorrect: null,
    },
    orderBy: { startTime: "desc" },
    take: limit,
    include: { theSportsCache: { select: { detailLive: true } } },
  });
  console.log(`[evaluate/match] 미평가: ${pending.length}건`);
  if (pending.length === 0) return { evaluated: 0, byLeague: {} };

  // PREVIEW 글이 있는 매치 — predHome/predWinner 는 글 생성 시점 값을 보존(덮어쓰기 X).
  // 본문(Article.predHome) = Match.predHome = 위젯 단일 소스 유지. evaluate 는 채점만.
  // (글 없는 매치는 아래에서 기존대로 재계산 — 적중률 백테스트 표본 확보)
  const previewArticles = await prisma.article.findMany({
    where: {
      type: "PREVIEW",
      predWinner: { not: null },
      matchId: { in: pending.map((m) => m.id) },
    },
    select: { matchId: true },
  });
  const hasPreview = new Set(previewArticles.map((a) => a.matchId));

  // 리그별 전체 매치 한 번씩만 가져오기 (in-memory 캐시)
  const leagues = Array.from(new Set(pending.map((m) => m.league)));
  const cache = new Map<string, PredictMatch[]>();
  for (const lg of leagues) {
    const list = await prisma.match.findMany({
      where: { league: lg },
      select: {
        id: true,
        league: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        startTime: true,
      },
    });
    cache.set(lg, list as PredictMatch[]);
  }

  const tally: Record<string, number> = {};
  for (const m of pending) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const all = cache.get(m.league)!;

    // 채점용 점수 — 축구는 정규시간(90분) 기준 (승부차기/연장 오염 제거).
    const gs = gradingScore(
      m.league,
      m.homeScore,
      m.awayScore,
      m.theSportsCache?.detailLive,
    );

    // 시즌 초반 학습 부족 매치 제외 — Elo 가 1500 기본값이라
    // 픽이 거의 50/50 random. 양 팀 모두 5경기 이상 치른 후의 매치만 평가.
    const homePrior = all.filter(
      (p) =>
        (p.homeTeamId === m.homeTeamId || p.awayTeamId === m.homeTeamId) &&
        p.status === "FINISHED" &&
        p.startTime.getTime() < m.startTime.getTime(),
    ).length;
    const awayPrior = all.filter(
      (p) =>
        (p.homeTeamId === m.awayTeamId || p.awayTeamId === m.awayTeamId) &&
        p.status === "FINISHED" &&
        p.startTime.getTime() < m.startTime.getTime(),
    ).length;
    const MIN_PRIOR = 5; // 양 팀 모두 5경기 이상 학습 후
    if (Math.min(homePrior, awayPrior) < MIN_PRIOR) continue;

    const ctx = buildMatchContext(
      all,
      m.league,
      m.homeTeamId,
      m.awayTeamId,
      m.startTime,
    );
    const baseWp = ctx.winProb;
    if (!baseWp) continue;

    // MLB 선발 투수 / NHL 골리 가중치
    const homeStarter = parseStarter(m.homeStarter);
    const awayStarter = parseStarter(m.awayStarter);
    const homeGoalie = parseGoalie(m.homeGoalie);
    const awayGoalie = parseGoalie(m.awayGoalie);
    const sAdj = computeStarterAdjustment(homeStarter, awayStarter);
    const gAdj = computeGoalieAdjustment(homeGoalie, awayGoalie);
    let wp = baseWp;
    if (sAdj.applied) wp = applyStarterToWinProb(wp, sAdj);
    if (gAdj.applied) wp = applyGoalieToWinProb(wp, gAdj);

    // 시장 odds blending — 베팅사이트 평균과 ensemble (시장 60% / 우리 40%)
    if (m.marketHome != null && m.marketAway != null) {
      const blended = blendWithMarket(wp, {
        home: m.marketHome,
        draw: m.marketDraw,
        away: m.marketAway,
        bookmakers: m.marketBookmakers,
      });
      wp = blended;
    }

    const recalcWinner =
      wp.home >= wp.away && wp.home >= wp.draw
        ? "HOME"
        : wp.away >= wp.draw
          ? "AWAY"
          : "DRAW";
    const actualW = actualWinnerOf(gs.home, gs.away);

    // PREVIEW 글이 있으면 글 생성 시점 예측(Match.predWinner)을 그대로 채점 — 덮어쓰기 X.
    // 글 없으면 방금 재계산한 값으로 평가 (적중률 백테스트).
    const useStored = hasPreview.has(m.id) && m.predWinner != null;
    const winner = useStored ? (m.predWinner as "HOME" | "DRAW" | "AWAY") : recalcWinner;
    const correct = winner === actualW;

    const data: Record<string, unknown> = useStored
      ? { predCorrect: correct }
      : {
          predHome: wp.home,
          predDraw: wp.draw,
          predAway: wp.away,
          predWinner: winner,
          predCorrect: correct,
        };

    // Value Bet 평가 — 시장 odds 가 저장돼 있으면 우리 모델 pick 의 prob 와 시장 prob 비교.
    // 베팅사 3개 미만이면 시장 합의가 약해 Value Bet 판정 신뢰 불가 (NPB "0개사인데
    // Value Bet" 사례 차단). marketBookmakers >= 3 일 때만 평가.
    if (m.marketHome != null && m.marketAway != null && (m.marketBookmakers ?? 0) >= 3) {
      const modelProb =
        winner === "HOME" ? wp.home : winner === "AWAY" ? wp.away : wp.draw;
      const marketProb =
        winner === "HOME"
          ? m.marketHome
          : winner === "AWAY"
            ? m.marketAway
            : (m.marketDraw ?? 0);
      const gap = modelProb - marketProb;
      data.valueGap = gap;
      data.isValueBet = gap >= 0.05; // 5%p 이상 모델이 시장보다 자신 있음
    }

    // OVER/UNDER + 핸디캡 — 모든 종목
    const sportProfile = getSportProfile(m.league);
    if (sportProfile) {
      const total = predictTotalMarket(
        all,
        m.league,
        m.homeTeamId,
        m.awayTeamId,
        m.startTime,
      );
      if (total) {
        const ovPick = total.pOver >= 0.5 ? "OVER" : "UNDER";
        data.predOverProb = total.pOver;
        data.predOverPick = ovPick;
        data.predOverCorrect =
          ovPick === overActual(gs.home, gs.away, total.line);
      }
      const hc = predictHandicapMarket(
        all,
        m.league,
        m.homeTeamId,
        m.awayTeamId,
        m.startTime,
      );
      if (hc) {
        data.predHcLine = hc.line;
        data.predHcPick = hc.pick;
        data.predHcProb = hc.prob;
        data.predHcCorrect = handicapCorrect(
          hc.pick,
          hc.line,
          gs.home,
          gs.away,
        );
      }
    }

    // 축구 한정 — DC + BTTS
    if (SOCCER_LEAGUES_FOR_MARKETS.has(m.league)) {
      const dc = bestDoubleChance(wp);
      data.predDcPick = dc.pick;
      data.predDcProb = dc.prob;
      data.predDcCorrect = dcCorrect(dc.pick, actualW);
      const btts = predictBttsMarket(
        all,
        m.league,
        m.homeTeamId,
        m.awayTeamId,
        m.startTime,
      );
      if (btts) {
        const btPick = btts.pBtts >= 0.5 ? "YES" : "NO";
        data.predBttsProb = btts.pBtts;
        data.predBttsPick = btPick;
        data.predBttsCorrect =
          btPick === bttsActual(m.homeScore, m.awayScore);
      }
    }

    await prisma.match.update({ where: { id: m.id }, data });
    tally[m.league] = (tally[m.league] ?? 0) + 1;
  }
  console.log("[evaluate/match] 리그별 처리:", tally);
  return { evaluated: pending.length, byLeague: tally };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  Promise.all([runEvaluate(), runEvaluateMatches()])
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}

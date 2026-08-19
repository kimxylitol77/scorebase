// 매치의 유리·불리 요인 추출 — 축구 매치 상세의 "경기 전 체크포인트" 카드용.
//
// 7m 의 "사건 영향(유익/중립/악재)" 자리를 우리 재료로 대체한 것. 7m 은 각 요인에
// 40%·60% 같은 영향도를 붙이는데 산출 근거가 드러나지 않아 그대로 따르지 않는다.
// 우리는 판정(유리/불리)과 실제 수치만 보여주고 해석은 독자에게 맡긴다.
//
// 새 쿼리는 없다 — getLeagueMatches 가 cache() 라 SoccerTeamStrength 가 이미 부른
// 요청 안에서는 DB 재조회가 일어나지 않고, 나머지는 전부 순수 계산이다.

import { getLeagueMatches } from "@/lib/predict/league-data";
import { calcStreaks } from "@/lib/predict/streak";
import { calcRecentTrend } from "@/lib/predict/recent-trend";
import type { PredictMatch } from "@/lib/predict/types";
import type { H2HResult, StandingLite } from "@/lib/live/match-extras";

export interface MatchFactor {
  tone: "good" | "bad";
  text: string;
  /** 정렬용 — 클수록 먼저 보여준다 */
  weight: number;
}

export interface MatchFactors {
  home: MatchFactor[];
  away: MatchFactor[];
}

/** 한 팀에 최대 몇 개까지 보여줄지 — 넘치면 훑어보기가 안 된다. */
const MAX_PER_SIDE = 3;

/** 홈/원정 split 판정에 필요한 최소 경기 수 — 개막 직후 2경기로 "홈 강세" 를 말할 수 없다. */
const MIN_SPLIT_PLAYED = 5;

/**
 * 홈/원정 split 을 최근 몇 경기까지 볼지.
 *
 * 리그 전체 기간을 집계하면 개막 직후에 "원정 19경기 1승 5무 13패" 처럼 지난 시즌
 * 기록이 이번 시즌인 것처럼 읽힌다(2026-08-19 라리가 1R 실측). 시즌 경계로 자르면
 * 반대로 개막철엔 표본이 0~2경기라 요인이 아예 안 나온다. 7m 도 "최근 홈 10경기"
 * 방식이라 같은 창을 쓴다 — 문구에도 "최근" 을 명시한다.
 */
const SPLIT_WINDOW = 10;

/** 순위 격차를 요인으로 인정하는 최소 차이 */
const MIN_RANK_GAP = 6;

/**
 * 순위를 요인으로 쓰기 위한 최소 소화 경기 수.
 * 개막 직후 순위표는 지난 시즌 값이 남아 있어 그대로 쓰면 오보가 된다.
 */
const MIN_RANK_PLAYED = 5;

/** 한 팀의 최근 홈(또는 원정) N경기 성적 — beforeTime 이전, 최신순. */
function recentSplit(
  matches: PredictMatch[],
  teamId: number,
  side: "home" | "away",
  beforeTime: Date,
  n: number,
) {
  const rows = matches
    .filter(
      (m) =>
        m.status === "FINISHED" &&
        m.homeScore !== null &&
        m.awayScore !== null &&
        m.startTime.getTime() < beforeTime.getTime() &&
        (side === "home" ? m.homeTeamId === teamId : m.awayTeamId === teamId),
    )
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, n);

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const m of rows) {
    const my = side === "home" ? m.homeScore! : m.awayScore!;
    const opp = side === "home" ? m.awayScore! : m.homeScore!;
    if (my > opp) wins++;
    else if (my < opp) losses++;
    else draws++;
  }
  const played = rows.length;
  return { played, wins, draws, losses, ppg: played ? (wins * 3 + draws) / played : 0 };
}

function pick(list: MatchFactor[]): MatchFactor[] {
  return list.sort((a, b) => b.weight - a.weight).slice(0, MAX_PER_SIDE);
}

/**
 * 홈/원정 각각의 유리·불리 요인.
 * 요인이 한쪽도 없으면 빈 배열 — 카드는 호출부에서 숨긴다.
 */
export async function getMatchFactors(args: {
  league: string;
  startTime: Date;
  homeTeamId: number;
  awayTeamId: number;
  homeNameKo: string;
  awayNameKo: string;
  /** home 팀 관점 맞대결 결과 */
  h2hHome: H2HResult | null;
  homeStanding: StandingLite | null;
  awayStanding: StandingLite | null;
}): Promise<MatchFactors> {
  const matches = await getLeagueMatches(args.league);
  const ref = args.startTime;

  const build = (teamId: number, side: "home" | "away"): MatchFactor[] => {
    const out: MatchFactor[] = [];
    const split = recentSplit(matches, teamId, side, ref, SPLIT_WINDOW);
    const label = side === "home" ? "홈" : "원정";
    const streak = calcStreaks(matches, teamId, ref);
    const trend = calcRecentTrend(matches, teamId, ref, 5);

    // 홈/원정 split — 7m 이 가장 앞세우는 요인
    if (split.played >= MIN_SPLIT_PLAYED) {
      const rec = `최근 ${label} ${split.played}경기 ${split.wins}승 ${split.draws}무 ${split.losses}패`;
      if (split.ppg >= 1.9) {
        out.push({ tone: "good", text: `${rec} (경기당 승점 ${split.ppg.toFixed(2)})`, weight: 90 });
      } else if (split.ppg <= 0.9) {
        out.push({ tone: "bad", text: `${rec} (경기당 승점 ${split.ppg.toFixed(2)})`, weight: 88 });
      }
    }

    // 연속 기록 — 연승이 있으면 무패 연속은 같은 말이라 겹쳐 쓰지 않는다
    if (streak.winningRun >= 3) {
      out.push({ tone: "good", text: `${streak.winningRun}연승 중`, weight: 85 });
    } else if (streak.unbeatenRun >= 5) {
      out.push({ tone: "good", text: `${streak.unbeatenRun}경기 무패`, weight: 78 });
    }
    if (streak.losingRun >= 3) {
      out.push({ tone: "bad", text: `${streak.losingRun}연패 중`, weight: 86 });
    }

    // 최근 5경기 득실
    if (trend.matches >= 5) {
      if (trend.avgGoalsFor >= 2.0) {
        out.push({ tone: "good", text: `최근 5경기 경기당 ${trend.avgGoalsFor.toFixed(1)}득점`, weight: 70 });
      }
      if (trend.avgGoalsAgainst >= 2.0) {
        out.push({ tone: "bad", text: `최근 5경기 경기당 ${trend.avgGoalsAgainst.toFixed(1)}실점`, weight: 72 });
      }
    }
    if (streak.failedToScoreLast5 >= 3) {
      out.push({ tone: "bad", text: `최근 5경기 중 ${streak.failedToScoreLast5}경기 무득점`, weight: 75 });
    }
    if (streak.cleanSheetsLast5 >= 3) {
      out.push({ tone: "good", text: `최근 5경기 중 ${streak.cleanSheetsLast5}경기 무실점`, weight: 74 });
    }

    return out;
  };

  const home = build(args.homeTeamId, "home");
  const away = build(args.awayTeamId, "away");

  // 순위 격차 — 양쪽 순위가 다 있을 때만
  const hs = args.homeStanding;
  const as = args.awayStanding;
  if (
    hs &&
    as &&
    hs.played >= MIN_RANK_PLAYED &&
    as.played >= MIN_RANK_PLAYED &&
    Math.abs(hs.position - as.position) >= MIN_RANK_GAP
  ) {
    const homeHigher = hs.position < as.position;
    home.push({
      tone: homeHigher ? "good" : "bad",
      text: `리그 ${hs.position}위 (상대 ${as.position}위)`,
      weight: 80,
    });
    away.push({
      tone: homeHigher ? "bad" : "good",
      text: `리그 ${as.position}위 (상대 ${hs.position}위)`,
      weight: 80,
    });
  }

  // 맞대결 — h2hHome 은 home 관점이라 away 는 승패를 뒤집는다
  const h = args.h2hHome;
  if (h && h.results.length >= 3) {
    const n = h.results.length;
    if (h.wins >= 3) {
      home.push({ tone: "good", text: `최근 맞대결 ${n}경기 ${h.wins}승`, weight: 65 });
      away.push({ tone: "bad", text: `최근 맞대결 ${n}경기 ${h.wins}패`, weight: 65 });
    } else if (h.losses >= 3) {
      home.push({ tone: "bad", text: `최근 맞대결 ${n}경기 ${h.losses}패`, weight: 65 });
      away.push({ tone: "good", text: `최근 맞대결 ${n}경기 ${h.losses}승`, weight: 65 });
    }
  }

  return { home: pick(home), away: pick(away) };
}

// 풋볼픽스터 봇 — 해외 축구 팁스터들의 승무패(1X2) 컨센서스를 우리 데이터(Elo·배당·자체
// 모델)와 함께 한국어 픽스터 분석으로 /analysis 게시판에 발행. 해외픽스터(consensus-bot.ts,
// MLB OU)와 동일한 2단계 구조 — 이 모듈은 매칭(matchSoccerPick)과 저장(saveSoccerPickPost)만
// 제공하고, 한국어 분석 생성은 맥미니 로컬 Ollama(soccer-pickster-crawler.js)가 담당한다.
// 경기 종료 후 scoreAnalysisPredictions 가 1X2 자동 채점 → 풋볼픽스터 적중률 누적.

import "server-only";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { botTeamName } from "@/lib/analysis/manager-bot";
import { kickoffLabel } from "@/lib/analysis/format";
import { leagueLabel } from "@/lib/analysis/matches";
import { normalizeOddsTeamName } from "@/lib/odds/odds-api";

const PICKSTER_EMAIL = "soccer-pickster@scorebase.internal";
const PICKSTER_NICKNAME = "풋볼픽스터";
const DISCLAIMER =
  "\n\n---\n_해외 베팅 팁스터들의 픽 동향과 자체 데이터를 함께 본 분석입니다. 적중을 보장하지 않으며, 투자·베팅 결정은 본인 책임입니다._";

// 컨센서스 우세가 이 비율 미만이면 박빙이라 의미 약함 → 발행/채점 노이즈 방지로 skip.
const MIN_CONFIDENCE_PCT = 60;

// 크롤러가 보내는 리그 코드 화이트리스트 (우리 축구 리그 중 예측·배당 데이터 보유 리그).
const SOCCER_PICK_LEAGUES = new Set([
  "EPL", "CHAMPIONSHIP", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "UCL", "UEL", "UECL", "K_LEAGUE_1", "J1_LEAGUE",
]);

/** 봇(가상 작성자) 계정 보장 — 없으면 생성, 닉네임 바뀌었으면 동기화. */
export async function ensureSoccerPickster(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: PICKSTER_EMAIL },
    select: { id: true, nickname: true },
  });
  if (existing) {
    if (existing.nickname !== PICKSTER_NICKNAME) {
      await prisma.user.update({ where: { id: existing.id }, data: { nickname: PICKSTER_NICKNAME } });
    }
    return existing.id;
  }
  const pw = await hashPassword(`soccer-pickster-seed-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email: PICKSTER_EMAIL, passwordHash: pw, nickname: PICKSTER_NICKNAME },
    select: { id: true },
  });
  return u.id;
}

export interface SoccerPickGame {
  league: string; // 우리 리그 코드 (크롤러가 OLBG 라벨 → 코드 매핑)
  homeName: string; // 해외 소스 원문 팀명 (예 "Man Utd")
  awayName: string;
  selection: string; // 컨센서스 우세 픽 원문 (팀명 또는 "Draw")
  kickoffIso: string; // 해외 소스 킥오프 (ISO UTC)
  confidencePct: number; // 컨센서스 비율 0~100
  tipsFor: number | null; // 우세 픽 수
  tipsTotal: number | null; // 전체 픽 수
  odds: number | null; // 우세 픽 배당 (참고용)
}

export type SoccerPickOutcome =
  | { matched: false; reason: "too_close" | "bad_league" | "bad_time" | "no_match" | "dup" | "bad_selection" }
  | {
      matched: true;
      matchId: number;
      pick: "HOME" | "DRAW" | "AWAY";
      homeKo: string;
      awayKo: string;
      leagueLabel: string;
      kickoffKst: string;
      homeElo: number;
      awayElo: number;
      oddsHome: number | null;
      oddsDraw: number | null;
      oddsAway: number | null;
      predHome: number | null;
      predDraw: number | null;
      predAway: number | null;
      confidencePct: number;
      tipsFor: number | null;
      tipsTotal: number | null;
      odds: number | null;
    };

/**
 * 1단계: 박빙 skip → 팀명 정규화 + 킥오프 시각 근접(±3h)으로 Match 매칭 → dedup.
 * LLM 호출 없음. 생성에 필요한 컨텍스트(한글 팀명·우리 데이터)까지 계산해 반환한다.
 */
export async function matchSoccerPick(g: SoccerPickGame): Promise<SoccerPickOutcome> {
  if (g.confidencePct < MIN_CONFIDENCE_PCT) return { matched: false, reason: "too_close" };
  if (!SOCCER_PICK_LEAGUES.has(g.league)) return { matched: false, reason: "bad_league" };
  const kickoff = new Date(g.kickoffIso);
  if (!Number.isFinite(kickoff.getTime())) return { matched: false, reason: "bad_time" };

  const botId = await ensureSoccerPickster();

  // 킥오프 ±3h 창의 SCHEDULED 매치 중 정규화 팀명 부분일치 (배당 수집과 동일 전략).
  const WINDOW_MS = 3 * 3600e3;
  const candidates = await prisma.match.findMany({
    where: {
      league: g.league,
      status: "SCHEDULED",
      startTime: {
        gte: new Date(kickoff.getTime() - WINDOW_MS),
        lte: new Date(kickoff.getTime() + WINDOW_MS),
      },
    },
    select: {
      id: true,
      startTime: true,
      homeTeam: { select: { name: true, eloRating: true } },
      awayTeam: { select: { name: true, eloRating: true } },
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      posts: { where: { authorId: botId }, select: { id: true } },
    },
  });

  const homeN = normalizeOddsTeamName(g.homeName);
  const awayN = normalizeOddsTeamName(g.awayName);
  const partial = (a: string, b: string) => a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));

  let best: (typeof candidates)[number] | null = null;
  let bestGap = Infinity;
  for (const m of candidates) {
    const mh = normalizeOddsTeamName(m.homeTeam.name);
    const ma = normalizeOddsTeamName(m.awayTeam.name);
    if (!partial(mh, homeN) || !partial(ma, awayN)) continue;
    const gap = Math.abs(m.startTime.getTime() - kickoff.getTime());
    if (gap < bestGap) { bestGap = gap; best = m; }
  }
  if (!best) return { matched: false, reason: "no_match" };
  if (best.posts.length > 0) return { matched: false, reason: "dup" };

  // 컨센서스 우세 픽 → HOME/DRAW/AWAY (선택지 원문을 홈/원정 팀명과 대조).
  const selN = normalizeOddsTeamName(g.selection);
  let pick: "HOME" | "DRAW" | "AWAY";
  if (/^draw$/i.test(g.selection.trim())) pick = "DRAW";
  else if (partial(normalizeOddsTeamName(best.homeTeam.name), selN) || partial(homeN, selN)) pick = "HOME";
  else if (partial(normalizeOddsTeamName(best.awayTeam.name), selN) || partial(awayN, selN)) pick = "AWAY";
  else return { matched: false, reason: "bad_selection" };

  return {
    matched: true,
    matchId: best.id,
    pick,
    homeKo: botTeamName(toKoreanTeamName(best.homeTeam.name, g.league), g.league),
    awayKo: botTeamName(toKoreanTeamName(best.awayTeam.name, g.league), g.league),
    leagueLabel: leagueLabel(g.league),
    kickoffKst: kickoffLabel(best.startTime),
    homeElo: Math.round(best.homeTeam.eloRating),
    awayElo: Math.round(best.awayTeam.eloRating),
    oddsHome: best.oddsHome,
    oddsDraw: best.oddsDraw,
    oddsAway: best.oddsAway,
    predHome: best.predHome,
    predDraw: best.predDraw,
    predAway: best.predAway,
    confidencePct: g.confidencePct,
    tipsFor: g.tipsFor,
    tipsTotal: g.tipsTotal,
    odds: g.odds,
  };
}

export interface SaveSoccerPickInput {
  matchId: number;
  pick: "HOME" | "DRAW" | "AWAY";
  title: string;
  analysis: string; // 마크다운 본문 (스탯카드·DISCLAIMER 는 저장 시 append)
}

/**
 * 2단계: 맥미니 로컬 Ollama 가 생성한 완성 분석을 Post 로 저장.
 * match 단계와 save 단계 사이 race 대비 저장 직전 dedup 재확인.
 */
export async function saveSoccerPickPost(
  input: SaveSoccerPickInput,
): Promise<{ created: boolean; reason?: string; postId?: number }> {
  const botId = await ensureSoccerPickster();

  const dup = await prisma.post.findFirst({
    where: { authorId: botId, matchId: input.matchId },
    select: { id: true },
  });
  if (dup) return { created: false, reason: "dup" };

  // 스탯카드 짤 상시 첨부 — AI 승률 바 + 배당 (우리 데이터 근거 시각화).
  const card = `\n\n![경기 데이터 카드](/api/og/match-card?m=${input.matchId})`;
  const post = await prisma.post.create({
    data: {
      authorId: botId,
      title: input.title,
      content: input.analysis + card + DISCLAIMER,
      sport: "soccer",
      matchId: input.matchId,
      market: "1X2",
      line: null,
      pick: input.pick,
    },
    select: { id: true },
  });
  return { created: true, postId: post.id };
}

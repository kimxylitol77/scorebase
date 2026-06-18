// 해외픽스터 봇 — 해외 MLB 오버/언더(총득점) 대중 베팅 컨센서스를 한국어 분석으로
// /analysis 게시판에 발행. 매니저봇(manager-bot.ts)과 동일 게시판 구조지만, 픽 출처가
// Claude 추론이 아니라 대중 컨센서스(오버/언더 우세쪽)다. 한국어 분석 생성은 맥미니
// 로컬 Ollama 가 담당(Anthropic 크레딧 0 무관) — 이 모듈은 매칭(matchConsensusGame)과
// 저장(saveConsensusPost) 2단계만 제공한다. 경기 종료 후 scoreAnalysisPredictions 가
// 자동 채점 → "해외픽스터" 적중률이 게시판에 누적된다 (우리 AI 적중률과 비교 가능).

import "server-only";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { botTeamName } from "@/lib/analysis/manager-bot";
import { kickoffLabel } from "@/lib/analysis/format";

const CONSENSUS_EMAIL = "covers-consensus@scorebase.internal";
const CONSENSUS_NICKNAME = "해외픽스터";
const DISCLAIMER =
  "\n\n---\n_해외 베팅 대중의 베팅 동향 데이터입니다. 적중을 보장하지 않으며, 투자·베팅 결정은 본인 책임입니다._";

// 오버/언더 우세가 이 비율 미만이면 박빙이라 의미 약함 → 발행/채점 노이즈 방지로 skip.
const MIN_FAVORITE_PCT = 55;

// Covers 로고 약어 → scorebase Team.shortName. 28개는 대문자화로 일치, 예외 2개만 매핑.
const ABBR_EXCEPTIONS: Record<string, string> = { az: "ARI", was: "WSH" };

export function coversAbbrToShort(abbr: string): string {
  const a = abbr.trim().toLowerCase();
  return ABBR_EXCEPTIONS[a] ?? a.toUpperCase();
}

/** 봇(가상 작성자) 계정 보장 — 없으면 생성, 닉네임 바뀌었으면 동기화. */
export async function ensureConsensusBot(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: CONSENSUS_EMAIL },
    select: { id: true, nickname: true },
  });
  if (existing) {
    if (existing.nickname !== CONSENSUS_NICKNAME) {
      await prisma.user.update({ where: { id: existing.id }, data: { nickname: CONSENSUS_NICKNAME } });
    }
    return existing.id;
  }
  const pw = await hashPassword(`consensus-seed-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email: CONSENSUS_EMAIL, passwordHash: pw, nickname: CONSENSUS_NICKNAME },
    select: { id: true },
  });
  return u.id;
}

export interface ConsensusGame {
  awayAbbr: string; // Covers 로고 약어 (매칭용, 예 "chw")
  homeAbbr: string; // (예 "nyy")
  overPct: number; // 오버 베팅 비율 0~100
  underPct: number;
  line: number; // 총득점 기준선 (예 8.5)
  overPicks: number | null; // 픽 수
  underPicks: number | null;
  gameTimeEt: string | null; // 참고용
}

interface MatchedGame {
  matchId: number;
  startTime: Date;
  awayName: string;
  homeName: string;
  hasPost: boolean;
}

/** 약어 쌍 → scorebase MLB SCHEDULED Match. 봇이 이미 쓴 글 있으면 hasPost=true. */
async function findMatch(g: ConsensusGame, botId: string): Promise<MatchedGame | null> {
  const awayShort = coversAbbrToShort(g.awayAbbr);
  const homeShort = coversAbbrToShort(g.homeAbbr);
  const [away, home] = await Promise.all([
    prisma.team.findFirst({ where: { league: "MLB", shortName: awayShort }, select: { id: true } }),
    prisma.team.findFirst({ where: { league: "MLB", shortName: homeShort }, select: { id: true } }),
  ]);
  if (!away || !home) return null;

  const now = Date.now();
  const match = await prisma.match.findFirst({
    where: {
      league: "MLB",
      status: "SCHEDULED",
      homeTeamId: home.id,
      awayTeamId: away.id,
      startTime: { gte: new Date(now - 6 * 3600e3), lte: new Date(now + 48 * 3600e3) },
    },
    select: {
      id: true,
      startTime: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
      posts: { where: { authorId: botId }, select: { id: true } },
    },
    orderBy: { startTime: "asc" },
  });
  if (!match) return null;
  return {
    matchId: match.id,
    startTime: match.startTime,
    awayName: match.awayTeam.name,
    homeName: match.homeTeam.name,
    hasPost: match.posts.length > 0,
  };
}

export type MatchOutcome =
  | { matched: false; reason: "too_close" | "no_line" | "no_match" | "dup" }
  | {
      matched: true;
      matchId: number;
      awayKo: string;
      homeKo: string;
      kickoffKst: string;
      line: number;
      pick: "OVER" | "UNDER";
      overPct: number;
      underPct: number;
      overPicks: number | null;
      underPicks: number | null;
    };

/**
 * 1단계: 박빙 skip → 매칭 → dedup. LLM 호출 없음.
 * 한국어 분석 생성은 맥미니 크롤러(로컬 Ollama)가 담당하므로, 여기서는 생성에 필요한
 * 컨텍스트(한글 팀명·경기시각·우세 픽)까지 계산해 반환한다.
 */
export async function matchConsensusGame(g: ConsensusGame): Promise<MatchOutcome> {
  const fav = Math.max(g.overPct, g.underPct);
  if (fav < MIN_FAVORITE_PCT) return { matched: false, reason: "too_close" };
  if (!Number.isFinite(g.line)) return { matched: false, reason: "no_line" };

  const botId = await ensureConsensusBot();
  const m = await findMatch(g, botId);
  if (!m) return { matched: false, reason: "no_match" };
  if (m.hasPost) return { matched: false, reason: "dup" };

  const pick: "OVER" | "UNDER" = g.overPct >= g.underPct ? "OVER" : "UNDER";
  return {
    matched: true,
    matchId: m.matchId,
    awayKo: botTeamName(toKoreanTeamName(m.awayName, "MLB"), "MLB"),
    homeKo: botTeamName(toKoreanTeamName(m.homeName, "MLB"), "MLB"),
    kickoffKst: kickoffLabel(m.startTime),
    line: g.line,
    pick,
    overPct: g.overPct,
    underPct: g.underPct,
    overPicks: g.overPicks,
    underPicks: g.underPicks,
  };
}

export interface SaveConsensusInput {
  matchId: number;
  pick: "OVER" | "UNDER";
  line: number;
  title: string;
  analysis: string; // 마크다운 본문 (DISCLAIMER 는 저장 시 append)
}

/**
 * 2단계: 맥미니 로컬 Ollama 가 생성한 완성 분석을 Post 로 저장.
 * match 단계와 save 단계 사이에 다른 실행이 먼저 썼을 수 있어 저장 직전 dedup 재확인.
 */
export async function saveConsensusPost(
  input: SaveConsensusInput,
): Promise<{ created: boolean; reason?: string; postId?: number }> {
  const botId = await ensureConsensusBot();

  const dup = await prisma.post.findFirst({
    where: { authorId: botId, matchId: input.matchId },
    select: { id: true },
  });
  if (dup) return { created: false, reason: "dup" };

  const post = await prisma.post.create({
    data: {
      authorId: botId,
      title: input.title,
      content: input.analysis + DISCLAIMER,
      sport: "baseball",
      matchId: input.matchId,
      market: "OU",
      line: input.line,
      pick: input.pick,
    },
    select: { id: true },
  });
  return { created: true, postId: post.id };
}

// 해외 베팅 컨센서스 봇 — 미국 Covers.com 의 MLB 대중 베팅 컨센서스를 한국어 분석으로
// /analysis 게시판에 발행. 매니저봇(manager-bot.ts)과 동일 구조지만, 픽 출처가 Claude
// 추론이 아니라 Covers 대중 컨센서스(우세팀)다. 경기 종료 후 scoreAnalysisPredictions 가
// 자동 채점 → "해외 베팅 대중" 적중률이 게시판에 누적된다 (우리 AI 적중률과 비교 가능).

import "server-only";
import { prisma } from "@/lib/db";
import { generate } from "@/lib/ai/claude";
import { hashPassword } from "@/lib/user-auth";
import { toKoreanTeamName } from "@/lib/team-names";
import { botTeamName, parsePickJson } from "@/lib/analysis/manager-bot";
import { kickoffLabel } from "@/lib/analysis/format";

const CONSENSUS_EMAIL = "covers-consensus@scorebase.internal";
const CONSENSUS_NICKNAME = "해외픽스트";
const DISCLAIMER =
  "\n\n---\n_해외 베팅 대중의 베팅 동향 데이터입니다. 적중을 보장하지 않으며, 투자·베팅 결정은 본인 책임입니다._";

// 컨센서스 우세가 이 비율 미만이면 박빙이라 의미 약함 → 발행/채점 노이즈 방지로 skip.
const MIN_FAVORITE_PCT = 55;

// Covers 로고 약어 → scorebase Team.shortName. 28개는 대문자화로 일치, 예외 2개만 매핑.
const ABBR_EXCEPTIONS: Record<string, string> = { az: "ARI", was: "WSH" };

export function coversAbbrToShort(abbr: string): string {
  const a = abbr.trim().toLowerCase();
  return ABBR_EXCEPTIONS[a] ?? a.toUpperCase();
}

/** 봇(가상 작성자) 계정 보장 — manager 패턴. 로그인 미사용, authorId 만 사용. */
export async function ensureConsensusBot(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: CONSENSUS_EMAIL },
    select: { id: true },
  });
  if (existing) return existing.id;
  // 로그인 불가용 더미 해시 (봇은 세션 미사용).
  const pw = await hashPassword(`consensus-seed-${Date.now()}-${Math.random()}`);
  const u = await prisma.user.create({
    data: { email: CONSENSUS_EMAIL, passwordHash: pw, nickname: CONSENSUS_NICKNAME },
    select: { id: true },
  });
  return u.id;
}

export interface ConsensusGame {
  awayAbbr: string; // Covers 로고 약어 (예: "col")
  homeAbbr: string; // (예: "chc")
  awayPct: number; // 대중 베팅 비율 0~100
  homePct: number;
  awayOdds: number | null; // 머니라인 (+145 / -170)
  homeOdds: number | null;
  awayPicks: number | null; // 픽 수
  homePicks: number | null;
  gameTimeEt: string | null; // "Wed. Jun 17 8:05 pm ET" (참고용)
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

const SYSTEM = `당신은 한국어 스포츠 미디어 "스코어베이스"의 해외 베팅 동향 분석가입니다.
해외 베팅 대중의 컨센서스(수만 명 참가자의 픽 분포)를 한국 독자에게 전달합니다.

[역할]
- 주어진 컨센서스 데이터(양 팀 베팅 비율, 머니라인 배당, 픽 수)를 해석한다.
- "해외 베팅 대중이 어느 쪽에 얼마나 몰렸는지"와 그 의미를 설명한다.
- 픽은 이미 데이터로 정해져 있다(컨센서스 우세팀). 너는 그 근거를 분석할 뿐, 픽을 바꾸지 않는다.

[톤]
- 정보 전달형 문어체. "해외 베팅 시장에서는", "대중의 72%가" 식.
- 컨센서스가 항상 옳지 않음을 안다 — 인기팀 쏠림(대중 편향) 가능성을 한 줄 짚으면 좋다.
- 과장·자극 금지. 특정 출처나 사이트 이름은 언급하지 않는다.

[팀명 표기]
- 제공된 한글 팀명을 그대로 쓰거나 지역명으로 줄인다. 별명만 단독으로 쓰지 않는다.

[출력] 반드시 아래 JSON 객체 하나만 출력. 앞뒤 설명·코드블록 금지:
{"title":"제목","analysis":"마크다운 본문"}
- title: 40자 이내. 대중이 어느 쪽에 몰렸는지 드러낼 것.
- analysis: 마크다운. "## 대중 컨센서스", "## 배당·픽 분포", "## 해석" 세 섹션, 200자 이상.`;

interface Generated {
  title: string;
  analysis: string;
}

async function generateAnalysis(
  g: ConsensusGame,
  m: MatchedGame,
  pick: "HOME" | "AWAY",
): Promise<Generated | null> {
  const awayKo = botTeamName(toKoreanTeamName(m.awayName, "MLB"), "MLB");
  const homeKo = botTeamName(toKoreanTeamName(m.homeName, "MLB"), "MLB");
  const favKo = pick === "HOME" ? homeKo : awayKo;
  const favPct = pick === "HOME" ? g.homePct : g.awayPct;
  const ml = (x: number | null) => (x == null ? "-" : x > 0 ? `+${x}` : `${x}`);
  const picks = (x: number | null) => (x == null ? "" : `, ${x}픽`);

  const prompt = [
    `경기: ${awayKo}(원정) vs ${homeKo}(홈)`,
    `리그: MLB · 경기 시각(KST): ${kickoffLabel(m.startTime)}`,
    `해외 베팅 대중 컨센서스:`,
    `- ${awayKo}: ${g.awayPct}% (머니라인 ${ml(g.awayOdds)}${picks(g.awayPicks)})`,
    `- ${homeKo}: ${g.homePct}% (머니라인 ${ml(g.homeOdds)}${picks(g.homePicks)})`,
    `대중 우세: ${favKo} (${favPct}%)`,
  ].join("\n");

  const raw = await generate(prompt, { system: SYSTEM, maxTokens: 1400, temperature: 0.6 });
  const json = parsePickJson(raw);
  if (!json) return null;
  const title = String(json.title ?? "").trim().slice(0, 120);
  const analysis = String(json.analysis ?? "").trim();
  if (!title || analysis.length < 20) return null;
  return { title, analysis };
}

/** 경기 1건 인제스트 — 박빙 skip → 매칭 → dedup → Claude 분석 → Post 생성. */
export async function ingestConsensusGame(g: ConsensusGame): Promise<{
  created: boolean;
  reason?: string;
  postId?: number;
}> {
  const fav = Math.max(g.homePct, g.awayPct);
  if (fav < MIN_FAVORITE_PCT) return { created: false, reason: "too_close" };

  const botId = await ensureConsensusBot();
  const m = await findMatch(g, botId);
  if (!m) return { created: false, reason: "no_match" };
  if (m.hasPost) return { created: false, reason: "dup" };

  const pick: "HOME" | "AWAY" = g.homePct >= g.awayPct ? "HOME" : "AWAY";
  const gen = await generateAnalysis(g, m, pick);
  if (!gen) return { created: false, reason: "gen_fail" };

  const post = await prisma.post.create({
    data: {
      authorId: botId,
      title: gen.title,
      content: gen.analysis + DISCLAIMER,
      sport: "baseball",
      matchId: m.matchId,
      market: "1X2",
      line: null,
      pick,
    },
    select: { id: true },
  });
  return { created: true, postId: post.id };
}

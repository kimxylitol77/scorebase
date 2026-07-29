// 챗봇이 호출할 수 있는 DB 조회 도구. Claude tool use 형식.
//
// 새 tool 추가 절차: TOOL_DEFS 에 schema 추가 → execute 에 case 추가.
// 모든 응답은 모델이 그대로 인용할 수 있게 사람이 읽기 좋은 텍스트로 정리한다.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import { strongPickThreshold } from "@/lib/predict/strong-pick";
import { parseFixtureXg, xgOutcome } from "@/lib/xg/outcome";
import { calcStandings } from "@/lib/predict/standings";
import { currentSeasonStart, previousSeasonStart } from "@/lib/predict/season-window";
import { fetchBaseballTable } from "@/lib/sports/thesports/baseball-table";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";

const ALLOWED_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "UCL", "NBA", "NHL", "MLB", "KBO", "NPB",
] as const;

type League = (typeof ALLOWED_LEAGUES)[number];

const SOCCER_LEAGUES = new Set<string>([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL",
]);

function normalizeLeague(input?: string): League | undefined {
  if (!input) return undefined;
  const u = input.toUpperCase().replace(/\s+/g, "_");
  const map: Record<string, League> = {
    PREMIERLEAGUE: "EPL",
    PREMIER_LEAGUE: "EPL",
    프리미어리그: "EPL",
    라리가: "LALIGA",
    분데스리가: "BUNDESLIGA",
    세리에A: "SERIE_A",
    SERIEA: "SERIE_A",
    리그1: "LIGUE_1",
    LIGUE1: "LIGUE_1",
    챔피언스리그: "UCL",
    CHAMPIONSLEAGUE: "UCL",
    KBO리그: "KBO",
    한국프로야구: "KBO",
    프로야구: "KBO",
    일본프로야구: "NPB",
    메이저리그: "MLB",
  };
  if (map[u]) return map[u];
  return (ALLOWED_LEAGUES as readonly string[]).includes(u) ? (u as League) : undefined;
}

// KST(UTC+9) 기준 오늘 0시 ~ 다음 0시를 UTC Date 로 환산.
function kstDayRange(offsetDays = 0): { start: Date; end: Date } {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate() + offsetDays;
  // KST 0시 = UTC 전날 15시
  const start = new Date(Date.UTC(y, m, d, -9, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, -9, 0, 0));
  return { start, end };
}

function fmtKstDateTime(dt: Date): string {
  const kst = new Date(dt.getTime() + 9 * 60 * 60 * 1000);
  const mm = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(kst.getUTCDate()).padStart(2, "0");
  const hh = String(kst.getUTCHours()).padStart(2, "0");
  const mi = String(kst.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi} KST`;
}

function pct(p?: number | null): string {
  if (p == null || Number.isNaN(p)) return "-";
  return `${(p * 100).toFixed(1)}%`;
}

// 경기 상세 URL — 사이트 liveHref 규칙과 동일(야구·LoL 은 전용 소문자 라우트).
function matchUrl(league: string, externalId: string): string {
  const path =
    league === "KBO" || league === "NPB" || league === "MLB"
      ? `/live/${league.toLowerCase()}/${externalId}`
      : league === "LOL"
        ? `/live/lol/${externalId}`
        : `/live/${league}/${externalId}`;
  return `${SITE_URL}${path}`;
}

// ============================================================
// Tool definitions — Anthropic Tool[] 형식
// ============================================================
export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "get_today_matches",
    description:
      "오늘(KST) 예정 또는 진행 중인 경기 목록과 모델 1X2 예측, 시장 배당을 가져온다. league 필터 가능. 사용자가 '오늘 경기' '오늘 EPL' 같은 질문을 할 때 사용.",
    input_schema: {
      type: "object",
      properties: {
        league: {
          type: "string",
          description: "리그 코드. 예: EPL, LALIGA, NBA, MLB, NHL. 생략 시 모든 리그.",
        },
      },
    },
  },
  {
    name: "get_upcoming_matches",
    description:
      "향후 N일(기본 3일) 예정 경기 목록. league 지정 권장. '내일 경기' '이번 주말 EPL' 같은 질문에 사용.",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "리그 코드" },
        days: { type: "integer", description: "오늘 이후 며칠. 기본 3, 최대 7" },
      },
    },
  },
  {
    name: "get_recent_results",
    description:
      "최근 N일(기본 3일) 종료된 경기 결과 + 모델 적중 여부. '어제 결과' '최근 NBA' 같은 질문에 사용.",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "리그 코드" },
        days: { type: "integer", description: "최근 며칠. 기본 3, 최대 14" },
      },
    },
  },
  {
    name: "get_match_prediction",
    description:
      "특정 매치 ID 의 5종 예측(1X2, DC, OU, HC, BTTS)과 시장 배당, 라인업/통계 요약을 상세히 반환. 사용자가 '이 픽 근거가 뭐야' '이 경기 더 자세히' 같은 follow-up 을 할 때 사용. matchId 는 다른 tool 결과에 포함된 [#123] 형식 숫자.",
    input_schema: {
      type: "object",
      properties: {
        matchId: { type: "integer", description: "Match.id (숫자)" },
      },
      required: ["matchId"],
    },
  },
  {
    name: "search_articles",
    description:
      "사이트에 게시된 분석/프리뷰/리캡 기사를 제목 키워드로 검색해 최대 5개 반환. 팀명/리그명/일반 질문에 관련 글이 있는지 확인.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "검색어 (한글/영문 팀명, 리그명 등)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_top_picks",
    description:
      "가장 신뢰도 높은 예측·Strong Pick·오늘의 추천 픽을 묻는 질문에 사용. 아직 시작하지 않은 예정 경기 중 모델 최고 확률이 높은 순으로 최대 6개 반환. 경기를 되묻지 말고 이 도구를 바로 호출. league 로 특정 리그만 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "특정 리그만 보고 싶을 때 (선택)" },
      },
    },
  },
  {
    name: "get_xg_matchups",
    description:
      "예정 경기를 '기대 득점(xG)' 이 높은 순으로 추천한다. 양 팀의 최근 실측 xG(공격력·수비 허용)로 기대 총득점과 승부 확률을 추정. '오늘 xG 높은 경기 추천' '골 많이 날 것 같은 경기' '재미있을 경기' 같은 질문에 사용. 축구 전용(EPL·LALIGA·BUNDESLIGA·SERIE_A·LIGUE_1·MLS·UCL).",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "리그 코드. 생략 시 xG 보유 축구 리그 전체." },
        days: { type: "integer", description: "오늘부터 며칠 이내. 기본 3, 최대 7" },
      },
    },
  },
  {
    name: "get_team_xg",
    description:
      "특정 팀의 최근 xG 성적을 반환한다. 경기당 기대 득점·기대 실점과, 실제 득점이 xG 대비 얼마나 좋았는지(결정력 과대/과소 달성)를 함께 준다. '토트넘 요즘 폼 어때' '이 팀 결정력' 'xG 대비 성적' 같은 질문에 사용.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", description: "팀 이름 (한글/영문 일부만 입력해도 됨)" },
        league: { type: "string", description: "리그 코드 (동명 팀 구분용, 선택)" },
      },
      required: ["team"],
    },
  },
  {
    name: "get_standings",
    description:
      "리그 순위표를 반환한다. 순위·경기수·승무패·득실·승점. '지금 EPL 순위' '누가 1위야' '강등권' 같은 질문에 사용.",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "리그 코드. 예: EPL, LALIGA, NBA" },
        top: { type: "integer", description: "상위 몇 팀까지. 기본 10, 최대 30" },
      },
      required: ["league"],
    },
  },
  {
    name: "get_model_accuracy",
    description:
      "우리 AI 모델의 실측 적중률을 반환한다. 1X2·오버언더·핸디캡 시장별 적중률과 표본 경기 수. '예측 얼마나 맞아' '적중률' '믿을 만해?' 같은 신뢰도 질문에 사용. 수치를 지어내지 말고 반드시 이 도구 결과만 인용할 것.",
    input_schema: {
      type: "object",
      properties: {
        league: { type: "string", description: "특정 리그만 (생략 시 주요 리그 전체)" },
      },
    },
  },
  {
    name: "forward_to_admin",
    description:
      "사용자의 문의를 운영자에게 텔레그램으로 전달한다. 버그·오류 제보뿐 아니라 광고·제휴 문의, 관리자·운영팀 연락 요청, 기타 운영팀에 닿아야 하는 내용은 모두 이 도구로 전달한다. 단순 경기·데이터 질문에는 쓰지 않는다.",
    input_schema: {
      type: "object",
      properties: {
        message: { type: "string", description: "전달할 내용 요약" },
        category: { type: "string", description: "분류: 버그 · 광고 · 제휴 · 문의 · 기타 중 하나" },
      },
      required: ["message"],
    },
  },
];

// ============================================================
// 실행 핸들러
// ============================================================
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "get_today_matches":
      return await getTodayMatches(input.league as string | undefined);
    case "get_upcoming_matches":
      return await getUpcomingMatches(
        input.league as string | undefined,
        Math.min(7, Math.max(1, (input.days as number) || 3)),
      );
    case "get_recent_results":
      return await getRecentResults(
        input.league as string | undefined,
        Math.min(14, Math.max(1, (input.days as number) || 3)),
      );
    case "get_match_prediction":
      return await getMatchPrediction(input.matchId as number);
    case "search_articles":
      return await searchArticles(String(input.query ?? ""));
    case "get_top_picks":
      return await getTopPicks(input.league as string | undefined);
    case "get_xg_matchups":
      return await getXgMatchups(
        input.league as string | undefined,
        Math.min(7, Math.max(1, (input.days as number) || 3)),
      );
    case "get_team_xg":
      return await getTeamXg(String(input.team ?? ""), input.league as string | undefined);
    case "get_standings":
      return await getStandings(
        input.league as string | undefined,
        Math.min(30, Math.max(3, (input.top as number) || 10)),
      );
    case "get_model_accuracy":
      return await getModelAccuracy(input.league as string | undefined);
    case "forward_to_admin":
      return await forwardToAdmin(
        String(input.message ?? ""),
        String(input.category ?? "문의"),
      );
    default:
      return `(알 수 없는 도구: ${name})`;
  }
}

async function getTodayMatches(leagueRaw?: string): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  const { start, end } = kstDayRange(0);
  const matches = await prisma.match.findMany({
    where: {
      ...(league ? { league } : { league: { in: [...ALLOWED_LEAGUES] } }),
      startTime: { gte: start, lt: end },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 30,
  });
  if (matches.length === 0) {
    return league
      ? `오늘(KST) ${league} 경기 없음.`
      : "오늘(KST) 예정된 경기가 없습니다.";
  }
  const lines = matches.map((m) => {
    const winner =
      m.predWinner === "HOME" ? toKoreanTeamName(m.homeTeam.name, m.league)
      : m.predWinner === "AWAY" ? toKoreanTeamName(m.awayTeam.name, m.league)
      : m.predWinner === "DRAW" ? "무승부" : "-";
    const score =
      m.homeScore != null && m.awayScore != null
        ? ` ${m.homeScore}:${m.awayScore}`
        : "";
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)}${score} (${m.status}) · 모델픽: ${winner} (H ${pct(m.predHome)} / D ${pct(m.predDraw)} / A ${pct(m.predAway)}) · ${matchUrl(m.league, m.externalId)}`;
  });
  return lines.join("\n");
}

async function getUpcomingMatches(leagueRaw?: string, days = 3): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  const { start } = kstDayRange(0);
  const { end } = kstDayRange(days);
  const matches = await prisma.match.findMany({
    where: {
      ...(league ? { league } : { league: { in: [...ALLOWED_LEAGUES] } }),
      startTime: { gte: start, lt: end },
      status: { in: ["SCHEDULED", "TIMED"] },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 40,
  });
  if (matches.length === 0) return `향후 ${days}일 예정 경기 없음.`;
  const lines = matches.map((m) => {
    const winner =
      m.predWinner === "HOME" ? toKoreanTeamName(m.homeTeam.name, m.league)
      : m.predWinner === "AWAY" ? toKoreanTeamName(m.awayTeam.name, m.league)
      : m.predWinner === "DRAW" ? "무승부" : "-";
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)} · 픽: ${winner} · ${matchUrl(m.league, m.externalId)}`;
  });
  return lines.join("\n");
}

async function getRecentResults(leagueRaw?: string, days = 3): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  const { start } = kstDayRange(-days);
  const { end } = kstDayRange(0);
  const matches = await prisma.match.findMany({
    where: {
      ...(league ? { league } : { league: { in: [...ALLOWED_LEAGUES] } }),
      startTime: { gte: start, lt: end },
      status: "FINISHED",
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "desc" },
    take: 40,
  });
  if (matches.length === 0) return `최근 ${days}일 종료된 경기 없음.`;
  const lines = matches.map((m) => {
    const score = `${m.homeScore ?? "-"}:${m.awayScore ?? "-"}`;
    const correct =
      m.predCorrect === true ? "✓적중"
      : m.predCorrect === false ? "✗오답"
      : "-";
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} ${score} ${toKoreanTeamName(m.awayTeam.name, m.league)} · 모델 1X2: ${correct} · ${matchUrl(m.league, m.externalId)}`;
  });
  return lines.join("\n");
}

async function getMatchPrediction(matchId: number): Promise<string> {
  if (!Number.isFinite(matchId)) return "matchId 가 올바르지 않음.";
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    include: { homeTeam: true, awayTeam: true },
  });
  if (!m) return `match #${matchId} 을(를) 찾을 수 없음.`;

  const isSoccer = SOCCER_LEAGUES.has(m.league);
  const out: string[] = [];
  out.push(`경기: ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)}`);
  out.push(`링크: ${matchUrl(m.league, m.externalId)}`);
  out.push(`리그/시간: ${m.league} · ${fmtKstDateTime(m.startTime)}`);
  out.push(`상태: ${m.status}${m.homeScore != null ? ` (${m.homeScore}:${m.awayScore})` : ""}`);

  out.push("");
  out.push("[모델 예측]");
  out.push(
    `1X2 → 홈 ${pct(m.predHome)} / 무 ${pct(m.predDraw)} / 원정 ${pct(m.predAway)} · 픽: ${m.predWinner ?? "-"}`,
  );
  if (isSoccer && m.predDcPick) {
    out.push(`DC → ${m.predDcPick} (${pct(m.predDcProb)})`);
  }
  if (m.predOverPick) {
    out.push(`OVER/UNDER → ${m.predOverPick} (OVER ${pct(m.predOverProb)})`);
  }
  if (m.predHcPick) {
    out.push(`핸디캡 → ${m.predHcPick} ${m.predHcLine ?? ""} (${pct(m.predHcProb)})`);
  }
  if (isSoccer && m.predBttsPick) {
    out.push(`BTTS → ${m.predBttsPick} (YES ${pct(m.predBttsProb)})`);
  }

  if (m.marketHome != null) {
    out.push("");
    out.push("[시장 배당 (vig 제거 implied)]");
    out.push(
      `1X2 → H ${pct(m.marketHome)} / D ${pct(m.marketDraw)} / A ${pct(m.marketAway)} · 북메이커 ${m.marketBookmakers ?? 0}곳`,
    );
    if (m.isValueBet) {
      out.push(`💎 Value Bet — 모델이 시장 대비 ${(m.valueGap! * 100).toFixed(1)}%p 더 자신감.`);
    }
  }

  if (m.oddsHome != null) {
    const odds = [
      m.oddsHome && `홈 ${m.oddsHome.toFixed(2)}`,
      m.oddsDraw && `무 ${m.oddsDraw.toFixed(2)}`,
      m.oddsAway && `원정 ${m.oddsAway.toFixed(2)}`,
    ].filter(Boolean).join(" / ");
    if (odds) out.push(`표시 배당: ${odds}`);
  }

  if (m.apiPredWinner) {
    out.push("");
    out.push("[API-Football 자체 예측 (3rd opinion)]");
    out.push(
      `픽: ${m.apiPredWinner} · H ${pct(m.apiPredHome)} / D ${pct(m.apiPredDraw)} / A ${pct(m.apiPredAway)}`,
    );
    if (m.apiPredAdvice) out.push(`Advice: ${m.apiPredAdvice}`);
  }

  if (m.lineupHome || m.lineupAway) {
    out.push("");
    out.push("[라인업]");
    try {
      if (m.lineupHome) {
        const lh = JSON.parse(m.lineupHome);
        out.push(`홈 ${lh.formation ?? ""} / 감독 ${lh.coach?.name ?? "-"}`);
      }
      if (m.lineupAway) {
        const la = JSON.parse(m.lineupAway);
        out.push(`원정 ${la.formation ?? ""} / 감독 ${la.coach?.name ?? "-"}`);
      }
    } catch {
      // ignore JSON parse errors
    }
  }

  return out.join("\n");
}

async function searchArticles(query: string): Promise<string> {
  const q = query.trim();
  if (!q) return "검색어가 비어 있음.";
  const articles = await prisma.article.findMany({
    where: {
      status: "PUBLISHED",
      title: { contains: q, mode: "insensitive" },
    },
    orderBy: { publishedAt: "desc" },
    take: 5,
    select: { slug: true, title: true, type: true, league: true, publishedAt: true },
  });
  if (articles.length === 0) return `"${q}" 관련 게시 글 없음.`;
  return articles
    .map((a) => `- [${a.type}] ${a.title} (/articles/${a.slug})`)
    .join("\n");
}

// 예정 경기 중 모델 최고 확률이 높은 순으로 Strong Pick 후보 반환. "가장 신뢰도 높은 예측" 류 질문용.
async function getTopPicks(leagueRaw?: string): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
  const matches = await prisma.match.findMany({
    where: {
      ...(league ? { league } : {}),
      startTime: { gte: now, lt: horizon },
      predHome: { not: null },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 100,
  });
  if (matches.length === 0) return "예정 경기 중 예측이 있는 경기가 없습니다.";
  const ranked = matches
    .map((m) => {
      const top = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
      const pickName =
        m.predWinner === "HOME"
          ? toKoreanTeamName(m.homeTeam.name, m.league)
          : m.predWinner === "AWAY"
            ? toKoreanTeamName(m.awayTeam.name, m.league)
            : "무승부";
      return { m, top, strong: top >= strongPickThreshold(m.league), pickName };
    })
    .sort((a, b) => b.top - a.top)
    .slice(0, 6);
  return ranked
    .map(
      ({ m, top, strong, pickName }) =>
        `${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)} · 픽: ${pickName} ${pct(top)}${strong ? " (Strong Pick)" : ""} · ${matchUrl(m.league, m.externalId)}`,
    )
    .join("\n");
}

// ============================================================
// xG — fixtureStats(api-football) 실측 xG 기반. 축구 리그에만 데이터가 있다.
// ============================================================

/** xG 실측이 쌓여 있는 리그 (2026-07 기준 커버리지 확인 완료) */
const XG_LEAGUES = ["EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL"] as const;

interface TeamXg {
  /** 경기당 평균 기대 득점 (공격력) */
  xgFor: number;
  /** 경기당 평균 기대 실점 (수비 허용) */
  xgAgainst: number;
  /** 경기당 평균 실제 득점 — xgFor 와 비교하면 결정력 */
  goalsFor: number;
  games: number;
}

/**
 * 리그의 최근 종료 경기에서 팀별 평균 xG 를 낸다.
 * 팀마다 최근 lastN 경기만 반영 — 시즌 초반/이적 후 폼 변화를 덜 희석시키기 위함.
 */
async function teamXgAverages(league: string, lastN = 8): Promise<Map<number, TeamXg>> {
  const rows = await prisma.match.findMany({
    where: { league, status: "FINISHED", fixtureStats: { not: null } },
    select: {
      homeTeamId: true, awayTeamId: true, fixtureStats: true,
      homeScore: true, awayScore: true, startTime: true,
    },
    orderBy: { startTime: "desc" },
    take: 300,
  });
  const acc = new Map<number, { xf: number; xa: number; gf: number; n: number }>();
  const bump = (id: number, xf: number, xa: number, gf: number) => {
    const e = acc.get(id) ?? { xf: 0, xa: 0, gf: 0, n: 0 };
    if (e.n >= lastN) return; // 최신순 순회라 lastN 을 채우면 그 팀은 더 담지 않는다
    e.xf += xf; e.xa += xa; e.gf += gf; e.n++;
    acc.set(id, e);
  };
  for (const m of rows) {
    const { home, away } = parseFixtureXg(m.fixtureStats);
    if (home == null || away == null) continue;
    bump(m.homeTeamId, home, away, m.homeScore ?? 0);
    bump(m.awayTeamId, away, home, m.awayScore ?? 0);
  }
  const out = new Map<number, TeamXg>();
  for (const [id, e] of acc) {
    if (e.n < 3) continue; // 표본 3경기 미만은 신뢰할 수 없어 제외
    out.set(id, { xgFor: e.xf / e.n, xgAgainst: e.xa / e.n, goalsFor: e.gf / e.n, games: e.n });
  }
  return out;
}

// 예정 경기를 기대 총득점(양 팀 공격 xG + 상대 수비 허용 xG 의 평균) 높은 순으로.
async function getXgMatchups(leagueRaw?: string, days = 3): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  // 리그를 지정했는데 xG 미지원이면 조용히 전체 검색으로 넘어가지 않는다 —
  // "KBO xG 알려줘" 에 엉뚱한 MLS 경기를 답하는 사고를 막는다.
  if (leagueRaw && (!league || !(XG_LEAGUES as readonly string[]).includes(league))) {
    return `${leagueRaw} 는 xG 데이터가 없습니다. xG 는 축구 전용이며 지원 리그는 ${XG_LEAGUES.join(", ")} 입니다. 야구·농구·하키는 xG 대신 get_top_picks 나 get_match_prediction 을 쓸 것.`;
  }
  const targets = league ? [league] : [...XG_LEAGUES];
  const { start } = kstDayRange(0);
  const { end } = kstDayRange(days);

  const matches = await prisma.match.findMany({
    where: {
      league: { in: targets },
      startTime: { gte: start, lt: end },
      status: { in: ["SCHEDULED", "TIMED"] },
    },
    include: { homeTeam: true, awayTeam: true },
    orderBy: { startTime: "asc" },
    take: 60,
  });
  if (matches.length === 0) {
    return `향후 ${days}일 이내 ${league ?? "축구"} 예정 경기가 없습니다. (유럽 리그는 6~7월 오프시즌)`;
  }

  const xgByLeague = new Map<string, Map<number, TeamXg>>();
  for (const lg of new Set(matches.map((m) => m.league))) {
    xgByLeague.set(lg, await teamXgAverages(lg));
  }

  const scored = matches
    .map((m) => {
      const t = xgByLeague.get(m.league);
      const h = t?.get(m.homeTeamId);
      const a = t?.get(m.awayTeamId);
      if (!h || !a) return null;
      // 홈 기대득점 = (홈 공격력 + 원정 수비 허용) / 2 — 양쪽 관측을 동등 가중
      const expHome = (h.xgFor + a.xgAgainst) / 2;
      const expAway = (a.xgFor + h.xgAgainst) / 2;
      const o = xgOutcome(expHome, expAway);
      return { m, expHome, expAway, total: expHome + expAway, o, sample: Math.min(h.games, a.games) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((x, y) => y.total - x.total)
    .slice(0, 6);

  if (scored.length === 0) {
    return "예정 경기는 있으나 양 팀 xG 표본(각 3경기 이상)이 부족해 추정할 수 없습니다.";
  }

  const lines = scored.map(({ m, expHome, expAway, total, o, sample }) => {
    const hn = toKoreanTeamName(m.homeTeam.name, m.league);
    const an = toKoreanTeamName(m.awayTeam.name, m.league);
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${hn} vs ${an} · 기대 총득점 ${total.toFixed(2)} (${hn} ${expHome.toFixed(2)} / ${an} ${expAway.toFixed(2)}) · xG 승부확률 홈 ${pct(o.pHome)} / 무 ${pct(o.pDraw)} / 원정 ${pct(o.pAway)} · 표본 최근 ${sample}경기 · ${matchUrl(m.league, m.externalId)}`;
  });
  return [
    "기대 총득점 높은 순 (양 팀 최근 실측 xG 기반 추정, 모델 1X2 예측과는 별개 지표):",
    ...lines,
  ].join("\n");
}

// 팀 최근 xG 성적 — 기대 득점/실점 + 실제 득점과의 격차(결정력).
async function getTeamXg(teamRaw: string, leagueRaw?: string): Promise<string> {
  const q = teamRaw.trim();
  if (!q) return "팀 이름이 비어 있음.";
  const league = normalizeLeague(leagueRaw);
  const targets = league && (XG_LEAGUES as readonly string[]).includes(league) ? [league] : [...XG_LEAGUES];

  const candidates = await prisma.team.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true },
    take: 5,
  });
  if (candidates.length === 0) return `"${q}" 팀을 찾을 수 없습니다. 영문 팀명으로도 시도해 보세요.`;

  // 팀이 실제로 뛴 리그만 조회한다 — 7개 리그를 전부 훑으면 느리고,
  // 같은 팀이 리그컵(UCL)에도 있으면 리그 표기가 엉뚱하게 잡힌다.
  const played = await prisma.match.groupBy({
    by: ["league"],
    where: {
      status: "FINISHED",
      league: { in: targets },
      OR: candidates.flatMap((c) => [{ homeTeamId: c.id }, { awayTeamId: c.id }]),
    },
    _count: { _all: true },
    orderBy: { _count: { id: "desc" } },
  });
  const ids = new Set(candidates.map((c) => c.id));
  const nameById = new Map(candidates.map((c) => [c.id, c.name] as const));

  for (const p of played) {
    const lg = p.league;
    const table = await teamXgAverages(lg);
    const hit = [...ids].map((id) => [id, table.get(id)] as const).find(([, v]) => v);
    if (!hit?.[1]) continue;
    const [teamId, t] = hit as [number, TeamXg];
    const ko = toKoreanTeamName(nameById.get(teamId) ?? String(teamId), lg);
    const diff = t.goalsFor - t.xgFor;
    const verdict =
      diff >= 0.3 ? "기대보다 잘 넣는 중 (결정력 과대 달성 — 되돌아올 여지)"
      : diff <= -0.3 ? "기대보다 못 넣는 중 (결정력 과소 달성 — 반등 여지)"
      : "기대치와 실제 득점이 비슷 (안정적)";
    return [
      `${ko} — 최근 ${t.games}경기 xG 성적 (${lg})`,
      `경기당 기대 득점(xG) ${t.xgFor.toFixed(2)} · 기대 실점(피xG) ${t.xgAgainst.toFixed(2)} · xG 득실 ${(t.xgFor - t.xgAgainst >= 0 ? "+" : "")}${(t.xgFor - t.xgAgainst).toFixed(2)}`,
      `경기당 실제 득점 ${t.goalsFor.toFixed(2)} (xG 대비 ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}) → ${verdict}`,
    ].join("\n");
  }
  return `${candidates[0].name} 의 xG 표본이 부족합니다(최근 3경기 미만). xG 는 유럽 5대리그·MLS·UCL 만 수집합니다.`;
}

/**
 * 리그 순위표.
 * 소스 우선순위를 /standings 페이지와 똑같이 맞춘다 — 야구는 공식 표(TheSports),
 * 축구는 ts season standings, 둘 다 없을 때만 DB 매치 자체계산.
 * (자체계산을 먼저 쓰면 챗봇 답변이 사이트 순위표와 다른 숫자를 말하게 된다.)
 */
async function getStandings(leagueRaw?: string, top = 10): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  if (!league) return `지원하지 않는 리그입니다. 지원: ${ALLOWED_LEAGUES.join(", ")}.`;

  // NBA 는 ESPN↔TheSports 팀 id 충돌로 같은 팀이 두 행으로 나와 사이트도 순위표를 막아뒀다.
  // 챗봇만 오염된 순위를 답하면 안 되므로 동일하게 안내한다.
  if (league === "NBA") {
    return `NBA 순위 데이터는 현재 소스 정비 중이라 정확한 순위를 드릴 수 없습니다. 역대 챔피언·시즌 결산은 ${SITE_URL}/leagues/NBA?view=history 에서 확인할 수 있다고 안내할 것. 순위 수치를 추측해서 답하지 말 것.`;
  }

  const isSoccer = SOCCER_LEAGUES.has(league);
  type Row = {
    position: number; teamId: number; played: number;
    wins: number; draws: number; losses: number;
    goalsFor: number; goalsAgainst: number; points: number | null;
  };
  let rows: Row[] = [];
  let source = "";
  // 시즌 미개막이면 공식 표가 0경기 행만 준다 → "아스널 0경기 0승" 오답 방지용 가드
  const hasPlayed = (rs: Row[]) => rs.some((r) => r.played > 0);

  // 1) 야구(KBO·NPB) — 사이트와 동일한 공식 순위표
  if (league === "KBO" || league === "NPB") {
    const bb = await fetchBaseballTable(league).catch(() => []);
    rows = bb.map((r) => ({
      position: r.position, teamId: r.ourTeamId, played: r.played,
      wins: r.wins, draws: r.draws, losses: r.losses,
      goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: null,
    }));
    if (!hasPlayed(rows)) rows = [];
    if (rows.length > 0) {
      source = "공식 기록";
      // NPB 는 센트럴·퍼시픽 두 리그 표가 합쳐져 와 position 이 1,1,2,2… 로 겹친다.
      // 통합 순위는 공식에 없는 개념이라 승률순으로 나열하고 순번을 다시 매긴다.
      const dupPosition = new Set(rows.map((r) => r.position)).size < rows.length;
      if (dupPosition) {
        rows = rows
          .sort((a, b) => (b.wins / Math.max(1, b.played)) - (a.wins / Math.max(1, a.played)))
          .map((r, i) => ({ ...r, position: i + 1 }));
        source = "공식 기록 · 센트럴/퍼시픽 통합 승률순";
      }
    }
  }

  // 2) 축구 — ts season standings
  if (rows.length === 0 && isSoccer) {
    const ts = await fetchStandingsForLeague(league).catch(() => null);
    const flat = (ts?.tables ?? []).flatMap((t) => t.rows);
    rows = flat
      .filter((r) => r.ourTeamId != null)
      .map((r) => ({
        position: r.position, teamId: r.ourTeamId as number, played: r.total,
        wins: r.won, draws: r.draw, losses: r.loss,
        goalsFor: r.goals, goalsAgainst: r.goals_against, points: r.points,
      }))
      .sort((a, b) => a.position - b.position);
    if (!hasPlayed(rows)) rows = []; // 새 시즌 개막 전 빈 표 → 자체계산(직전 시즌)으로 폴백
    if (rows.length > 0) source = "공식 순위";
  }

  // 3) 폴백 — DB 종료 매치 자체계산 (NBA/NHL/MLB 등 공식 표가 없는 리그)
  if (rows.length === 0) {
    const seasonStart = currentSeasonStart(league);
    const all = await prisma.match.findMany({
      where: { league, status: "FINISHED" },
      select: {
        id: true, league: true, status: true, startTime: true,
        homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      },
    });
    let matches = seasonStart ? all.filter((m) => m.startTime >= seasonStart) : all;
    source = "스코어베이스 집계";
    if (seasonStart && matches.length < 10) {
      matches = all.filter((m) => m.startTime >= previousSeasonStart(seasonStart) && m.startTime < seasonStart);
      source = "스코어베이스 집계 · 직전 시즌";
    }
    if (matches.length === 0) return `${league} 순위를 낼 수 있는 종료 경기가 없습니다.`;
    rows = calcStandings(matches).rows.map((r) => ({
      position: r.position, teamId: r.teamId, played: r.played,
      wins: r.wins, draws: r.draws, losses: r.losses,
      goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, points: r.points,
    }));
  }

  rows = rows.slice(0, top);
  const teams = await prisma.team.findMany({
    where: { id: { in: rows.map((r) => r.teamId) } },
    select: { id: true, name: true },
  });
  const nameById = new Map(teams.map((t) => [t.id, t.name] as const));

  const lines = rows.map((r) => {
    const raw = nameById.get(r.teamId) ?? String(r.teamId);
    const ko = toKoreanTeamName(raw, league) ?? raw;
    // 무승부가 있는 종목(축구·KBO·NPB)만 무 표기 — MLB/NBA 는 무승부 자체가 없다
    const wdl = r.draws > 0 || isSoccer ? `${r.wins}승 ${r.draws}무 ${r.losses}패` : `${r.wins}승 ${r.losses}패`;
    const gd = `${r.goalsFor}-${r.goalsAgainst} (${r.goalsFor - r.goalsAgainst >= 0 ? "+" : ""}${r.goalsFor - r.goalsAgainst})`;
    // 승점은 축구만 — 야구·농구·하키는 calcStandings 가 축구식(승×3)으로 낸 값이라 의미가 없다
    return `${r.position}. ${ko} — ${r.played}경기 ${wdl} · 득실 ${gd}${isSoccer && r.points != null ? ` · 승점 ${r.points}` : ""}`;
  });
  return [
    `${league} 순위 (${source}):`,
    ...lines,
    `전체 순위표: ${SITE_URL}/standings/${league}`,
  ].join("\n");
}

// 모델 적중률 — predCorrect 등 사후 채점 필드 집계. 수치는 반드시 실측만 인용하게 한다.
async function getModelAccuracy(leagueRaw?: string): Promise<string> {
  const league = normalizeLeague(leagueRaw);
  const targets = league ? [league] : [...ALLOWED_LEAGUES];
  const rows = await prisma.match.findMany({
    where: { league: { in: targets }, predCorrect: { not: null } },
    select: { league: true, predCorrect: true, predOverCorrect: true, predHcCorrect: true },
  });
  if (rows.length === 0) return "아직 채점된 예측 표본이 없습니다.";

  const agg = new Map<string, { n: number; ok: number; ouN: number; ouOk: number; hcN: number; hcOk: number }>();
  for (const r of rows) {
    const e = agg.get(r.league) ?? { n: 0, ok: 0, ouN: 0, ouOk: 0, hcN: 0, hcOk: 0 };
    e.n++; if (r.predCorrect) e.ok++;
    if (r.predOverCorrect != null) { e.ouN++; if (r.predOverCorrect) e.ouOk++; }
    if (r.predHcCorrect != null) { e.hcN++; if (r.predHcCorrect) e.hcOk++; }
    agg.set(r.league, e);
  }
  const rate = (ok: number, n: number) => (n === 0 ? "-" : `${((ok / n) * 100).toFixed(1)}% (${n}경기)`);
  const lines = [...agg]
    .filter(([, v]) => v.n >= 20) // 표본 20경기 미만은 오해를 부르므로 노출하지 않는다
    .sort((a, b) => b[1].n - a[1].n)
    .map(([lg, v]) =>
      `${lg} — 1X2 ${rate(v.ok, v.n)}${v.ouN >= 20 ? ` · 오버언더 ${rate(v.ouOk, v.ouN)}` : ""}${v.hcN >= 20 ? ` · 핸디캡 ${rate(v.hcOk, v.hcN)}` : ""}`,
    );
  if (lines.length === 0) return "표본 20경기 이상인 리그가 아직 없습니다.";
  return [
    "실측 적중률 (경기 종료 후 자동 채점된 예측만 집계):",
    ...lines,
    `리그별 상세: ${SITE_URL}/predictions/accuracy`,
  ].join("\n");
}

// 사용자 문의(버그·광고·제휴·관리자 연락 등)를 운영자 텔레그램으로 전달. HTML 이스케이프.
async function forwardToAdmin(message: string, category = "문의"): Promise<string> {
  const s = message.trim();
  if (!s) return "전달할 내용이 비어 있어 전달하지 못함.";
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = [
    `📩 <b>챗봇 문의</b> (${esc(category)})`,
    "",
    `내용: ${esc(s)}`,
    `시각: ${fmtKstDateTime(new Date())}`,
  ]
    .filter(Boolean)
    .join("\n");
  await sendTelegram(text);
  return '운영자 텔레그램으로 전달 완료. 사용자에게 "관리자에게 전달해 드리겠습니다." 라고 답할 것.';
}

// 챗봇이 호출할 수 있는 DB 조회 도구. Claude tool use 형식.
//
// 새 tool 추가 절차: TOOL_DEFS 에 schema 추가 → execute 에 case 추가.
// 모든 응답은 모델이 그대로 인용할 수 있게 사람이 읽기 좋은 텍스트로 정리한다.

import type Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { sendTelegram } from "@/lib/notify/telegram";
import { toKoreanTeamName } from "@/lib/team-names";

const ALLOWED_LEAGUES = [
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1",
  "MLS", "UCL", "NBA", "NHL", "MLB",
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
    name: "report_bug",
    description:
      "사용자가 사이트 버그·오류·기능 문제(작동 안 함·에러·화면 깨짐 등)를 제보하면 이 도구로 운영자에게 전달한다. 단순 질문이나 예측 결과 불만이 아니라 실제 문제 제보일 때만 호출.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string", description: "제보 내용 요약 (무엇이 어떻게 문제인지)" },
        page: { type: "string", description: "문제가 난 페이지·경기 (사용자가 언급했으면)" },
      },
      required: ["summary"],
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
    case "report_bug":
      return await reportBug(
        String(input.summary ?? ""),
        input.page as string | undefined,
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
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)}${score} (${m.status}) · 모델픽: ${winner} (H ${pct(m.predHome)} / D ${pct(m.predDraw)} / A ${pct(m.predAway)})`;
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
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} vs ${toKoreanTeamName(m.awayTeam.name, m.league)} · 픽: ${winner}`;
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
    return `[#${m.id}] ${fmtKstDateTime(m.startTime)} · ${m.league} · ${toKoreanTeamName(m.homeTeam.name, m.league)} ${score} ${toKoreanTeamName(m.awayTeam.name, m.league)} · 모델 1X2: ${correct}`;
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

// 버그·오류 제보를 운영자 텔레그램으로 전달. sendTelegram(HTML) 재사용 — 사용자 입력은 이스케이프.
async function reportBug(summary: string, page?: string): Promise<string> {
  const s = summary.trim();
  if (!s) return "제보 내용이 비어 있어 전달하지 못함.";
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const text = [
    "🐛 <b>챗봇 버그 제보</b>",
    "",
    `내용: ${esc(s)}`,
    page ? `위치: ${esc(page)}` : "",
    `시각: ${fmtKstDateTime(new Date())}`,
  ]
    .filter(Boolean)
    .join("\n");
  await sendTelegram(text);
  return '운영자 텔레그램으로 전달 완료. 사용자에게 "관리자에게 전달해 드리겠습니다." 라고 답할 것.';
}

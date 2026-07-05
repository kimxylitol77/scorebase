// 오늘의 픽 스레드 — 매일 아침 매니저 계정으로 자동 발행되는 게시판 허브 글.
// r/sportsbook 데일리 스레드 모델(2026-07-05 커뮤니티 리서치): 경기 목록 + AI 픽 프리필 +
// 참여 안내. 회원·봇 픽 글이 흩어지지 않게 "매일 같은 시간, 같은 자리"의 복귀 지점을 만든다.

import "server-only";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { ARTICLE_LEAGUES } from "@/lib/sports/types";
import { LEAGUE_DISPLAY, ALL_LEAGUES } from "@/lib/sports/sport-leagues";
import { kstDayWindow, kstHHmm } from "@/lib/threads/kst";
import { ensureManager, botTeamName } from "@/lib/analysis/manager-bot";

const MAX_ROWS = 22; // 표가 너무 길면 스레드가 아니라 벽이 됨 — 주요 리그 우선 상한

interface ThreadRow {
  time: string;
  league: string;
  home: string;
  away: string;
  aiPick: string;
  odds: string;
}

async function todayRows(): Promise<{ rows: ThreadRow[]; total: number; byLeague: Map<string, number>; dateKey: string; label: string }> {
  const { start, end, dateKey, label } = kstDayWindow();
  const leagues = [...ARTICLE_LEAGUES, "UFC"] as string[];
  const priority = new Map(ALL_LEAGUES.map((lg, i) => [lg, i]));

  const matches = await prisma.match.findMany({
    where: {
      league: { in: leagues },
      startTime: { gte: start, lt: end },
      status: { in: ["SCHEDULED", "LIVE"] },
    },
    select: {
      id: true,
      league: true,
      startTime: true,
      predWinner: true,
      predHome: true,
      predDraw: true,
      predAway: true,
      oddsHome: true,
      oddsDraw: true,
      oddsAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
    orderBy: { startTime: "asc" },
    take: 200,
  });

  const byLeague = new Map<string, number>();
  for (const m of matches) byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);

  const sorted = [...matches].sort((a, b) => {
    const ap = priority.get(a.league) ?? 999;
    const bp = priority.get(b.league) ?? 999;
    if (ap !== bp) return ap - bp;
    return a.startTime.getTime() - b.startTime.getTime();
  });

  const rows = sorted.slice(0, MAX_ROWS).map((m) => {
    const home = botTeamName(toKoreanTeamName(m.homeTeam.name, m.league), m.league);
    const away = botTeamName(toKoreanTeamName(m.awayTeam.name, m.league), m.league);
    let aiPick = "-";
    if (m.predWinner && m.predHome != null && m.predAway != null) {
      const conf = Math.max(m.predHome, m.predDraw ?? 0, m.predAway);
      const side = m.predWinner === "HOME" ? home : m.predWinner === "AWAY" ? away : "무승부";
      aiPick = `${side} ${Math.round(conf * 100)}%`;
    }
    const odds =
      m.oddsHome != null && m.oddsAway != null
        ? [m.oddsHome, m.oddsDraw, m.oddsAway]
            .filter((v): v is number => v != null)
            .map((v) => v.toFixed(2))
            .join(" / ")
        : "-";
    return { time: kstHHmm(m.startTime), league: LEAGUE_DISPLAY[m.league] ?? m.league, home, away, aiPick, odds };
  });

  return { rows, total: matches.length, byLeague, dateKey, label };
}

function buildContent(rows: ThreadRow[], total: number, dateKey: string, label: string): string {
  const table = [
    "| 시간 | 리그 | 경기 | AI 픽 | 배당 |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.time} | ${r.league} | ${r.home} vs ${r.away} | ${r.aiPick} | ${r.odds} |`),
  ].join("\n");
  const more = total > rows.length ? `\n\n_이 외 ${total - rows.length}경기는 [라이브스코어](/scores)에서._` : "";
  return [
    `${label} 예정 경기와 AI 모델 픽 모음입니다. 오늘 끌리는 경기, 관전 포인트, 반대 픽 — 댓글로 편하게 남겨주세요.`,
    `![오늘의 경기](/api/og/daily?d=${dateKey})`,
    table + more,
    `정식 픽은 [글쓰기](/analysis/new)로 올리면 경기 종료 후 **시스템이 자동 채점**해 적중률에 기록됩니다. AI 픽을 이겨보세요.`,
    `---\n_AI 픽은 자체 모델 예측이며 참고용입니다. 베팅 결정과 책임은 본인에게 있습니다._`,
  ].join("\n\n");
}

/** 오늘의 픽 스레드 발행. 같은 날 중복 발행 방지. dry=true 면 생성 없이 미리보기 반환. */
export async function runDailyPickThread(dry = false): Promise<{
  created: boolean;
  reason?: string;
  title?: string;
  preview?: string;
}> {
  const { rows, total, byLeague, dateKey, label } = await todayRows();
  if (rows.length === 0) return { created: false, reason: "오늘 예정 경기 없음" };

  // 제목 — 경기 수 상위 리그 3개 요약. 예: "오늘의 픽 스레드 — 7월 5일 (토) MLB 15·KBO 5·월드컵 2"
  // 제목용 짧은 리그명 — 풀네임("NPB 일본프로야구")은 제목이 벽이 됨. 미등록은 표시명 첫 어절.
  const SHORT: Record<string, string> = {
    WORLD_CUP: "월드컵", CLUB_WORLD_CUP: "클럽월드컵", K_LEAGUE_1: "K리그1", K_LEAGUE_2: "K리그2",
    KBO: "KBO", NPB: "NPB", MLB: "MLB", NBA: "NBA", NHL: "NHL", WNBA: "WNBA", UFC: "UFC", LOL: "LCK",
  };
  const shortLabel = (lg: string) => SHORT[lg] ?? (LEAGUE_DISPLAY[lg] ?? lg).split(" ")[0];
  const topLeagues = [...byLeague.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([lg, n]) => `${shortLabel(lg)} ${n}`)
    .join("·");
  const title = `오늘의 픽 스레드 — ${label} ${topLeagues}`;

  const managerId = await ensureManager();

  // 같은 날 KST 중복 발행 방지 (cron 재시도·수동 실행 대비)
  const { start, end } = kstDayWindow(dateKey);
  const dup = await prisma.post.findFirst({
    where: {
      authorId: managerId,
      title: { startsWith: "오늘의 픽 스레드" },
      createdAt: { gte: start, lt: end },
    },
    select: { id: true },
  });
  if (dup) return { created: false, reason: `이미 발행됨 (post ${dup.id})` };

  const content = buildContent(rows, total, dateKey, label);
  if (dry) return { created: false, reason: "dry", title, preview: content };

  await prisma.post.create({
    data: { authorId: managerId, title, content, category: "ANALYSIS" },
  });
  return { created: true, title };
}

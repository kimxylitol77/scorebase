// 승부예측 투표 카드 (서버) — 매치 조회 + 분포/내 픽/AI 픽 로드 후 클라 버튼 위임.
// 매치 상세·프리뷰 어디든 <MatchVoteCard matchId={id} /> 한 줄로 삽입.
import { prisma } from "@/lib/db";
import { getCurrentUserId } from "@/lib/current-user";
import { toKoreanTeamName } from "@/lib/team-names";
import MatchVoteButtons from "./MatchVoteButtons";

// 무승부가 실제로 존재하는 리그 (승부 종목은 홈/원정 2버튼)
const DRAW_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
  "WORLD_CUP", "CLUB_WORLD_CUP", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE",
  "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SAUDI_PL", "BRASILEIRAO",
  "LIGA_MX", "CSL", "A_LEAGUE", "KBO", "NPB",
]);

export default async function MatchVoteCard({ matchId }: { matchId: number }) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, league: true, status: true, startTime: true,
      homeScore: true, awayScore: true,
      predHome: true, predDraw: true, predAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!match) return null;

  const userId = await getCurrentUserId();
  const [rows, mine] = await Promise.all([
    prisma.matchVote.groupBy({ by: ["pick"], where: { matchId }, _count: { _all: true } }),
    userId
      ? prisma.matchVote.findUnique({ where: { matchId_userId: { matchId, userId } }, select: { pick: true } })
      : Promise.resolve(null),
  ]);
  const dist: Record<string, number> = { home: 0, draw: 0, away: 0 };
  for (const r of rows) dist[r.pick] = r._count._all;

  // AI 픽 — 저장된 1X2 확률 최대값 (없으면 비교 섹션 생략)
  let aiPick: string | null = null;
  let aiProb: number | null = null;
  if (match.predHome != null && match.predAway != null) {
    const cands: [string, number][] = [
      ["home", match.predHome],
      ["away", match.predAway],
      ...(match.predDraw != null ? ([["draw", match.predDraw]] as [string, number][]) : []),
    ];
    cands.sort((a, b) => b[1] - a[1]);
    aiPick = cands[0][0];
    aiProb = cands[0][1];
  }

  // 종료 매치 실제 결과 (적중 표시용)
  let result: string | null = null;
  if (match.status === "FINISHED" && match.homeScore != null && match.awayScore != null) {
    result = match.homeScore > match.awayScore ? "home" : match.homeScore < match.awayScore ? "away" : "draw";
  }

  const closed = match.status !== "SCHEDULED" || match.startTime.getTime() <= Date.now();
  const lg = match.league ?? "";
  const homeName = toKoreanTeamName(match.homeTeam.name, lg) || match.homeTeam.name;
  const awayName = toKoreanTeamName(match.awayTeam.name, lg) || match.awayTeam.name;

  // 마감됐고 표본도 없으면 아예 렌더 생략 (과거 경기 잡음 방지)
  const total = dist.home + dist.draw + dist.away;
  if (closed && total === 0) return null;

  return (
    <section className="rounded-2xl border border-neutral-200/80 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">승부예측</h2>
        <a href="/picks" className="text-[11px] text-rose-600 hover:underline dark:text-rose-400">
          내 적중률·랭킹 →
        </a>
      </div>
      <MatchVoteButtons
        matchId={match.id}
        homeName={homeName}
        awayName={awayName}
        hasDraw={DRAW_LEAGUES.has(lg)}
        closed={closed}
        dist={dist}
        myPick={mine?.pick ?? null}
        loggedIn={!!userId}
        aiPick={aiPick}
        aiProb={aiProb}
        result={result}
      />
    </section>
  );
}

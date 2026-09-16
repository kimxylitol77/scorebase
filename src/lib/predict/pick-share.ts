// /picks "게시판에 올리기" 프리필 — 회원이 그 경기에 투표한 승부예측(시장별 픽·픽 시점 배당)과 AI 픽을 DB 에서 다시 읽어 글로 만든다.
// 수치는 전부 서버 재조회라 링크를 조작해도 남의 픽·가짜 수치가 들어가지 않는다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { MARKET_LABEL, VOTE_MARKETS, aiPickOf, pickLabel, type VoteMarket } from "@/lib/vote-markets";

const kst = (d: Date) => {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const day = ["일", "월", "화", "수", "목", "금", "토"][k.getUTCDay()];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${day}) ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
};

export async function buildPickShareText(matchId: number, userId: string): Promise<{ title: string; content: string } | null> {
  const [match, votes] = await Promise.all([
    prisma.match.findUnique({
      where: { id: matchId },
      select: {
        id: true, league: true, startTime: true, status: true,
        predHome: true, predDraw: true, predAway: true, predHcPick: true, predHcProb: true, predOverPick: true, predOverProb: true,
        homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } },
      },
    }),
    prisma.matchVote.findMany({ where: { matchId, userId }, select: { market: true, pick: true, line: true, pickOdds: true } }),
  ]);
  if (!match || votes.length === 0) return null;
  const home = toKoreanTeamName(match.homeTeam.name, match.league) || match.homeTeam.name;
  const away = toKoreanTeamName(match.awayTeam.name, match.league) || match.awayTeam.name;
  const byMarket = new Map(votes.map((v) => [v.market as VoteMarket, v]));
  const rows: string[] = [];
  const summary: string[] = [];
  for (const mk of VOTE_MARKETS) {
    const v = byMarket.get(mk);
    if (!v) continue;
    const mine = pickLabel(mk, v.pick, home, away, v.line);
    const ai = aiPickOf(mk, match);
    const aiText = ai ? `${pickLabel(mk, ai.pick, home, away, v.line)} ${Math.round(ai.prob * 100)}%` : "—";
    rows.push(`| ${MARKET_LABEL[mk]} | **${mine}** | ${v.pickOdds != null ? v.pickOdds.toFixed(2) : "—"} | ${aiText} |`);
    summary.push(`${MARKET_LABEL[mk]} ${mine}`);
  }
  const league = LEAGUE_DISPLAY[match.league] ?? match.league;
  const content = [
    `**${league} · ${home} vs ${away}** — ${kst(match.startTime)} KST`,
    "",
    `[승부예측](/picks)에서 제가 고른 픽입니다. 경기 종료 후 적중 여부가 자동 채점됩니다.`,
    "",
    "| 시장 | 내 픽 | 픽 시점 배당 | AI 픽 |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "이유는 아래에 적어 주세요.",
    "",
    "",
    "통계 모델 기반 참고용 정보이며 베팅을 권유하지 않습니다.",
    `경기 보기 → https://www.scorebase.kr/live/${match.league.toLowerCase()}/${match.id}`,
  ].join("\n");
  return { title: `[승부예측] ${home} vs ${away} — ${summary.join(" · ")}`.slice(0, 90), content };
}

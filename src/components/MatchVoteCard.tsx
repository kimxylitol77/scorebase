// 승부예측 투표 카드 (서버) — 매치 조회 + 시장별(승부·핸디캡·오버언더) 분포/AI 픽 로드 후 클라 버튼 위임.
// 매치 상세·프리뷰 어디든 <MatchVoteCard matchId={id} /> 한 줄로 삽입.
//
// ⚠️ 여기서 cookies()(getCurrentUserId)를 읽으면 이 카드를 쓰는 페이지가 통째로 동적
// 강등돼 ISR 이 죽는다 — /articles/[slug] 가 그래서 매 요청 렌더됐다(2026-08-01 실측).
// "내 픽"은 개인화라 캐시에 담기면 안 되기도 해서, 클라이언트가 GET /api/vote 로 따로 받는다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { aiPickOf, resolveLines, resultPick, type VoteMarket } from "@/lib/vote-markets";
import MatchVoteButtons, { type MarketInit } from "./MatchVoteButtons";

// 무승부가 실제로 존재하는 리그 (승부 종목은 홈/원정 2버튼)
const DRAW_LEAGUES = new Set([
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL", "UECL",
  "WORLD_CUP", "CLUB_WORLD_CUP", "K_LEAGUE_1", "K_LEAGUE_2", "J1_LEAGUE", "J2_LEAGUE",
  "CHAMPIONSHIP", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "SAUDI_PL", "BRASILEIRAO",
  "LIGA_MX", "CSL", "A_LEAGUE", "KBO", "NPB",
]);

export const VOTE_MATCH_SELECT = {
  id: true, league: true, status: true, startTime: true,
  homeScore: true, awayScore: true,
  predHome: true, predDraw: true, predAway: true,
  predHcLine: true, predHcPick: true, predHcProb: true,
  predOverPick: true, predOverProb: true,
  oddsHcLine: true, oddsTotalLine: true,
  homeTeam: { select: { name: true } },
  awayTeam: { select: { name: true } },
} as const;

type VoteMatch = {
  id: number; league: string; status: string; startTime: Date;
  homeScore: number | null; awayScore: number | null;
  predHome: number | null; predDraw: number | null; predAway: number | null;
  predHcLine: number | null; predHcPick: string | null; predHcProb: number | null;
  predOverPick: string | null; predOverProb: number | null;
  oddsHcLine: number | null; oddsTotalLine: number | null;
};

/**
 * 시장별 초기 상태 조립 — 카드와 /picks 가 공유. dist 는 호출부가 (market → pick → n) 로 넘긴다.
 * 라인 없는 시장은 빼서(1X2 만) 탭이 안 뜬다.
 */
export function buildVoteMarkets(
  m: VoteMatch,
  dists: Partial<Record<VoteMarket, Record<string, number>>>,
  myPicks?: Partial<Record<VoteMarket, string | null>>,
): Partial<Record<VoteMarket, MarketInit>> {
  const lines = resolveLines(m);
  const finished = m.status === "FINISHED" && m.homeScore != null && m.awayScore != null;
  const build = (mk: VoteMarket, line: number | null): MarketInit => {
    const ai = aiPickOf(mk, m);
    const empty: Record<string, number> = mk === "OU" ? { over: 0, under: 0 } : { home: 0, draw: 0, away: 0 };
    return {
      line,
      dist: { ...empty, ...(dists[mk] ?? {}) },
      ...(myPicks ? { myPick: myPicks[mk] ?? null } : {}),
      aiPick: ai?.pick ?? null,
      aiProb: ai?.prob ?? null,
      result: finished ? resultPick(mk, line, m.homeScore!, m.awayScore!) : null,
    };
  };
  const out: Partial<Record<VoteMarket, MarketInit>> = { "1X2": build("1X2", null) };
  if (lines.HANDICAP != null) out.HANDICAP = build("HANDICAP", lines.HANDICAP);
  if (lines.OU != null) out.OU = build("OU", lines.OU);
  return out;
}

/** (matchId, market, pick) 분포 집계 → matchId → market → pick → n */
export async function loadVoteDists(matchIds: number[]): Promise<Map<number, Partial<Record<VoteMarket, Record<string, number>>>>> {
  const out = new Map<number, Partial<Record<VoteMarket, Record<string, number>>>>();
  if (matchIds.length === 0) return out;
  const rows = await prisma.matchVote.groupBy({
    by: ["matchId", "market", "pick"],
    where: { matchId: { in: matchIds } },
    _count: { _all: true },
  });
  for (const r of rows) {
    const byMarket = out.get(r.matchId) ?? {};
    const mk = r.market as VoteMarket;
    const d = byMarket[mk] ?? {};
    d[r.pick] = r._count._all;
    byMarket[mk] = d;
    out.set(r.matchId, byMarket);
  }
  return out;
}

export default async function MatchVoteCard({ matchId }: { matchId: number }) {
  const match = await prisma.match.findUnique({ where: { id: matchId }, select: VOTE_MATCH_SELECT });
  if (!match) return null;

  // 분포는 개인화가 아니라 캐시에 담아도 된다. 투표한 본인은 POST 응답의 dist 로 즉시 갱신되고,
  // 남의 표는 revalidate 주기만큼 늦게 반영된다.
  const dists = (await loadVoteDists([matchId])).get(matchId) ?? {};
  const markets = buildVoteMarkets(match, dists);

  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const closed = match.status !== "SCHEDULED" || match.startTime.getTime() <= Date.now();
  const lg = match.league ?? "";
  const homeName = toKoreanTeamName(match.homeTeam.name, lg) || match.homeTeam.name;
  const awayName = toKoreanTeamName(match.awayTeam.name, lg) || match.awayTeam.name;

  // 마감됐고 표본도 없으면 아예 렌더 생략 (과거 경기 잡음 방지)
  const total = Object.values(dists).reduce((s, d) => s + Object.values(d).reduce((a, n) => a + n, 0), 0);
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
        markets={markets}
      />
    </section>
  );
}

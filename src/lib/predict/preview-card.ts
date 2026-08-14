// SNS 공유용 프리뷰 카드의 수치 3개를 뽑는다 — 모바일 세로 소비 포맷(/api/og/preview-card).
//
// 왜 "적응형"인가:
//   원안은 홈 승률·최근 H2H·Strong Pick 세 개를 고정으로 요구했다. 2026-08-13 실측 결과
//   향후 24시간 예정 144경기 중 예측이 계산된 건 20건(14%)이고, 그중 Strong Pick 성립 4건,
//   H2H 3경기 이상 11건, 셋 다 충족은 3건뿐이었다(전부 NPB). 고정 요구로는 하루 3장도 못 만든다.
//   (예측이 적은 건 버그가 아니라 pick-readiness 게이트 — 야구는 선발 확정 전, 축구는 D-1
//    이전이면 일부러 미룬다. 근거 없는 픽을 미리 내지 않는 설계라 이건 유지가 맞다.)
//
//   그래서 1번 칸(승률)만 필수로 두고, 나머지 2칸은 있는 것부터 채운다:
//     H2H → 최근 폼 → 배당 → 리그 순위차
//   이렇게 하면 예측 보유 20건을 전부 카드로 만들 수 있다.
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { strongPickThreshold } from "./strong-pick";

export interface PreviewStat {
  /** 칸 제목 — 8자 이내 */
  label: string;
  /** 큰 숫자 (예: "62%" · "4승 1무 3패") */
  value: string;
  /** 한 줄 설명 — 카드 폭에 맞춰 28자 이내 */
  note: string;
  /** 강조 여부 — Strong Pick 등 */
  hot?: boolean;
}

export interface PreviewCard {
  matchId: number;
  league: string;
  leagueLabel: string;
  home: string;
  away: string;
  kickoffKst: string;
  /** 정확히 3칸. 1번은 항상 승률. */
  stats: PreviewStat[];
  /** 하단 한 줄 — 픽이 있으면 픽, 없으면 안내 */
  verdict: string;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** 승/무/패 표기 — 무승부 없는 종목은 무를 뺀다. */
const wdl = (w: number, d: number, l: number) =>
  d > 0 ? `${w}승 ${d}무 ${l}패` : `${w}승 ${l}패`;

/**
 * 카드 1장에 들어갈 데이터를 만든다. 예측이 없으면 null (카드를 만들지 않는다).
 * 빈 칸으로 나가느니 안 만드는 게 낫다.
 */
export async function buildPreviewCard(matchId: number): Promise<PreviewCard | null> {
  const m = await prisma.match.findUnique({
    where: { id: matchId },
    select: {
      id: true, league: true, startTime: true, status: true,
      homeTeamId: true, awayTeamId: true,
      predHome: true, predDraw: true, predAway: true, predWinner: true,
      oddsHome: true, oddsDraw: true, oddsAway: true,
      homeTeam: { select: { name: true } },
      awayTeam: { select: { name: true } },
    },
  });
  if (!m || m.predHome == null || m.predAway == null) return null;

  const home = toKoreanTeamName(m.homeTeam.name, m.league);
  const away = toKoreanTeamName(m.awayTeam.name, m.league);
  const draw = m.predDraw ?? 0;
  const maxP = Math.max(m.predHome, draw, m.predAway);
  const isStrong = maxP >= strongPickThreshold(m.league);
  const favorite = m.predHome >= m.predAway ? home : away;

  const stats: PreviewStat[] = [];

  // ── 1칸 (필수) — 승률
  // 무승부가 있는 종목은 note 에 같이 적는다. 안 적으면 홈 47% · 원정 27% 처럼
  // 합이 100 이 안 되는 숫자만 보여 카드가 틀린 것처럼 읽힌다.
  stats.push({
    label: "AI 승률",
    value: pct(m.predHome),
    note:
      draw > 0.001
        ? `${home} 기준 · 무 ${pct(draw)} · ${away} ${pct(m.predAway)}`
        : `${home} 기준 · ${away} ${pct(m.predAway)}`,
  });

  // ── 후보들을 만들어 두고 있는 것부터 2칸 채운다
  const now = new Date();

  // 후보 A — 상대 전적 (과거 맞대결 3경기 이상일 때만)
  const h2h = await prisma.match.findMany({
    where: {
      status: "FINISHED",
      startTime: { lt: now },
      OR: [
        { homeTeamId: m.homeTeamId, awayTeamId: m.awayTeamId },
        { homeTeamId: m.awayTeamId, awayTeamId: m.homeTeamId },
      ],
    },
    select: { homeTeamId: true, homeScore: true, awayScore: true, startTime: true },
    orderBy: { startTime: "desc" },
    take: 10,
  });
  if (h2h.length >= 3) {
    let w = 0, d = 0, l = 0;
    for (const g of h2h) {
      if (g.homeScore == null || g.awayScore == null) continue;
      const homeIsOurHome = g.homeTeamId === m.homeTeamId;
      const ourScore = homeIsOurHome ? g.homeScore : g.awayScore;
      const theirScore = homeIsOurHome ? g.awayScore : g.homeScore;
      if (ourScore > theirScore) w++;
      else if (ourScore < theirScore) l++;
      else d++;
    }
    if (w + d + l >= 3) {
      stats.push({
        label: "최근 맞대결",
        value: wdl(w, d, l),
        note: `${home} 기준 최근 ${w + d + l}경기`,
      });
    }
  }

  // 후보 B — 최근 폼 (각 팀 최근 5경기 승수)
  if (stats.length < 3) {
    const recentWins = async (teamId: number) => {
      const gs = await prisma.match.findMany({
        where: {
          status: "FINISHED", startTime: { lt: now },
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
        select: { homeTeamId: true, homeScore: true, awayScore: true },
        orderBy: { startTime: "desc" },
        take: 5,
      });
      let w = 0, n = 0;
      for (const g of gs) {
        if (g.homeScore == null || g.awayScore == null) continue;
        n++;
        const isHome = g.homeTeamId === teamId;
        const a = isHome ? g.homeScore : g.awayScore;
        const b = isHome ? g.awayScore : g.homeScore;
        if (a > b) w++;
      }
      return { w, n };
    };
    const [hf, af] = await Promise.all([recentWins(m.homeTeamId), recentWins(m.awayTeamId)]);
    if (hf.n >= 3 && af.n >= 3) {
      stats.push({
        label: "최근 폼",
        value: `${hf.w}승 vs ${af.w}승`,
        note: `최근 ${Math.min(hf.n, af.n)}경기 · ${home} vs ${away}`,
      });
    }
  }

  // 후보 C — 배당
  if (stats.length < 3 && m.oddsHome != null && m.oddsAway != null) {
    stats.push({
      label: "시장 배당",
      value: `${m.oddsHome.toFixed(2)} / ${m.oddsAway.toFixed(2)}`,
      note: m.oddsDraw != null ? `홈 / 원정 · 무 ${m.oddsDraw.toFixed(2)}` : "홈 / 원정",
    });
  }

  // 후보 D — Strong Pick (임계를 넘었을 때만. 넘으면 우선순위를 올려 2번 칸에 꽂는다)
  // 값은 확률을 다시 쓰지 않는다 — 1번 칸과 같은 숫자가 두 번 나오면 정보가 없다.
  // 대신 "임계를 얼마나 여유 있게 넘었나"를 보여준다.
  if (isStrong) {
    const th = strongPickThreshold(m.league);
    const marginPp = Math.round((maxP - th) * 100);
    stats.splice(1, 0, {
      label: "Strong Pick",
      value: favorite,
      note: `리그 임계 ${pct(th)} 를 ${marginPp}%p 여유로 통과`,
      hot: true,
    });
  }

  // 3칸을 못 채우면 남는 칸은 버린다(빈 칸 노출 금지). 넘치면 앞 3개만.
  const finalStats = stats.slice(0, 3);
  if (finalStats.length < 2) return null; // 승률 하나만 있는 카드는 내보내지 않는다

  const kickoffKst = new Date(m.startTime.getTime() + 9 * 3600_000)
    .toISOString()
    .slice(5, 16)
    .replace("T", " ")
    .replace("-", "/");

  const verdict = isStrong
    ? `AI 는 ${favorite} 우세로 봅니다`
    : m.predWinner
      ? `AI 픽 ${m.predWinner === "HOME" ? home : m.predWinner === "AWAY" ? away : "무승부"}`
      : "접전 — AI 도 한쪽을 고르지 못했습니다";

  return {
    matchId: m.id,
    league: m.league,
    leagueLabel: m.league,
    home,
    away,
    kickoffKst,
    stats: finalStats,
    verdict,
  };
}

/**
 * 오늘 카드로 낼 경기 하나를 고른다 — 예측이 있는 예정 경기 중 가장 임박한 것.
 * Strong Pick 이 있으면 그쪽을 우선한다(카드가 더 세다).
 */
export async function pickCardMatch(hours = 24): Promise<number | null> {
  const now = new Date();
  const ms = await prisma.match.findMany({
    where: {
      status: "SCHEDULED",
      startTime: { gte: now, lte: new Date(now.getTime() + hours * 36e5) },
      predHome: { not: null },
    },
    select: { id: true, league: true, startTime: true, predHome: true, predDraw: true, predAway: true },
    orderBy: { startTime: "asc" },
  });
  if (ms.length === 0) return null;
  const strong = ms.find((m) => {
    const maxP = Math.max(m.predHome ?? 0, m.predDraw ?? 0, m.predAway ?? 0);
    return maxP >= strongPickThreshold(m.league);
  });
  return (strong ?? ms[0]).id;
}

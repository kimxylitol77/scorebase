// PREVIEW 글의 예상 라인업 블록 — 라이브 상세와 똑같은 피치(SoccerNowBlock → SoccerLineupSvg)를
// 경기 전 글에도 그대로 노출한다.
//
// 왜. 프리뷰는 확정 라인업(킥오프 ~1시간 전 도착)만 참조해 사실상 라인업이 한 번도 안 들어갔다.
// 예상 XI 는 팀 단위 산출(최근 확정 XI 가중)이라 경기 날짜와 무관하게 쓸 수 있어, 3일 전 글에도
// 근거 있는 라인업을 실을 수 있다 (2026-08-17 사용자 요청, 대상 경기 양팀 보유율 100% 실측).
//
// 조립 순서는 /live/[league]/[gameId] 의 클럽 리그 분기와 같다 — 화면이 같아야 하므로 규칙도 같다.
// 부상 스냅샷 teamId 가 전부 null(수집기 미채움)이라 팀 결합은 teamName 정규화 매칭이 유일 경로.
import { prisma } from "@/lib/db";
import SoccerNowBlock, { type InjuryLine, type PredictedXiTeam } from "@/components/scores/soccer/SoccerNowBlock";
import { CLUB_XI_LEAGUES, teamNameMatches } from "@/lib/predict/club-xi-leagues";
import { getClubXiByLeague } from "@/lib/predict/club-xi-cache";
import { translateReason, classifySeverity } from "@/lib/sports/injury-format";

export default async function PreviewPredictedLineup({
  league,
  homeTeamId,
  awayTeamId,
  homeName,
  awayName,
  homeNameKo,
  awayNameKo,
}: {
  league: string;
  homeTeamId: number;
  awayTeamId: number;
  /** 부상 스냅샷 결합용 원문 팀명 (한글명 아님) */
  homeName: string;
  awayName: string;
  homeNameKo: string;
  awayNameKo: string;
}) {
  if (!CLUB_XI_LEAGUES.has(league)) return null;

  const byTeamId = (await getClubXiByLeague(league).catch(() => ({}))) as Record<string, PredictedXiTeam>;
  const predictedHome = byTeamId[String(homeTeamId)] ?? null;
  const predictedAway = byTeamId[String(awayTeamId)] ?? null;
  if (!predictedHome && !predictedAway) return null;

  // 부상·결장 — InjurySnapshot(일별 af 수집분)만 사용. 렌더 타임 af 직접 호출은 쿼터 전소
  // 전례(/live extras 사고)가 있어 금지. 3일 내 스냅샷 없으면 명단 없이 라인업만 낸다.
  let injuredXiIds: string[] | undefined;
  let injuriesHome: InjuryLine[] | undefined;
  let injuriesAway: InjuryLine[] | undefined;
  try {
    const latest = await prisma.injurySnapshot.findFirst({
      where: { league, capturedAt: { gte: new Date(Date.now() - 3 * 86400e3) } },
      orderBy: { capturedAt: "desc" },
      select: { capturedOn: true },
    });
    if (latest) {
      const snaps = await prisma.injurySnapshot.findMany({
        where: { league, capturedOn: latest.capturedOn },
        select: { teamName: true, playerTsId: true, playerName: true, reason: true },
      });
      // XI 매칭 — playerTsId 정확 매칭 1순위, 없으면 성+이니셜 (af "A. Gonzalez" 축약 대응)
      const nameKey = (s: string) => {
        const tokens = s.trim().split(/\s+/);
        const n = (x: string) =>
          x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s.&·'-]/g, "");
        return `${n(tokens[tokens.length - 1] ?? "")}|${n(tokens[0] ?? "")[0] ?? ""}`;
      };
      const injuredIds: string[] = [];
      const toLines = (teamName: string, xi: PredictedXiTeam["xi"]): InjuryLine[] =>
        snaps
          .filter((s) => teamNameMatches(s.teamName, teamName))
          .slice(0, 12)
          .map((s) => {
            const hit =
              (s.playerTsId && xi.find((p) => p.id === s.playerTsId)) ||
              xi.find((p) => nameKey(p.name) === nameKey(s.playerName));
            if (hit?.id) injuredIds.push(hit.id);
            return {
              name: hit?.nameKo || hit?.name || s.playerName,
              reason: translateReason(s.reason ?? ""),
              sev: classifySeverity(s.reason ?? ""),
              inXi: !!hit,
            };
          })
          .sort((a, b) => {
            if (a.inXi !== b.inXi) return a.inXi ? -1 : 1;
            const rank = { long: 0, short: 1, returning: 2, non_injury: 3, unknown: 4 } as const;
            return rank[a.sev] - rank[b.sev];
          });
      injuriesHome = toLines(homeName, predictedHome?.xi ?? []);
      injuriesAway = toLines(awayName, predictedAway?.xi ?? []);
      injuredXiIds = injuredIds;
    }
  } catch {
    // 부상 조회 실패 — 명단 없이 예상 라인업만 표시
  }

  return (
    <section className="my-6">
      <h2 className="mb-3 text-lg font-semibold break-keep">예상 선발 라인업</h2>
      <SoccerNowBlock
        status="SCHEDULED"
        homeNameKo={homeNameKo}
        awayNameKo={awayNameKo}
        lineup={null}
        predictedHome={predictedHome}
        predictedAway={predictedAway}
        injuredXiIds={injuredXiIds}
        injuriesHome={injuriesHome}
        injuriesAway={injuriesAway}
      />
    </section>
  );
}

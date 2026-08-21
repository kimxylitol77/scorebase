// PREVIEW 글의 예상 라인업 블록 — 라이브 상세와 똑같은 피치(SoccerNowBlock → SoccerLineupSvg)를
// 경기 전 글에도 그대로 노출한다.
//
// 왜. 프리뷰는 확정 라인업(킥오프 ~1시간 전 도착)만 참조해 사실상 라인업이 한 번도 안 들어갔다.
// 예상 XI 는 팀 단위 산출(최근 확정 XI 가중)이라 경기 날짜와 무관하게 쓸 수 있어, 3일 전 글에도
// 근거 있는 라인업을 실을 수 있다 (2026-08-17 사용자 요청, 대상 경기 양팀 보유율 100% 실측).
//
// 조립 순서는 /live/[league]/[gameId] 의 클럽 리그 분기와 같다 — 화면이 같아야 하므로 규칙도 같다.
// 부상·결장 명단은 buildInjuryLines 가 단일 출처(=/injuries 와 같은 소스·이름 해석기).
import SoccerNowBlock, { type PredictedXiTeam } from "@/components/scores/soccer/SoccerNowBlock";
import { CLUB_XI_LEAGUES } from "@/lib/predict/club-xi-leagues";
import { getClubXiByLeague } from "@/lib/predict/club-xi-cache";
import { buildInjuryLines } from "@/lib/predict/injury-lines";

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

  // 부상·결장 — /injuries 페이지와 같은 소스·같은 이름 해석기를 쓴다(injury-lines).
  //  예전에는 여기서 af 스냅샷만 직접 읽어 /injuries 와 명단이 다르고 이름도 영문 축약형이었다.
  const { injuriesHome, injuriesAway, injuredXiIds } = await buildInjuryLines(
    league,
    { teamId: homeTeamId, teamName: homeName, xi: predictedHome?.xi ?? [] },
    { teamId: awayTeamId, teamName: awayName, xi: predictedAway?.xi ?? [] },
  );

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

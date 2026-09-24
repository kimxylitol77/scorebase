// 걸프컵 허브 — 빅매치 허브 공용 부품(hub/)에 걸프컵 조별리그 데이터를 채운다.
// af·ts 모두 순위표가 없어 종료 경기로 직접 계산한다(lib/sports/gulf-cup). 조 이름도 데이터에 없어
// 개최국 사우디가 속한 조를 A조로 붙인다(공식 추첨: A조 사우디·이라크·오만·쿠웨이트).
import { prisma } from "@/lib/db";
import { parseRound } from "@/lib/sports/fixture-rounds";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { GULF_HOST, GULF_MATCHDAYS, computeGroupTable, groupTeams, gulfZones, type GulfResult } from "@/lib/sports/gulf-cup";
import { kstKickoff, pickSpotlight, sameRoundOthers } from "@/lib/sports/tournament-hub";
import SpotlightSection from "../hub/SpotlightSection";
import GroupSegments from "../hub/GroupSegments";
import { HubEmpty, HubHeading } from "../hub/HubParts";
import type { HubGroupView, HubMatch, HubTeam } from "../hub/types";

const LEAGUE = "GULF_CUP";
type GulfHubMatch = HubMatch & { homeId: number; awayId: number; letter: string };

function koName(en: string): string {
  return toKoreanTeamName(en, LEAGUE) || en;
}
function team(t: { name: string; logoUrl: string | null }): HubTeam {
  return { name: koName(t.name), flag: fifaFlag(t.name), logoUrl: t.logoUrl, rank: getFifaRank(t.name) };
}

export default async function GulfCupHub() {
  const raw = await prisma.match.findMany({
    where: { league: LEAGUE },
    orderBy: { startTime: "asc" },
    select: {
      id: true, externalId: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true,
      homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { name: true, logoUrl: true } },
      awayTeam: { select: { name: true, logoUrl: true } },
    },
  });
  // 조별리그 경기만 — af round "Group Stage - N". 4강·결승(라운드 번호 없음)은 여기서 빠진다.
  const groupStage = raw.filter((m) => /Group Stage/i.test(m.raw ?? "") && parseRound(m.raw) != null);
  if (groupStage.length === 0) return <HubEmpty />;

  const enName = new Map<number, string>();
  for (const m of groupStage) {
    enName.set(m.homeTeamId, m.homeTeam.name);
    enName.set(m.awayTeamId, m.awayTeam.name);
  }
  const letterOf = new Map<number, string>();
  const groups = groupTeams(groupStage.map((m) => [m.homeTeamId, m.awayTeamId]))
    .map((ids) => ({ ids, letter: ids.some((id) => enName.get(id) === GULF_HOST) ? "A" : "B" }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
  for (const g of groups) for (const id of g.ids) letterOf.set(id, g.letter);

  const matches: GulfHubMatch[] = groupStage.map((m) => {
    const home = team(m.homeTeam);
    const away = team(m.awayTeam);
    const letter = letterOf.get(m.homeTeamId) ?? "";
    return {
      id: m.id,
      href: `/live/${LEAGUE}/${m.externalId}`,
      matchday: parseRound(m.raw)!,
      groupLabel: letter ? `${letter}조` : null,
      letter,
      homeId: m.homeTeamId,
      awayId: m.awayTeamId,
      status: m.status,
      startTime: m.startTime,
      rankSum: home.rank != null && away.rank != null ? home.rank + away.rank : null,
      rankWorst: home.rank != null && away.rank != null ? Math.max(home.rank, away.rank) : null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      home,
      away,
    };
  });

  const results: GulfResult[] = matches
    .filter((m) => m.status === "FINISHED" && m.homeScore != null && m.awayScore != null)
    .map((m) => ({ homeId: m.homeId, awayId: m.awayId, homeScore: m.homeScore!, awayScore: m.awayScore! }));

  const groupViews: HubGroupView[] = groups.map((g) => {
    const rows = computeGroupTable(g.ids, results, (id) => koName(enName.get(id) ?? ""));
    const played = rows.some((r) => r.played > 0);
    const zones = gulfZones(rows, played);
    const next = matches.find((m) => m.letter === g.letter && (m.status === "SCHEDULED" || m.status === "LIVE"));
    return {
      key: g.letter,
      eyebrow: "조별리그",
      title: `${g.letter}조`,
      played,
      rows: rows.map((r, i) => {
        const en = enName.get(r.teamId) ?? "";
        return {
          teamId: r.teamId,
          position: r.position,
          name: koName(en),
          flag: fifaFlag(en),
          played: r.played,
          goalDiff: r.goalDiff,
          points: r.points,
          zone: zones[i],
        };
      }),
      next: next ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" } : null,
    };
  });

  const featured = pickSpotlight(matches);
  const others = featured ? sameRoundOthers(matches, featured) : [];
  const byStart = (a: HubMatch, b: HubMatch) => a.startTime.getTime() - b.startTime.getTime();

  return (
    <div className="space-y-12">
      {featured && (
        <SpotlightSection
          featured={featured}
          eyebrow={`빅매치 · ${featured.groupLabel ?? "조별리그"}`}
          note={
            featured.status === "LIVE"
              ? "진행 중인 조별리그 경기"
              : featured.status === "FINISHED"
                ? "가장 최근에 끝난 조별리그 경기"
                : "이번 라운드 중 두 팀 FIFA 랭킹이 가장 높은 경기"
          }
          matchdays={GULF_MATCHDAYS}
          left={{ title: "A조 · 같은 라운드", items: others.filter((m) => m.letter === "A").sort(byStart) }}
          right={{ title: "B조 · 같은 라운드", items: others.filter((m) => m.letter === "B").sort(byStart) }}
        />
      )}
      <section aria-labelledby="hub-groups" className="space-y-5">
        <HubHeading
          eyebrow="Group stage"
          title="조별리그 순위"
          meta={`${groupViews.length}개 조 · ${groupViews.reduce((n, g) => n + g.rows.length, 0)}팀 · 조 1·2위 4강`}
        />
        <GroupSegments
          segments={[{ key: "all", label: "조별리그", count: groupViews.reduce((n, g) => n + g.rows.length, 0), rule: "조 1·2위 4강 진출", groups: groupViews }]}
          ariaLabel="조"
          unplayedNote="아직 경기 전이라 순위가 정해지지 않았습니다."
          note="순위는 종료 경기로 직접 계산합니다(승점·득실·다득점 순). 여기까지 같으면 공식 규정과 순서가 다를 수 있어 4강권 표시를 보류합니다."
        />
      </section>
    </div>
  );
}

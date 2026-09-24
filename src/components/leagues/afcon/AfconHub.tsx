// AFCON 2027 예선 허브 — 빅매치 허브 공용 부품(hub/)에 AFCON 예선 조별리그 데이터를 채운다.
// 순위는 ts 조별 표(12개 조, 표 순서 = A~L), 규칙은 lib/sports/afcon(개최국 조는 규칙이 다르다).
import { prisma } from "@/lib/db";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";
import { parseRound } from "@/lib/sports/fixture-rounds";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { AFCON_HOSTS, AFCON_MATCHDAYS, afconGroupLetter, afconZone } from "@/lib/sports/afcon";
import { kstKickoff, pickSpotlight, sameRoundOthers } from "@/lib/sports/tournament-hub";
import SpotlightSection from "../hub/SpotlightSection";
import GroupSegments from "../hub/GroupSegments";
import { HubEmpty, HubHeading } from "../hub/HubParts";
import type { HubGroupView, HubMatch, HubSegmentView, HubTeam } from "../hub/types";

const LEAGUE = "AFCON";
/** 레일 한쪽에 올릴 경기 수 — 한 라운드가 24경기라 다 올리면 레일이 초점을 잡아먹는다 */
const RAIL_MAX = 4;
/** 토글 묶음 — 12개 조를 네 개씩 */
const SEGMENTS = [
  { key: "AD", from: 0, to: 3, host: "D조 케냐" },
  { key: "EH", from: 4, to: 7, host: "H조 우간다" },
  { key: "IL", from: 8, to: 11, host: "L조 탄자니아" },
];
type AfconHubMatch = HubMatch & { groupIndex: number };

function koName(en: string): string {
  return toKoreanTeamName(en, LEAGUE) || en;
}
function team(t: { name: string; logoUrl: string | null }): HubTeam {
  return { name: koName(t.name), flag: fifaFlag(t.name), logoUrl: t.logoUrl, rank: getFifaRank(t.name) };
}

export default async function AfconHub() {
  const [ts, rawMatches] = await Promise.all([
    fetchStandingsForLeague(LEAGUE),
    prisma.match.findMany({
      where: { league: LEAGUE },
      orderBy: { startTime: "asc" },
      select: {
        id: true, externalId: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true,
        homeTeamId: true, awayTeamId: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  // ts 는 조 번호(1~12)가 있는 표가 조별리그다. 조 번호 없는 부속 표(3위 비교 등)는 뺀다.
  const tables = (ts?.tables ?? []).filter((t) => Number.isInteger(Number(t.group)));
  if (tables.length === 0) return <HubEmpty />;

  const ids = tables.flatMap((t) => t.rows.map((r) => r.ourTeamId)).filter((x): x is number => x != null);
  const teams = await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));
  const groupOf = new Map<number, number>();
  tables.forEach((t, gi) => t.rows.forEach((r) => r.ourTeamId != null && groupOf.set(r.ourTeamId, gi)));

  // 조별리그 경기만 — 두 팀이 같은 조여야 한다(3월 예비예선 경기는 여기서 빠진다).
  const matches: AfconHubMatch[] = [];
  for (const m of rawMatches) {
    const gi = groupOf.get(m.homeTeamId);
    if (gi == null || groupOf.get(m.awayTeamId) !== gi) continue;
    const matchday = parseRound(m.raw);
    if (matchday == null) continue;
    const home = team(m.homeTeam);
    const away = team(m.awayTeam);
    matches.push({
      id: m.id,
      href: `/live/${LEAGUE}/${m.externalId}`,
      matchday,
      groupIndex: gi,
      groupLabel: `${afconGroupLetter(gi)}조`,
      status: m.status,
      startTime: m.startTime,
      rankSum: home.rank != null && away.rank != null ? home.rank + away.rank : null,
      rankWorst: home.rank != null && away.rank != null ? Math.max(home.rank, away.rank) : null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      home,
      away,
    });
  }

  const groups: HubGroupView[] = tables.map((t, gi) => {
    const rows = t.rows.filter((r) => r.ourTeamId != null);
    const played = rows.some((r) => (r.total ?? 0) > 0);
    const isHost = (id: number) => AFCON_HOSTS.has(nameOf.get(id) ?? "");
    const groupHasHost = rows.some((r) => isHost(r.ourTeamId!));
    const bestNonHostPosition = Math.min(...rows.filter((r) => !isHost(r.ourTeamId!)).map((r) => r.position));
    const next = matches.find((m) => m.groupIndex === gi && (m.status === "SCHEDULED" || m.status === "LIVE"));
    return {
      key: String(gi),
      eyebrow: "예선",
      title: `${afconGroupLetter(gi)}조`,
      played,
      rows: rows
        .map((r) => {
          const en = nameOf.get(r.ourTeamId!) ?? "";
          const host = isHost(r.ourTeamId!);
          return {
            teamId: r.ourTeamId!,
            position: r.position,
            name: koName(en),
            flag: fifaFlag(en),
            played: r.total ?? 0,
            goalDiff: r.goal_diff ?? 0,
            points: r.points ?? 0,
            zone: afconZone({ isHost: host, position: r.position, groupHasHost, groupPlayed: played, bestNonHostPosition }),
            badge: host ? "개최국" : undefined,
          };
        })
        .sort((a, b) => a.position - b.position),
      next: next ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" } : null,
    };
  });

  const segments: HubSegmentView[] = SEGMENTS.map((s) => {
    const gs = groups.slice(s.from, s.to + 1);
    return {
      key: s.key,
      label: `${afconGroupLetter(s.from)}~${afconGroupLetter(s.to)}조`,
      count: gs.reduce((n, g) => n + g.rows.length, 0),
      rule: `조 1·2위 본선 진출 · ${s.host}는 개최국 + 나머지 중 최상위 1팀`,
      groups: gs,
    };
  }).filter((s) => s.groups.length > 0);

  // 빅매치 + 같은 라운드 주요 경기 레일(A~F조 왼쪽 / G~L조 오른쪽, 각 FIFA 랭킹 상위 4경기).
  const featured = pickSpotlight(matches);
  const others = featured ? sameRoundOthers(matches, featured) : [];
  const byStart = (a: HubMatch, b: HubMatch) => a.startTime.getTime() - b.startTime.getTime();
  const rail = (inLeft: boolean) =>
    others.filter((m) => (m.groupIndex < 6) === inLeft).slice(0, RAIL_MAX).sort(byStart);

  return (
    <div className="space-y-12">
      {featured && (
        <SpotlightSection
          featured={featured}
          eyebrow={`빅매치 · 예선 ${featured.groupLabel}`}
          note={
            featured.status === "LIVE"
              ? "진행 중인 예선 경기"
              : featured.status === "FINISHED"
                ? "가장 최근에 끝난 예선 경기"
                : "이번 라운드 중 두 팀 FIFA 랭킹이 가장 높은 경기 · 양옆은 조별 FIFA 랭킹 상위 경기"
          }
          matchdays={AFCON_MATCHDAYS}
          left={{ title: "A~F조 주요 경기", items: rail(true) }}
          right={{ title: "G~L조 주요 경기", items: rail(false) }}
        />
      )}
      <section aria-labelledby="hub-groups" className="space-y-5">
        <HubHeading
          eyebrow="Qualifiers"
          title="예선 조별리그 순위"
          meta={`${groups.length}개 조 · ${groups.reduce((n, g) => n + g.rows.length, 0)}팀 · 본선 24팀`}
        />
        <GroupSegments
          segments={segments}
          ariaLabel="조 묶음"
          unplayedNote="아직 경기 전이라 순위가 정해지지 않았습니다. 첫 경기가 끝나면 자동으로 갱신됩니다."
          note="공동개최국 케냐·우간다·탄자니아는 성적과 무관하게 본선에 자동 진출합니다. 1·2라운드는 9~10월, 3·4라운드는 11월, 5·6라운드는 2027년 3월입니다."
        />
      </section>
    </div>
  );
}

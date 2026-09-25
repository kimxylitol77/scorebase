// UEFA 네이션스리그 허브 — 빅매치 허브 공용 부품(hub/)에 네이션스리그 데이터를 채운다.
// 순위 행은 lib/standings/af-grouped(조별 순위 단일 출처), 규칙은 lib/sports/nations-league.
import { prisma } from "@/lib/db";
import { getAfGroupedRows } from "@/lib/standings/af-grouped";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import {
  NL_MATCHDAYS,
  NL_TIERS,
  NL_TIER_RULE,
  nlZone,
  parseNlGroup,
  parseNlRound,
  pickFeatured,
  type NlTier,
} from "@/lib/sports/nations-league";
import { kstKickoff, sameRoundOthers } from "@/lib/sports/tournament-hub";
import SpotlightSection from "../hub/SpotlightSection";
import GroupSegments from "../hub/GroupSegments";
import { HubEmpty, HubHeading } from "../hub/HubParts";
import type { HubMatch, HubSegmentView, HubTeam } from "../hub/types";

const LEAGUE = "UEFA_NL";
type NlHubMatch = HubMatch & { tier: NlTier; group: number | null };

function team(t: { name: string; logoUrl: string | null }): HubTeam {
  return { name: toKoreanTeamName(t.name, LEAGUE) || t.name, flag: fifaFlag(t.name), logoUrl: t.logoUrl, rank: getFifaRank(t.name) };
}

export default async function NationsLeagueHub() {
  const [rows, rawMatches] = await Promise.all([
    getAfGroupedRows(LEAGUE),
    prisma.match.findMany({
      where: { league: LEAGUE },
      orderBy: { startTime: "asc" },
      select: {
        id: true, externalId: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true, homeTeamId: true, awayTeamId: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  // 이번 시즌 경기만 — 지난 시즌(2024-25)도 같은 "League A - 1" 라운드라 섞이면 빅매치·레일이 옛 경기를 고른다.
  //  시즌 경계 = 150일 넘게 빈 곳(리그페이즈 9~11월, 파이널 3·6월, 다음 시즌 이듬해 9월).
  const nlMatches = rawMatches.filter((m) => parseNlRound(m.raw));
  let seasonFrom = 0;
  for (let i = 1; i < nlMatches.length; i++) {
    if (nlMatches[i].startTime.getTime() - nlMatches[i - 1].startTime.getTime() > 150 * 86400_000) seasonFrom = i;
  }
  const seasonMatches = nlMatches.slice(seasonFrom);

  // 팀 → 조. 경기 raw 엔 조가 없어 순위표에서 역으로 붙인다(한 조의 두 팀끼리만 붙는다).
  // 새 형식(리그 글자 없는 조 이름)은 로더(af-grouped)가 이미 "League X, Group N" 으로 맞춰 준다.
  const groupOf = new Map<number, { tier: NlTier; group: number }>();
  const grouped = rows.flatMap((r) => {
    const g = parseNlGroup(r.rawGroup);
    return g ? [{ ...r, ...g }] : [];
  });
  for (const r of grouped) groupOf.set(r.teamId, { tier: r.tier, group: r.group });

  const matches: NlHubMatch[] = [];
  for (const m of seasonMatches) {
    const round = parseNlRound(m.raw);
    if (!round) continue;
    const home = team(m.homeTeam);
    const away = team(m.awayTeam);
    const group = groupOf.get(m.homeTeamId)?.group ?? null;
    matches.push({
      id: m.id,
      href: `/live/${LEAGUE}/${m.externalId}`,
      tier: round.tier,
      matchday: round.matchday,
      group,
      groupLabel: group ? `${group}조` : null,
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

  const teamIds = [...new Set(grouped.map((r) => r.teamId))];
  const teams = teamIds.length ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(teams.map((t) => [t.id, t.name]));

  const segments: HubSegmentView[] = NL_TIERS.map((tier) => {
    const groupNos = [...new Set(grouped.filter((r) => r.tier === tier).map((r) => r.group))].sort((a, b) => a - b);
    const groups = groupNos.map((no) => {
      const gRows = grouped.filter((r) => r.tier === tier && r.group === no).sort((a, b) => a.position - b.position);
      const played = gRows.some((r) => r.won + r.draw + r.loss > 0);
      const next = matches.find((m) => m.tier === tier && m.group === no && (m.status === "SCHEDULED" || m.status === "LIVE"));
      return {
        key: `${tier}-${no}`,
        eyebrow: `리그 ${tier}`,
        title: `${no}조`,
        played,
        rows: gRows.map((r) => {
          const en = nameOf.get(r.teamId) ?? "";
          return {
            teamId: r.teamId,
            position: r.position,
            name: toKoreanTeamName(en, LEAGUE) || en,
            flag: fifaFlag(en),
            played: r.won + r.draw + r.loss,
            goalDiff: r.goalDiff,
            points: r.points,
            zone: nlZone(tier, r.position, played),
          };
        }),
        next: next ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" } : null,
      };
    });
    return { key: tier, label: `리그 ${tier}`, count: groups.reduce((s, g) => s + g.rows.length, 0), rule: NL_TIER_RULE[tier].label, groups };
  }).filter((s) => s.groups.length > 0);

  if (segments.length === 0) return <HubEmpty />;

  // 빅매치 + 같은 라운드 리그 A 레일(1·2조 왼쪽 / 3·4조 오른쪽). 레일은 킥오프 순으로 보여준다.
  const featured = pickFeatured(matches);
  const others = featured ? sameRoundOthers(matches.filter((m) => m.tier === "A"), featured) : [];
  const byStart = (a: HubMatch, b: HubMatch) => a.startTime.getTime() - b.startTime.getTime();

  return (
    <div className="space-y-12">
      {featured && (
        <SpotlightSection
          featured={featured}
          eyebrow={`빅매치 · 리그 A${featured.groupLabel ? ` · ${featured.groupLabel}` : ""}`}
          note={
            featured.status === "LIVE"
              ? "진행 중인 리그 A 경기"
              : featured.status === "FINISHED"
                ? "리그페이즈 마지막 리그 A 경기"
                : "이번 라운드 리그 A 중 두 팀 FIFA 랭킹이 가장 높은 경기"
          }
          matchdays={NL_MATCHDAYS}
          left={{ title: "리그 A · 1·2조", items: others.filter((m) => (m.group ?? 0) <= 2).sort(byStart) }}
          right={{ title: "리그 A · 3·4조", items: others.filter((m) => (m.group ?? 0) > 2).sort(byStart) }}
        />
      )}
      <section aria-labelledby="hub-groups" className="space-y-5">
        <HubHeading
          eyebrow="League phase"
          title="리그페이즈 순위"
          meta={`리그 A~D · ${segments.reduce((s, t) => s + t.groups.length, 0)}개 조 · ${segments.reduce((s, t) => s + t.count, 0)}팀`}
        />
        <GroupSegments
          segments={segments}
          ariaLabel="리그 등급"
          unplayedNote="아직 경기 전이라 순위가 정해지지 않았습니다. 첫 경기가 끝나면 자동으로 갱신됩니다."
          note="하위권 강등과 승강 플레이오프는 조끼리 성적을 비교해 리그페이즈가 끝난 뒤 확정됩니다."
        />
      </section>
    </div>
  );
}

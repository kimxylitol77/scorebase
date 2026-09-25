// 아시안게임 축구 허브(남자 U-23·여자) — 빅매치 허브 공용 부품에 조별리그 + 녹아웃 진행을 채운다.
// 순위는 ts 조별 표, 8강 진출 표시는 녹아웃 대진에 실제로 오른 팀(규칙 추정 아님). 규칙은 lib/sports/asian-games.
import { prisma } from "@/lib/db";
import { fetchStandingsForLeague } from "@/lib/sports/thesports/standings-fetch";
import { fifaFlag, getFifaRank } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { ASIAN_GAMES_STAGES, asianGamesGroupLetter, asianGamesNation, asianGamesStageIndex } from "@/lib/sports/asian-games";
import { kstKickoff, pickSpotlight, sameRoundOthers } from "@/lib/sports/tournament-hub";
import SpotlightSection from "../hub/SpotlightSection";
import GroupSegments from "../hub/GroupSegments";
import { HubEmpty, HubHeading } from "../hub/HubParts";
import type { HubGroupView, HubMatch, HubSegmentView, HubTeam } from "../hub/types";

const RAIL_MAX = 4;

function stageOf(raw: string | null): { index: number; group: number } | null {
  if (!raw) return null;
  try {
    const r = (JSON.parse(raw) as { thesports?: { round?: { stageName?: string; roundNum?: number; groupNum?: number } } }).thesports?.round;
    if (!r?.stageName) return null;
    const index = asianGamesStageIndex(r.stageName, r.roundNum ?? 0);
    return index == null ? null : { index, group: r.groupNum ?? 0 };
  } catch {
    return null;
  }
}

export default async function AsianGamesHub({ league }: { league: "ASIAN_GAMES_FB" | "ASIAN_GAMES_FB_W" }) {
  const men = league === "ASIAN_GAMES_FB";
  const [ts, rawMatches] = await Promise.all([
    fetchStandingsForLeague(league),
    prisma.match.findMany({
      where: { league },
      orderBy: { startTime: "asc" },
      select: {
        id: true, externalId: true, status: true, startTime: true, homeScore: true, awayScore: true, raw: true,
        homeTeamId: true, awayTeamId: true,
        homeTeam: { select: { name: true, logoUrl: true } },
        awayTeam: { select: { name: true, logoUrl: true } },
      },
    }),
  ]);

  // 조 번호가 있는 표만 — 여자 0번 표(3위 비교)는 조가 아니다.
  const tables = (ts?.tables ?? []).filter((t) => asianGamesGroupLetter(Number(t.group)) != null);
  if (tables.length === 0) return <HubEmpty />;

  const ids = tables.flatMap((t) => t.rows.map((r) => r.ourTeamId)).filter((x): x is number => x != null);
  const teamRows = await prisma.team.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  const nameOf = new Map(teamRows.map((t) => [t.id, t.name]));
  const ko = (en: string) => toKoreanTeamName(en, league) || en;
  // 표시 순위는 비운다 — U-23·여자 대표의 순위가 아닌 A대표(남자) FIFA 순위를 "FIFA N위"로 붙이면 틀린다.
  const team = (t: { name: string; logoUrl: string | null }): HubTeam => ({
    name: ko(t.name), flag: fifaFlag(asianGamesNation(t.name)), logoUrl: t.logoUrl, rank: null,
  });
  // 빅매치 고르기에만 남자 A대표 FIFA 순위를 참고한다(여자는 순위 자료가 없어 킥오프 순).
  const seniorRank = (en: string) => (men ? getFifaRank(asianGamesNation(en)) : null);

  const matches: HubMatch[] = [];
  const knockoutTeams = new Set<number>();
  for (const m of rawMatches) {
    const st = stageOf(m.raw);
    if (!st) continue;
    if (st.index >= 4) {
      knockoutTeams.add(m.homeTeamId);
      knockoutTeams.add(m.awayTeamId);
    }
    const hr = seniorRank(m.homeTeam.name);
    const ar = seniorRank(m.awayTeam.name);
    const letter = asianGamesGroupLetter(st.group);
    matches.push({
      id: m.id,
      href: `/live/${league}/${m.externalId}`,
      matchday: st.index,
      groupLabel: st.index <= 3 && letter ? `${letter}조` : ASIAN_GAMES_STAGES[st.index - 1],
      status: m.status,
      startTime: m.startTime,
      rankSum: hr != null && ar != null ? hr + ar : null,
      rankWorst: hr != null && ar != null ? Math.max(hr, ar) : null,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      home: team(m.homeTeam),
      away: team(m.awayTeam),
    });
  }

  const groups: HubGroupView[] = tables
    .map((t) => {
      const letter = asianGamesGroupLetter(Number(t.group))!;
      const rows = t.rows.filter((r) => r.ourTeamId != null);
      const next = matches.find((m) => m.groupLabel === `${letter}조` && (m.status === "SCHEDULED" || m.status === "LIVE"));
      return {
        key: letter,
        eyebrow: men ? "남자 U-23" : "여자",
        title: `${letter}조`,
        played: rows.some((r) => (r.total ?? 0) > 0),
        rows: rows
          .map((r) => {
            const en = nameOf.get(r.ourTeamId!) ?? "";
            return {
              teamId: r.ourTeamId!,
              position: r.position,
              name: ko(en),
              flag: fifaFlag(asianGamesNation(en)),
              played: r.total ?? 0,
              goalDiff: r.goal_diff ?? 0,
              points: r.points ?? 0,
              zone: knockoutTeams.has(r.ourTeamId!) ? ("qf" as const) : null,
            };
          })
          .sort((a, b) => a.position - b.position),
        next: next
          ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" }
          : null,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  const first = groups[0].key;
  const last = groups[groups.length - 1].key;
  const segments: HubSegmentView[] = [
    {
      key: "all",
      label: `${first}~${last}조`,
      count: groups.reduce((n, g) => n + g.rows.length, 0),
      rule: men ? "조 1·2위 8강 진출" : "조 1·2위 + 3위 중 상위 2팀 8강 진출",
      groups,
    },
  ];

  const featured = pickSpotlight(matches);
  const others = featured ? sameRoundOthers(matches, featured).slice(0, RAIL_MAX) : [];
  const recent = matches
    .filter((m) => m.status === "FINISHED" && m.id !== featured?.id)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, RAIL_MAX);
  const stageName = featured ? ASIAN_GAMES_STAGES[featured.matchday - 1] : "";

  return (
    <div className="space-y-12">
      {featured && (
        <SpotlightSection
          featured={featured}
          eyebrow={`빅매치 · ${featured.groupLabel}`}
          note={
            featured.status === "LIVE"
              ? "진행 중인 경기"
              : featured.status === "FINISHED"
                ? "가장 최근에 끝난 경기"
                : men
                  ? `${stageName} 중 두 나라 A대표 FIFA 랭킹이 가장 높은 경기 · U-23 대회라 참고 기준입니다`
                  : `${stageName} 첫 경기`
          }
          matchdays={ASIAN_GAMES_STAGES.length}
          trackLabels={ASIAN_GAMES_STAGES}
          left={{ title: `${stageName} 다른 경기`, items: others }}
          right={{ title: "최근 결과", items: recent }}
        />
      )}
      <section aria-labelledby="hub-groups" className="space-y-5">
        <HubHeading
          eyebrow={men ? "Men's U-23" : "Women"}
          title="조별리그 순위"
          meta={`${groups.length}개 조 · ${groups.reduce((n, g) => n + g.rows.length, 0)}팀 · 8강 진출 ${knockoutTeams.size}팀`}
        />
        <GroupSegments
          segments={segments}
          ariaLabel="조"
          unplayedNote="아직 경기 전이라 순위가 정해지지 않았습니다. 첫 경기가 끝나면 자동으로 갱신됩니다."
          note={
            men
              ? "남자부는 23세 이하 대회입니다. D조는 이라크가 조 추첨 직전 기권해 3팀으로 치러져 팀당 2경기입니다. 초록 막대는 8강 대진에 오른 팀입니다."
              : "초록 막대는 8강 대진에 오른 팀입니다. 조 3위 중 상위 2팀은 조 간 비교(승점·득실)로 정해집니다."
          }
        />
      </section>
    </div>
  );
}

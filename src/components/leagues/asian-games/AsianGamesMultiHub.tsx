// 아시안게임 농구·배구·야구 허브(남녀 5개 대회) — 축구 허브(AsianGamesHub)와 같은 빅매치 + 조별 카드 화면에 최종 순위를 더한다.
// 데이터는 lib/sports/asian-games-multi(조 표·결선 판정). 대진표 탭은 agMultiCupRounds 가 같은 판정으로 만든다.
import Link from "next/link";
import { fifaFlag } from "@/lib/sports/fifa-rankings";
import { toKoreanTeamName } from "@/lib/team-names";
import { asianGamesNation } from "@/lib/sports/asian-games";
import { kstKickoff, pickSpotlight, sameRoundOthers } from "@/lib/sports/tournament-hub";
import { AG_MULTI, getAgMultiHub, type AgMultiHub, type AgMultiMatch } from "@/lib/sports/asian-games-multi";
import { koWinner } from "@/lib/sports/asian-games-knockout";
import type { CupRound } from "@/lib/predict/cup-bracket";
import TeamLogoImg from "@/components/TeamLogoImg";
import SpotlightSection from "../hub/SpotlightSection";
import GroupSegments from "../hub/GroupSegments";
import { HubEmpty, HubHeading } from "../hub/HubParts";
import type { HubGroupView, HubMatch, HubSegmentView, HubTeam } from "../hub/types";

const RAIL_MAX = 4;
const SPORT_KO = { basketball: "농구", volleyball: "배구", baseball: "야구" } as const;
const COLS = {
  basketball: { diff: "득실", points: "승" },
  volleyball: { diff: "세트", points: "승점" },
  baseball: { diff: "득실", points: "승" },
} as const;

type Side = AgMultiMatch["homeTeam"];
const koName = (t: Side, league: string) => t.nameKo || toKoreanTeamName(t.name, league) || t.name;

/** 경기마다 트랙 위치·구역 이름 — 조 표 경기는 조, 결선은 라운드 이름 */
function stageInfo(hub: AgMultiHub) {
  const hasSecond = hub.tables.some((t) => t.stage === "second");
  const track: string[] = ["조별리그", ...(hasSecond ? ["2라운드"] : [])];
  const roundOf = new Map<number, string>();
  for (const r of hub.ko.rounds) {
    track.push(r.label);
    for (const m of r.matches) roundOf.set(m.id, r.label);
  }
  if (hub.ko.bronze) roundOf.set(hub.ko.bronze.id, "3·4위전");
  if (hub.ko.rounds.length === 0 && hub.koIds.size > 0) track.push("결선");
  const secondTitles = new Set(hub.tables.filter((t) => t.stage === "second").map((t) => t.title));
  const place = (m: AgMultiMatch): { day: number; label: string } => {
    if (m.table) return secondTitles.has(m.table) ? { day: 2, label: m.table } : { day: 1, label: m.table };
    const r = roundOf.get(m.id);
    if (r === "3·4위전") return { day: track.indexOf("결승") + 1 || track.length, label: r };
    if (r) return { day: track.indexOf(r) + 1, label: r };
    return { day: track.length, label: hub.ko.rounds.length ? "순위결정전" : "결선" };
  };
  return { track, place };
}

export function agMultiCupRounds(hub: AgMultiHub, league: string): CupRound[] {
  const byId = new Map(hub.matches.map((m) => [m.id, m]));
  const team = (id: number, t: Side) => ({ id, name: koName(t, league), logoUrl: t.logoUrl });
  const rounds = [...hub.ko.rounds];
  if (hub.ko.bronze) rounds.push({ label: "3·4위전", matches: [hub.ko.bronze] });
  return rounds.map((r) => ({
    label: r.label,
    ko: r.label,
    ties: r.matches.flatMap((km) => {
      const m = byId.get(km.id);
      if (!m) return [];
      return [{
        key: `${r.label}-${Math.min(m.homeTeamId, m.awayTeamId)}-${Math.max(m.homeTeamId, m.awayTeamId)}`,
        team1: team(m.homeTeamId, m.homeTeam),
        team2: team(m.awayTeamId, m.awayTeam),
        legs: [{
          matchId: m.id, externalId: m.externalId, startTime: m.startTime, status: m.status,
          homeTeamId: m.homeTeamId, homeScore: m.homeScore, awayTeamId: m.awayTeamId, awayScore: m.awayScore, penalty: null,
        }],
        winnerTeamId: koWinner(km),
        aggregate: null,
        completed: m.status === "FINISHED",
      }];
    }),
  }));
}

const MEDAL = [
  { label: "금메달", ring: "ring-amber-300/70 dark:ring-amber-600/40", bg: "from-amber-100 to-yellow-50 dark:from-amber-900/40 dark:to-yellow-950/10", text: "text-amber-700 dark:text-amber-300" },
  { label: "은메달", ring: "ring-slate-300/70 dark:ring-slate-500/40", bg: "from-slate-100 to-white dark:from-slate-800/60 dark:to-slate-900/10", text: "text-slate-600 dark:text-slate-300" },
  { label: "동메달", ring: "ring-orange-300/60 dark:ring-orange-700/40", bg: "from-orange-100 to-amber-50 dark:from-orange-950/40 dark:to-amber-950/10", text: "text-orange-700 dark:text-orange-300" },
  { label: "4위", ring: "ring-black/5 dark:ring-white/10", bg: "from-white to-white dark:from-white/[0.04] dark:to-white/[0.02]", text: "text-zinc-500" },
];

export default async function AsianGamesMultiHub({ league }: { league: string }) {
  const cfg = AG_MULTI[league];
  const hub = await getAgMultiHub(league);
  if (!cfg || !hub || hub.tables.length === 0) return <HubEmpty />;
  const { track, place } = stageInfo(hub);
  const sideOf = new Map<number, Side>();
  for (const m of hub.matches) { sideOf.set(m.homeTeamId, m.homeTeam); sideOf.set(m.awayTeamId, m.awayTeam); }
  const nameOf = (id: number) => { const t = sideOf.get(id); return t ? koName(t, league) : `팀 ${id}`; };
  const flagOf = (id: number) => { const t = sideOf.get(id); return t ? fifaFlag(asianGamesNation(t.name), t.nameKo) : ""; };
  const team = (t: Side): HubTeam => ({ name: koName(t, league), flag: fifaFlag(asianGamesNation(t.name), t.nameKo), logoUrl: t.logoUrl, rank: null });

  const matches: HubMatch[] = hub.matches.map((m) => {
    const p = place(m);
    return {
      id: m.id, href: `/live/${league}/${m.externalId}`, matchday: p.day, groupLabel: p.label,
      status: m.status, startTime: m.startTime, rankSum: null, rankWorst: null,
      homeScore: m.homeScore, awayScore: m.awayScore, home: team(m.homeTeam), away: team(m.awayTeam),
    };
  });

  // 초록 막대 = 다음 단계에 실제로 오른 팀(대진표 첫 라운드 팀·2라운드 승자조). 2라운드 표는 결승에 오른 두 팀.
  //  결선 경기에 나왔다는 것만으론 안 된다 — 배구는 탈락 팀도 순위결정전을 치른다(2026 여자 14팀 전원).
  const koTeams = new Set(hub.ko.rounds[0]?.matches.flatMap((m) => [m.homeId, m.awayId]) ?? []);
  const secondTeams = new Set(hub.tables.filter((t) => t.key === "W").flatMap((t) => t.rows.map((r) => r.teamId)));
  const finalists = new Set(hub.ko.rounds.find((r) => r.label === "결승")?.matches.flatMap((m) => [m.homeId, m.awayId]) ?? []);
  const eyebrow = cfg.men ? "남자" : "여자";
  const toGroup = (t: AgMultiHub["tables"][number]): HubGroupView => {
    const next = matches.find((m) => m.groupLabel === t.title && (m.status === "SCHEDULED" || m.status === "LIVE"));
    const advanced = (id: number) => (t.stage === "group" ? koTeams.has(id) || secondTeams.has(id) : t.key === "W" && finalists.has(id));
    return {
      key: t.key,
      eyebrow,
      title: t.title,
      played: t.rows.some((r) => r.played > 0),
      rows: t.rows.map((r) => ({
        teamId: r.teamId, position: r.position, name: nameOf(r.teamId), flag: flagOf(r.teamId),
        played: r.played, goalDiff: r.diff, points: r.points, zone: advanced(r.teamId) ? ("advance" as const) : null,
      })),
      next: next ? { href: next.href, home: next.home.name, away: next.away.name, when: kstKickoff(next.startTime), live: next.status === "LIVE" } : null,
    };
  };
  const groupTables = hub.tables.filter((t) => t.stage === "group");
  const secondTables = hub.tables.filter((t) => t.stage === "second");
  const cols = COLS[cfg.sport];
  const segments: HubSegmentView[] = [
    {
      key: "groups",
      label: groupTables.length > 1 ? `${groupTables[0].title.replace("조", "")}~${groupTables[groupTables.length - 1].title}` : "조별리그",
      count: groupTables.reduce((n, t) => n + t.rows.length, 0),
      rule: secondTables.length
        ? "초록 = 2라운드 승자 라운드 진출"
        : koTeams.size
          ? `초록 = ${hub.ko.rounds[0].label} 진출`
          : "결선 대진이 확정되면 진출 팀을 초록으로 표시합니다",
      groups: groupTables.map(toGroup),
      cols,
    },
    ...(secondTables.length
      ? [{ key: "second", label: "2라운드", count: secondTables.reduce((n, t) => n + t.rows.length, 0), rule: "초록 = 결승 진출", groups: secondTables.map(toGroup), cols }]
      : []),
  ];

  const featured = pickSpotlight(matches);
  const others = featured ? sameRoundOthers(matches, featured).slice(0, RAIL_MAX) : [];
  const recent = matches
    .filter((m) => m.status === "FINISHED" && m.id !== featured?.id)
    .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
    .slice(0, RAIL_MAX);
  const podium = hub.ko.podium;
  const decided = podium.some((x) => x != null);
  const sportNote = {
    basketball: "조 순위는 승 → 두 팀 동률이면 맞대결 → 득실차 순입니다. 원천 데이터에 조 이름이 없어 첫 경기 순서로 1조부터 번호를 붙였습니다.",
    volleyball: "배구 승점은 3-0·3-1 승 3점, 3-2 승 2점, 2-3 패 1점입니다. 세트 = 딴 세트 − 잃은 세트.",
    baseball: "조별리그 뒤 조 1·2위는 승자 라운드, 3·4위는 패자 라운드로 갑니다. 승자 라운드 1·2위가 결승, 3·4위가 동메달 결정전입니다.",
  }[cfg.sport];

  return (
    <div className="space-y-12">
      {decided && (
        <section aria-labelledby="hub-podium" className="space-y-4">
          <HubHeading eyebrow="Final standings" title="최종 순위" meta={`${SPORT_KO[cfg.sport]} ${eyebrow}부`} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {podium.map((id, i) => (
              <div key={i} className={`rounded-[1.5rem] bg-gradient-to-br p-4 ring-1 ${MEDAL[i].bg} ${MEDAL[i].ring}`}>
                <div className={`text-xs font-bold ${MEDAL[i].text}`}>{MEDAL[i].label}</div>
                {id != null ? (
                  <Link href={`/teams/${id}`} prefetch={false} className="mt-2 flex min-w-0 items-center gap-2 hover:underline">
                    <TeamLogoImg url={sideOf.get(id)?.logoUrl} name={nameOf(id)} size={32} className="h-8 w-8 shrink-0 object-contain" fallbackClassName="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-white/10" />
                    <span className="truncate text-base font-black text-zinc-950 dark:text-white">{nameOf(id)}</span>
                  </Link>
                ) : (
                  <div className="mt-2 text-sm text-zinc-400">미정</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {featured && (
        <SpotlightSection
          featured={featured}
          eyebrow={`빅매치 · ${featured.groupLabel}`}
          note={featured.status === "LIVE" ? "진행 중인 경기" : featured.status === "FINISHED" ? "가장 최근에 끝난 경기" : `${track[featured.matchday - 1] ?? ""} 첫 경기`}
          matchdays={track.length}
          trackLabels={track}
          left={{ title: "같은 단계 다른 경기", items: others }}
          right={{ title: "최근 결과", items: recent }}
        />
      )}
      <section aria-labelledby="hub-groups" className="space-y-5">
        <HubHeading
          eyebrow={cfg.men ? "Men" : "Women"}
          title="조별리그 순위"
          meta={`${groupTables.length}개 조 · ${groupTables.reduce((n, t) => n + t.rows.length, 0)}팀`}
        />
        <GroupSegments
          segments={segments}
          ariaLabel="조"
          unplayedNote="아직 경기 전이라 순위가 정해지지 않았습니다. 첫 경기가 끝나면 자동으로 갱신됩니다."
          note={sportNote}
        />
      </section>
    </div>
  );
}

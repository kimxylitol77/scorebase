// 리그 순위표 (표만) — 리그 페이지 "순위" 탭 콘텐츠. StandingsOnlyView 의 표 부분을 탭용으로 분리.
// 시즌 전환기(지난 시즌 종료 + 새 시즌 개막 전): 새 시즌 참가팀 표(0-0-0)를 메인으로, 지난 시즌
// 최종 순위는 접기(<details>). 라이브 순위 파이프라인(getFullStandings)은 건드리지 않음.
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getFullStandings } from "@/lib/sports/thesports/standings-helper";
import { computeLastSeasonStandings } from "@/lib/sports/last-season-standings";
import { loadLeagueLeaderboard } from "@/lib/sports/league-leaderboard";
import { getActiveSeason, legacyTsSeasonId } from "@/lib/sports/season-registry";
import LeagueLeaderBoard from "@/components/LeagueLeaderBoard";
import { leaderPlayerHref } from "@/lib/links/leaderboard-link";
import { linkableTsPlayerIds } from "@/lib/links/player-link";
import { SOCCER_LEAGUES } from "@/lib/sports/sport-leagues";
import { toKoreanTeamName } from "@/lib/team-names";

// 대륙 컵 — 국내 리그용 전환 감지(참가팀 16+ · 마지막 종료 40일+)가 성립하지 않는다.
// 예선이 여름 내내 lastFinished 를 리셋하고 참가팀 수도 유동적이라, season-watch 와 같은
// "롤오버 대기" 신호(저장소 신시즌 ID ≠ 캐시 ID && ACTIVE 없음)로 판정한다.
// poller 가 신시즌 표를 활성화하는 순간 조건이 깨져 자동으로 평시 렌더로 복귀한다.
const CONTINENTAL_CUPS = new Set(["UCL", "UEL", "UECL", "AFC_CL", "AFC_CL_TWO"]);

// 리그별 진출권·강등 구역 (순위 1-indexed). 표준 시즌 기준 — 매 시즌 UEFA 계수 미세변동은 단순화.
type ZoneType = "ucl" | "uel" | "uecl" | "promo" | "promoPo" | "relegPo" | "releg";
const ZONES: Record<string, { from: number; to: number; type: ZoneType }[]> = {
  EPL: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 5, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  LALIGA: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 6, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  SERIE_A: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 6, type: "uel" }, { from: 18, to: 20, type: "releg" }],
  BUNDESLIGA: [{ from: 1, to: 4, type: "ucl" }, { from: 5, to: 5, type: "uel" }, { from: 6, to: 6, type: "uecl" }, { from: 16, to: 16, type: "relegPo" }, { from: 17, to: 18, type: "releg" }],
  LIGUE_1: [{ from: 1, to: 3, type: "ucl" }, { from: 4, to: 4, type: "uel" }, { from: 5, to: 5, type: "uecl" }, { from: 16, to: 16, type: "relegPo" }, { from: 17, to: 18, type: "releg" }],
  // J리그 2026-27 (추춘제 첫 시즌, 20팀). J1 은 하위 3팀 강등만 확정 표기 — ACL 배분은 천황배
  // 결과에 걸려 위치만으로 못 정한다. J2 는 1~2위 자동 승격·3~6위 PO·하위 3팀 강등.
  // K리그1 2026 은 김천 상무 해체로 순위와 무관하게 김천만 강등되는 특수 시즌이라 넣지 않는다.
  J1_LEAGUE: [{ from: 18, to: 20, type: "releg" }],
  J2_LEAGUE: [{ from: 1, to: 2, type: "promo" }, { from: 3, to: 6, type: "promoPo" }, { from: 18, to: 20, type: "releg" }],
};
const ZONE_BORDER: Record<ZoneType, string> = {
  ucl: "border-l-blue-500",
  uel: "border-l-orange-400",
  uecl: "border-l-teal-400",
  promo: "border-l-emerald-500",
  promoPo: "border-l-lime-400",
  relegPo: "border-l-amber-400",
  releg: "border-l-rose-500",
};
const ZONE_DOT: Record<ZoneType, string> = {
  ucl: "bg-blue-500",
  uel: "bg-orange-400",
  uecl: "bg-teal-400",
  promo: "bg-emerald-500",
  promoPo: "bg-lime-400",
  relegPo: "bg-amber-400",
  releg: "bg-rose-500",
};
const ZONE_LABEL: Record<ZoneType, string> = {
  ucl: "챔피언스리그",
  uel: "유로파리그",
  uecl: "컨퍼런스리그",
  promo: "승격",
  promoPo: "승격 PO",
  relegPo: "강등 PO",
  releg: "강등",
};

type DisplayRow = {
  teamId: number;
  teamName: string;
  logoUrl: string | null;
  position: number;
  won: number;
  draw: number;
  loss: number;
  points: number;
  goalDiff?: number | null;
  goalsFor?: number | null;
  goalsAgainst?: number | null;
  group?: string | null;
};

// 순위표 렌더 — 그룹(J리그 East/West 등) 분리 + 진출권/강등 구역(showZones). 새 시즌 0-0-0 표는 zones off.
function renderStandingsTable(rows: DisplayRow[], league: string, showZones: boolean) {
  const groupNames = [...new Set(rows.map((r) => r.group).filter(Boolean))] as string[];
  const isGrouped = groupNames.length >= 2;
  const sections = isGrouped
    ? groupNames.map((g) => ({ group: g, rows: rows.filter((r) => r.group === g) }))
    : [{ group: null as string | null, rows }];
  const zones = showZones && !isGrouped ? ZONES[league] ?? [] : [];
  const zoneOf = (pos: number): ZoneType | null => zones.find((z) => pos >= z.from && pos <= z.to)?.type ?? null;
  const presentZones = [...new Set(zones.map((z) => z.type))];

  return (
    <div className="space-y-5">
      {sections.map((sec) => (
        <div key={sec.group ?? "_single"} className="space-y-2">
          {sec.group && (
            <h3 className="text-sm font-bold text-neutral-700 dark:text-neutral-300 px-1">{sec.group}</h3>
          )}
          <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-x-auto dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-white/[0.06] text-xs text-neutral-500">
                <tr>
                  <th className="text-right px-3 py-2 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 font-medium">팀</th>
                  <th className="text-right px-2 py-2 font-medium">경기</th>
                  <th className="text-right px-2 py-2 font-medium">승</th>
                  <th className="text-right px-2 py-2 font-medium">무</th>
                  <th className="text-right px-2 py-2 font-medium">패</th>
                  <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">득실</th>
                  <th className="text-right px-3 py-2 font-medium">승점</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
                {sec.rows.map((r) => {
                  const played = r.won + r.draw + r.loss;
                  const gd = r.goalDiff ?? (r.goalsFor != null && r.goalsAgainst != null ? r.goalsFor - r.goalsAgainst : null);
                  const z = zoneOf(r.position);
                  return (
                    <tr key={r.teamId} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                      <td className={`px-3 py-2 text-right tabular-nums font-semibold text-neutral-500 border-l-4 ${z ? ZONE_BORDER[z] : "border-l-transparent"}`}>{r.position}</td>
                      <td className="px-3 py-2 truncate">
                        <Link href={`/teams/${r.teamId}`} prefetch={false} className="group flex items-center gap-2 min-w-0">
                          {r.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={r.logoUrl} alt="" width={24} height={24} loading="lazy" className="w-6 h-6 object-contain shrink-0 bg-white rounded-sm" />
                          ) : (
                            <div className="w-6 h-6 rounded-sm bg-neutral-200 dark:bg-neutral-700 shrink-0" />
                          )}
                          <span className="truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">{r.teamName}</span>
                        </Link>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{played}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.won}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.draw}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{r.loss}</td>
                      <td className="px-2 py-2 text-right tabular-nums hidden sm:table-cell">
                        {gd != null ? (gd > 0 ? `+${gd}` : `${gd}`) : "-"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold">{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {presentZones.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-neutral-600 dark:text-neutral-400 px-1">
          {presentZones.map((t) => (
            <span key={t} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-sm ${ZONE_DOT[t]}`} />
              {ZONE_LABEL[t]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function LeagueStandingsTable({ league }: { league: string }) {
  const now = new Date();
  const live = await getFullStandings(league);

  // 시즌 전환 감지 — 지난 시즌 종료(40일+ 경과) + 새 시즌 예정 매치의 참가팀이 리그 규모면 프리시즌으로 판단.
  const [lastFinished, upcoming] = await Promise.all([
    prisma.match.findFirst({ where: { league, status: "FINISHED" }, orderBy: { startTime: "desc" }, select: { startTime: true } }),
    prisma.match.findMany({ where: { league, status: "SCHEDULED" }, orderBy: { startTime: "asc" }, select: { homeTeamId: true, awayTeamId: true, startTime: true } }),
  ]);
  const nextTeamIds = [...new Set(upcoming.flatMap((m) => [m.homeTeamId, m.awayTeamId]))];
  const daysSinceLast = lastFinished ? (now.getTime() - lastFinished.startTime.getTime()) / 86400_000 : 0;
  const inTransition = nextTeamIds.length >= 16 && daysSinceLast >= 40 && live.length > 0;

  // 새 시즌 프리시즌 표(0-0-0) — 예정 참가팀 알파벳(한글명)순.
  let newRows: DisplayRow[] = [];
  let labels: { neu: string; old: string } | null = null;
  if (inTransition && upcoming.length) {
    const nt = await prisma.team.findMany({ where: { id: { in: nextTeamIds } }, select: { id: true, name: true, logoUrl: true } });
    newRows = nt
      .map((t) => ({ teamId: t.id, teamName: toKoreanTeamName(t.name, league), logoUrl: t.logoUrl, position: 0, won: 0, draw: 0, loss: 0, points: 0, goalDiff: null, group: null }))
      .sort((a, b) => a.teamName.localeCompare(b.teamName, "ko"))
      .map((r, i) => ({ ...r, position: i + 1 }));
    const ny = upcoming[0].startTime.getUTCFullYear();
    labels = { neu: `${ny}-${String((ny + 1) % 100).padStart(2, "0")}`, old: `${ny - 1}-${String(ny % 100).padStart(2, "0")}` };
  }

  // 라이브(현재/지난 시즌) 표 rows.
  // 전환기에 외부 standings 캐시가 새 시즌으로 리셋되면 지난 시즌 승·무·패·승점이 전부 0 으로
  // 날아간다(2026-07 EPL·라리가·세리에A·리그1 실측). 그 경우 DB 완료 매치로 최종 순위를 복원.
  let base = live;
  if (inTransition && live.every((r) => r.won + r.draw + r.loss === 0)) {
    const restored = await computeLastSeasonStandings(league);
    if (restored.length > 0) base = restored;
  }
  const teamIds = [...new Set(base.map((r) => r.teamId))];
  const teams = teamIds.length
    ? await prisma.team.findMany({ where: { id: { in: teamIds } }, select: { id: true, name: true, logoUrl: true } })
    : [];
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const liveRows: DisplayRow[] = base
    .map((r) => {
      const team = teamMap.get(r.teamId);
      const en = team?.name ?? `Team #${r.teamId}`;
      return { ...r, teamName: toKoreanTeamName(en, league), logoUrl: team?.logoUrl ?? null };
    })
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.position - b.position);

  if (liveRows.length === 0 && newRows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-neutral-500">
        순위 데이터를 수집 중입니다. 잠시 후 다시 확인해주세요.
      </div>
    );
  }

  // 전환기: 새 시즌 표(메인) + 지난 시즌 최종 순위(접기).
  if (inTransition && newRows.length > 0) {
    // 팩트카드 — 빈 0-0-0 표의 공백을 채우는 3줄 (SofaScore 패턴): 디펜딩 챔피언·직전 득점왕·승격/신규팀.
    const champion = liveRows.find((r) => r.position === 1) ?? null;
    const liveIdSet = new Set(liveRows.map((r) => r.teamId));
    const promoted = newRows.filter((r) => !liveIdSet.has(r.teamId));
    const topScorer = labels
      ? await prisma.leagueLeader.findFirst({
          where: { league, category: "GOAL", rank: 1, season: labels.old },
          select: { playerName: true, teamName: true, value: true, photoUrl: true, externalId: true },
        })
      : null;
    // 링크 판정은 리더보드와 같은 공용 헬퍼 — externalId 가 ts player id 인 리그(확장 축구
    // 리그 다수)를 /players 로 넘기면 404 다. af id 는 /players 어댑터가 리다이렉트한다.
    // ts id 는 DB 에 그 선수가 없으면 /transfers 도 404 라 링크 자체를 뺀다.
    let topScorerHref = leaderPlayerHref(league, topScorer?.externalId ?? null, SOCCER_LEAGUES.has(league));
    if (topScorerHref?.startsWith("/transfers/")) {
      const ok = await linkableTsPlayerIds([topScorer!.externalId!]);
      if (ok.size === 0) topScorerHref = null;
    }
    // 지난 시즌 리더보드 — 접기 안에서 최종 순위와 함께 본다. 개막 전엔 이번 시즌 기록이 0이라
    // "통계" 탭이 비는데(preSeason 가드), 축적된 지난 시즌 득점왕·도움왕은 여기서 살려 노출한다.
    const lastLeaders = labels ? await loadLeagueLeaderboard(league, labels.old) : null;
    const hasLastLeaders = Object.keys(lastLeaders?.rowsByCategory ?? {}).length > 0;
    const factCards = [
      champion && {
        label: "디펜딩 챔피언",
        img: champion.logoUrl,
        main: champion.teamName,
        sub: `${labels?.old} 우승`,
        href: `/teams/${champion.teamId}`,
      },
      topScorer && {
        label: "직전 시즌 득점왕",
        img: topScorer.photoUrl,
        main: topScorer.playerName,
        sub: `${topScorer.teamName} · ${Math.round(topScorer.value)}골`,
        href: topScorerHref,
      },
      promoted.length > 0 && {
        label: "승격·새 얼굴",
        img: null,
        main: promoted.map((t) => t.teamName).slice(0, 3).join(" · "),
        sub: `${promoted.length}팀 합류`,
        href: null,
      },
    ].filter(Boolean) as { label: string; img: string | null; main: string; sub: string; href: string | null }[];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
            {labels?.neu} 시즌
          </span>
          <span className="text-xs text-neutral-400">개막 대기 · 참가팀</span>
        </div>
        {factCards.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {factCards.map((c) => {
              const inner = (
                <>
                  <div className="text-[11px] font-bold text-neutral-400 mb-1.5">{c.label}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    {c.img && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.img} alt="" width={28} height={28} loading="lazy" className="w-7 h-7 object-contain shrink-0 bg-white rounded-full ring-1 ring-black/5" />
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{c.main}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{c.sub}</div>
                    </div>
                  </div>
                </>
              );
              const cls = "rounded-2xl bg-white ring-1 ring-black/5 px-4 py-3 dark:bg-white/[0.04] dark:ring-white/10";
              return c.href ? (
                <Link key={c.label} href={c.href} prefetch={false} className={`${cls} block hover:bg-neutral-50 dark:hover:bg-white/[0.07] transition`}>
                  {inner}
                </Link>
              ) : (
                <div key={c.label} className={cls}>{inner}</div>
              );
            })}
          </div>
        )}
        {renderStandingsTable(newRows, league, false)}
        {(liveRows.length > 0 || hasLastLeaders) && (
          <details className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10">
            <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
              <span className="text-[10px] transition group-open:rotate-90" aria-hidden>▶</span>
              지난 시즌 최종 순위{hasLastLeaders ? " · 기록" : ""}{" "}
              <span className="font-normal text-neutral-400">({labels?.old})</span>
            </summary>
            <div className="px-2 pb-3 pt-1 space-y-4">
              {liveRows.length > 0 && renderStandingsTable(liveRows, league, true)}
              {hasLastLeaders && (
                <LeagueLeaderBoard
                  league={league}
                  season={labels!.old}
                  rowsByCategory={lastLeaders!.rowsByCategory}
                  footer={`${labels?.old} 시즌 최종 기록`}
                />
              )}
            </div>
          </details>
        )}
        <p className="text-[11px] text-neutral-400">{labels?.neu} 시즌 개막 후 자동으로 실시간 순위로 전환됩니다.</p>
      </div>
    );
  }

  // 대륙 컵 롤오버 대기: 캐시가 아직 지난 시즌 표 — "현재 시즌"으로 내보내면 오표시다.
  // 새 시즌 안내를 메인으로, 지난 시즌 리그 페이즈 최종 순위는 접기로 강등한다.
  if (CONTINENTAL_CUPS.has(league) && liveRows.length > 0) {
    const [repoSeasonId, active, cache] = await Promise.all([
      Promise.resolve(legacyTsSeasonId(league)),
      getActiveSeason(league),
      prisma.theSportsStandingsCache.findUnique({ where: { league }, select: { tsSeasonId: true } }),
    ]);
    const rolloverWait =
      active == null && repoSeasonId != null && cache != null && cache.tsSeasonId !== repoSeasonId;
    if (rolloverWait) {
      // 유럽·AFC 컵 모두 추춘제 — 7월 이후면 (y)-(y+1) 이 새 시즌.
      const y = now.getUTCMonth() + 1 >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
      const neu = `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
      const old = `${y - 1}-${String(y % 100).padStart(2, "0")}`;
      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <span className="inline-flex items-center rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-bold text-blue-600 ring-1 ring-blue-500/20 dark:text-blue-400">
              {neu} 시즌
            </span>
            <span className="text-xs text-neutral-400">본선 조 편성 대기</span>
          </div>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 px-4 py-3.5 text-sm dark:bg-white/[0.04] dark:ring-white/10">
            예선·플레이오프가 진행 중입니다. 본선 대진 확정 후 순위가 집계됩니다.{" "}
            <Link
              href={`/leagues/${league}?view=fixtures`}
              prefetch={false}
              className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              예선 일정 보기 →
            </Link>
          </div>
          <details className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10">
            <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
              <span className="text-[10px] transition group-open:rotate-90" aria-hidden>▶</span>
              지난 시즌 최종 순위 <span className="font-normal text-neutral-400">({old})</span>
            </summary>
            <div className="px-2 pb-3 pt-1">{renderStandingsTable(liveRows, league, true)}</div>
          </details>
          <p className="text-[11px] text-neutral-400">본선 개막 후 자동으로 실시간 순위로 전환됩니다.</p>
        </div>
      );
    }
  }

  // 평시: 현재 시즌 순위.
  return (
    <div className="space-y-2">
      {renderStandingsTable(liveRows, league, true)}
      <p className="text-[11px] text-neutral-400">현재 시즌 · 매일 자동 갱신</p>
    </div>
  );
}

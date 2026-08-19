// 리그 역대 우승 + 시즌별 최종 순위 아카이브 — 리그 페이지 "역사" 탭.
// 우승 연표: data/league-champions.json (위키데이터 P3450→P1346 수집).
// 시즌별 최종 순위: SeasonStandingsArchive (archive-standings 잡이 매일 굳힘 — 완료 시즌만 노출).
import Link from "next/link";
import championsData from "../../../data/league-champions.json";
import { prisma } from "@/lib/db";
import { toKoreanTeamName } from "@/lib/team-names";
import { fifaFlag, isNationalTeamLeague } from "@/lib/sports/fifa-rankings";
import TeamBadge from "@/components/TeamBadge";
import { seasonLabelFor } from "@/lib/sports/season-calendar";
import { resolveSeasonYear } from "@/lib/sports/season-registry";

// article: 그 시즌 우승 기록(결산글) slug — 있으면 "우승 기록" 링크 노출.
type Champ = { season: string; ko: string; en: string; article?: string };
const DATA = championsData as Record<string, { champions: Champ[] }>;

// 우승팀(위키데이터 풀네임) → DB 팀 매칭용 정규화. 영문=분음부호·축약(F.C. 등)·구두점 제거, 한글=공백 제거.
const FOOTBALL_TOKENS = new Set(["fc", "afc", "cf", "sc", "ac", "cd", "ud", "as", "rcd", "sd", "ssc", "ss", "uc", "acf", "cfc", "fbc", "vfl", "vfb", "sv", "club"]);
// 독·불 이름 번역차 보정(위키데이터 München ↔ DB Munich 등). 양쪽 normEn 을 같은 형태로 수렴.
const NAME_ALIAS: [RegExp, string][] = [[/munchen/g, "munich"], [/koln/g, "cologne"], [/nurnberg/g, "nuremberg"], [/monchengladbach/g, "gladbach"]];
const normEn = (s: string) => {
  let r = s.toLowerCase().normalize("NFD").replace(/\./g, "").split(/[^a-z0-9]+/).filter((w) => w && !FOOTBALL_TOKENS.has(w) && !/^\d+$/.test(w)).join("");
  for (const [re, to] of NAME_ALIAS) r = r.replace(re, to);
  return r;
};
const normKo = (s: string) => s.replace(/[a-zA-Z0-9.()]+/g, " ").replace(/\s+/g, "").trim(); // 한글만(위키데이터 ko 의 라틴 접두 "FC·SSC" strip)

// 최신 시즌 챔피언 옆에 예측·순위 바로가기를 노출할 리그 — 실제 /predictions·/standings 페이지가 있는 주요 리그.
const CHAMPION_QUICKLINK_LEAGUES = new Set([
  "NBA", "NHL",
  "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "MLS", "UCL", "UEL",
  "K_LEAGUE_1", "J1_LEAGUE",
]);

export default async function LeagueHistory({ league, leagueName }: { league: string; leagueName: string }) {
  const champions = DATA[league]?.champions ?? [];
  const showFlag = isNationalTeamLeague(league); // 국가대항(월드컵 등)만 국기 표시

  // 시즌별 최종 순위 아카이브 — 완료 시즌만 (현재 시즌은 순위 탭이 담당).
  // 라벨 문자열 내림차순 = 최신 시즌 먼저 ("2026-27" > "2025-26", "2026" > "2025").
  interface ArchRow { teamId: number | null; name: string; ko?: string; logo?: string | null; position: number; played: number; won: number; draw?: number; loss: number; gf?: number; ga?: number; points?: number; group?: string | null }
  let archivedSeasons: { seasonLabel: string; rows: ArchRow[] }[] = [];
  try {
    const currentLabel = seasonLabelFor(league, await resolveSeasonYear(league));
    const arch = await prisma.seasonStandingsArchive.findMany({
      where: { league, seasonLabel: { not: currentLabel } },
      orderBy: { seasonLabel: "desc" },
      select: { seasonLabel: true, rows: true },
    });
    archivedSeasons = arch.map((a) => {
      const rows = ((a.rows as unknown as ArchRow[]) ?? []).slice();
      rows.sort((x, y) => (x.group ?? "").localeCompare(y.group ?? "") || x.position - y.position);
      return { seasonLabel: a.seasonLabel, rows };
    }).filter((a) => a.rows.length > 0);
  } catch {
    // 아카이브 조회 실패는 역사 탭을 죽이지 않는다 — 우승 연표만 표시
  }

  // 시즌별 득점왕·도움왕 — LeagueLeader (rank 1). 축구형 카테고리만 (야구·농구는 카테고리 체계가 달라 제외).
  // 과거 시즌은 backfill-league-leaders 소급 + 롤오버 보존(clearFutureSeasons 교정)으로 쌓인다.
  let leaderSeasons: { season: string; goal?: { name: string; value: number }; assist?: { name: string; value: number } }[] = [];
  try {
    const rows = await prisma.leagueLeader.findMany({
      where: { league, rank: 1, category: { in: ["GOAL", "ASSIST"] } },
      select: { season: true, category: true, playerName: true, value: true },
    });
    const bySeason = new Map<string, { season: string; goal?: { name: string; value: number }; assist?: { name: string; value: number } }>();
    for (const r of rows) {
      let e = bySeason.get(r.season);
      if (!e) { e = { season: r.season }; bySeason.set(r.season, e); }
      const v = { name: r.playerName, value: r.value };
      if (r.category === "GOAL") e.goal = v;
      else e.assist = v;
    }
    leaderSeasons = [...bySeason.values()].sort((a, b) => b.season.localeCompare(a.season));
  } catch {
    // 조회 실패는 역사 탭을 죽이지 않는다
  }

  if (champions.length === 0 && archivedSeasons.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center space-y-2">
        <div className="text-3xl">🏆</div>
        <h3 className="text-base font-bold">역대 우승 기록 준비 중</h3>
        <p className="text-sm text-neutral-500 max-w-md mx-auto">{leagueName} 역대 우승 기록을 수집 중입니다. 곧 추가됩니다.</p>
      </div>
    );
  }

  // 클럽 리그면 우승팀 → logoUrl 매처. 한글명 정확일치(EPL·라리가) → 영문 정확/부분일치(세리에·분데스, 풀네임 vs 짧은 DB명) 순.
  // 매칭 안 되는 우승팀(강등·해체)은 DB 로고 자체가 없어 자연히 로고 없이 표시(graceful).
  // 우승팀(위키데이터 이름) → DB 팀 매칭. 로고 + 팀 id(팀명·로고 클릭 시 /teams/[id] 이동).
  type TeamHit = { id: number; logo: string | null };
  let teamOf: (ko: string, en: string) => TeamHit | null = () => null;
  if (!showFlag) {
    // 컵 대회(UCL/UEL 등) 우승팀은 여러 도메스틱 리그 소속(토트넘=EPL·아탈란타=세리에)이라 팀 풀을 빅리그까지 확장.
    const CUP = new Set(["UCL", "UEL", "UECL"]);
    const where = CUP.has(league)
      ? { league: { in: [league, "EPL", "LALIGA", "BUNDESLIGA", "SERIE_A", "LIGUE_1", "EREDIVISIE", "PRIMEIRA_LIGA", "SUPER_LIG", "MLS"] } }
      : { league };
    // 로고 없는 팀도 팀 페이지 링크를 위해 포함(로고는 graceful null).
    const teams = await prisma.team.findMany({ where, select: { id: true, name: true, logoUrl: true, league: true } });
    const koMap = new Map<string, TeamHit>();
    const enList: { norm: string; id: number; logo: string | null }[] = [];
    for (const t of teams) {
      const ko = normKo(toKoreanTeamName(t.name, t.league));
      if (ko && !koMap.has(ko)) koMap.set(ko, { id: t.id, logo: t.logoUrl });
      enList.push({ norm: normEn(t.name), id: t.id, logo: t.logoUrl });
    }
    teamOf = (ko, en) => {
      const k = koMap.get(normKo(ko));
      if (k) return k;
      const q = normEn(en);
      if (!q) return null;
      const exact = enList.find((t) => t.norm === q);
      if (exact) return { id: exact.id, logo: exact.logo };
      // 부분 매칭은 후보가 둘 이상 걸릴 수 있다 — "Inter Milan" 에는 Inter 와 AC Milan 이 함께
      // 걸리고(정규화 길이가 같아 DB 행 순서로 갈렸다), "RCD Espanyol de Barcelona" 류는 긴 쪽을
      // 고르면 남의 팀에 링크된다. 이름 앞머리에 걸린 후보를 먼저, 그다음 가장 짧은 후보를 고른다.
      const rank = (t: { norm: string }) => (q.startsWith(t.norm) || t.norm.startsWith(q) ? 0 : 1);
      let best: { norm: string; id: number; logo: string | null } | null = null;
      for (const t of enList) {
        if (t.norm.length < 4) continue;
        if (!q.includes(t.norm) && !t.norm.includes(q)) continue;
        if (!best || rank(t) < rank(best) || (rank(t) === rank(best) && t.norm.length < best.norm.length)) best = t;
      }
      return best ? { id: best.id, logo: best.logo } : null;
    };
  }

  // 최다 우승 집계 (+ ko→en, 로고 조회용)
  const counts = new Map<string, number>();
  const enByKo = new Map<string, string>();
  for (const c of champions) {
    counts.set(c.ko, (counts.get(c.ko) ?? 0) + 1);
    if (!enByKo.has(c.ko)) enByKo.set(c.ko, c.en);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  return (
    <div className="space-y-6">
      {champions.length > 0 && (
      <>
      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">최다 우승</h2>
        <div className="flex flex-wrap gap-2">
          {top.map(([club, n], i) => {
            const flag = showFlag ? fifaFlag(club) : "";
            const t = teamOf(club, enByKo.get(club) ?? club);
            return (
            <div
              key={club}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
                i === 0
                  ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-500/10 dark:ring-amber-500/40"
                  : "bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10"
              }`}
            >
              {i === 0 && <span className="text-sm">🏆</span>}
              {flag && <span className="text-sm" aria-hidden>{flag}</span>}
              {t ? (
                <Link href={`/teams/${t.id}`} className="flex items-center gap-2 min-w-0 hover:text-blue-600 dark:hover:text-blue-400 transition">
                  <TeamBadge logoUrl={t.logo} size={18} className="bg-white rounded-sm" />
                  <span className="font-bold text-sm">{club}</span>
                </Link>
              ) : (
                <>
                  <TeamBadge logoUrl={null} size={18} className="bg-white rounded-sm" />
                  <span className="font-bold text-sm">{club}</span>
                </>
              )}
              <span className={`text-sm tabular-nums font-black ${i === 0 ? "text-amber-600 dark:text-amber-400" : "text-neutral-500"}`}>
                {n}회
              </span>
            </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2.5">
        <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
          시즌별 우승 <span className="text-neutral-400 font-normal">({champions.length})</span>
        </h2>
        <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] overflow-hidden grid sm:grid-cols-2 dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          {champions.map((c, i) => {
            const flag = showFlag ? fifaFlag(c.en, c.ko) : "";
            const t = teamOf(c.ko, c.en);
            return (
            <div
              key={c.season + i}
              className="flex items-center gap-3 px-3.5 py-2 text-sm border-b border-neutral-100 dark:border-neutral-800/60 sm:[&:nth-last-child(2)]:border-b-0 [&:last-child]:border-b-0 odd:sm:border-r odd:sm:border-r-neutral-100 dark:odd:sm:border-r-neutral-800/60"
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-neutral-400">{c.season}</span>
              {flag && <span className="shrink-0" aria-hidden>{flag}</span>}
              {t ? (
                <Link href={`/teams/${t.id}`} className="flex items-center gap-2 min-w-0 hover:text-blue-600 dark:hover:text-blue-400 transition">
                  <TeamBadge logoUrl={t.logo} size={18} className="bg-white rounded-sm" />
                  <span className="font-medium truncate">{c.ko}</span>
                </Link>
              ) : (
                <>
                  <TeamBadge logoUrl={null} size={18} className="bg-white rounded-sm" />
                  <span className="font-medium truncate">{c.ko}</span>
                </>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                {c.article && (
                  <Link
                    href={`/articles/${c.article}`}
                    className="rounded-full bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-600 ring-1 ring-rose-500/20 transition hover:-translate-y-0.5 dark:text-rose-400"
                  >
                    우승 기록
                  </Link>
                )}
                {/* 최신 시즌 챔피언 옆에만 리그 예측·순위 바로가기 (현재 시즌 페이지). 예측·순위 페이지가 있는 리그 한정. */}
                {i === 0 && CHAMPION_QUICKLINK_LEAGUES.has(league) && (
                  <>
                    <Link href={`/predictions/${league}`} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 ring-1 ring-black/10 transition hover:-translate-y-0.5 dark:text-neutral-300 dark:ring-white/15">예측</Link>
                    <Link href={`/standings/${league}`} className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600 ring-1 ring-black/10 transition hover:-translate-y-0.5 dark:text-neutral-300 dark:ring-white/15">순위</Link>
                  </>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </section>

      </>
      )}

      {/* 시즌별 최종 순위 — SeasonStandingsArchive (완료 시즌, 최신 먼저·접힘) */}
      {archivedSeasons.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
            시즌별 최종 순위 <span className="text-neutral-400 font-normal">({archivedSeasons.length}시즌)</span>
          </h2>
          {archivedSeasons.map((s) => {
            const hasGroup = s.rows.some((r) => r.group);
            const hasGoals = s.rows.some((r) => r.gf != null);
            const hasPoints = s.rows.some((r) => r.points != null);
            const hasDraw = s.rows.some((r) => (r.draw ?? 0) > 0) || hasPoints; // 야구(무 거의 0·승점 없음)는 무 열 생략
            return (
              <details key={s.seasonLabel} className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
                <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none list-none marker:hidden hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                  <span className="font-bold text-sm">{s.seasonLabel} 시즌</span>
                  <span className="text-xs text-neutral-400">{s.rows.length}팀 · 펼치기</span>
                  {(() => {
                    const champ = s.rows.find((r) => r.position === 1 && !r.group);
                    return champ ? (
                      <span className="ml-auto flex items-center gap-1.5 text-xs text-neutral-500">
                        <span aria-hidden>🏆</span>
                        <TeamBadge logoUrl={champ.logo ?? null} size={16} className="bg-white rounded-sm" />
                        <span className="font-semibold">{champ.ko ?? toKoreanTeamName(champ.name, league)}</span>
                      </span>
                    ) : null;
                  })()}
                </summary>
                <div className="overflow-x-auto border-t border-neutral-100 dark:border-neutral-800/60">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] text-neutral-400">
                        <th className="px-3 py-2 text-left font-medium w-10">#</th>
                        {hasGroup && <th className="px-2 py-2 text-left font-medium">조</th>}
                        <th className="px-2 py-2 text-left font-medium">팀</th>
                        <th className="px-2 py-2 text-right font-medium">경기</th>
                        <th className="px-2 py-2 text-right font-medium">승</th>
                        {hasDraw && <th className="px-2 py-2 text-right font-medium">무</th>}
                        <th className="px-2 py-2 text-right font-medium">패</th>
                        {hasGoals && <th className="px-2 py-2 text-right font-medium hidden sm:table-cell">득실</th>}
                        {hasPoints && <th className="px-3 py-2 text-right font-medium">승점</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r, i) => (
                        <tr key={`${r.position}-${r.group ?? ""}-${i}`} className="border-t border-neutral-100 dark:border-neutral-800/60">
                          <td className="px-3 py-1.5 tabular-nums text-neutral-500">{r.position}</td>
                          {hasGroup && <td className="px-2 py-1.5 text-xs text-neutral-400">{r.group ?? ""}</td>}
                          <td className="px-2 py-1.5">
                            {r.teamId ? (
                              <Link href={`/teams/${r.teamId}`} className="flex items-center gap-2 min-w-0 hover:text-blue-600 dark:hover:text-blue-400 transition">
                                <TeamBadge logoUrl={r.logo ?? null} size={18} className="bg-white rounded-sm shrink-0" />
                                <span className="truncate font-medium">{r.ko ?? toKoreanTeamName(r.name, league)}</span>
                              </Link>
                            ) : (
                              <span className="flex items-center gap-2 min-w-0">
                                <TeamBadge logoUrl={r.logo ?? null} size={18} className="bg-white rounded-sm shrink-0" />
                                <span className="truncate font-medium">{r.ko ?? toKoreanTeamName(r.name, league)}</span>
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{r.played}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{r.won}</td>
                          {hasDraw && <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{r.draw ?? 0}</td>}
                          <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{r.loss}</td>
                          {hasGoals && (
                            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500 hidden sm:table-cell">
                              {r.gf != null && r.ga != null ? `${r.gf}-${r.ga}` : "-"}
                            </td>
                          )}
                          {hasPoints && <td className="px-3 py-1.5 text-right tabular-nums font-bold">{r.points ?? "-"}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </section>
      )}

      {/* 시즌별 득점왕·도움왕 — LeagueLeader rank 1 (시즌별 보존·소급 백필로 축적) */}
      {leaderSeasons.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
            시즌별 득점왕·도움왕 <span className="text-neutral-400 font-normal">({leaderSeasons.length}시즌)</span>
          </h2>
          <div className="rounded-2xl bg-white ring-1 ring-black/5 overflow-hidden dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-neutral-400">
                  <th className="px-3.5 py-2 text-left font-medium w-20">시즌</th>
                  <th className="px-2 py-2 text-left font-medium">득점왕</th>
                  <th className="px-3.5 py-2 text-left font-medium">도움왕</th>
                </tr>
              </thead>
              <tbody>
                {leaderSeasons.map((s) => (
                  <tr key={s.season} className="border-t border-neutral-100 dark:border-neutral-800/60">
                    <td className="px-3.5 py-2 text-xs tabular-nums text-neutral-400">{s.season}</td>
                    <td className="px-2 py-2">
                      {s.goal ? (
                        <>
                          <span className="font-medium">{s.goal.name}</span>{" "}
                          <span className="text-xs text-neutral-500 tabular-nums">{s.goal.value}골</span>
                        </>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2">
                      {s.assist ? (
                        <>
                          <span className="font-medium">{s.assist.name}</span>{" "}
                          <span className="text-xs text-neutral-500 tabular-nums">{s.assist.value}도움</span>
                        </>
                      ) : (
                        <span className="text-neutral-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-[11px] text-neutral-400">
        출처: 우승 연표는 위키데이터, 시즌별 최종 순위·득점왕은 자체 아카이브 · 일부 리그·최근 시즌은 데이터 공백이 있을 수 있습니다.
      </p>
    </div>
  );
}

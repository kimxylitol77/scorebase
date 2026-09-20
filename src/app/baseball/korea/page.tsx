// 야구 해외파 한국 선수 허브 — MLB·마이너리그 한국 선수 시즌 성적 + 소속 구단 다음/최근 경기 (축구 /soccer/korea 의 야구판).
// 명단: scripts/build-baseball-korea.ts → data/baseball-korea.json (MLB Stats API 출생국 스캔, 주간)
// 성적·최근 경기: src/lib/sports/baseball-korea.ts (MLB Stats API 런타임 3h 캐시, 레벨별 split)
// 다음·최근 경기: 우리 Match(league=MLB) — 메이저는 본인 팀, 마이너는 모구단 기준.
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import AmbientGlow from "@/components/AmbientGlow";
import TeamBadge from "@/components/TeamBadge";
import { toKoreanTeamName } from "@/lib/team-names";
import { SITE_URL } from "@/lib/site-url";
import { mlbHeadshotUrl } from "@/lib/sports/mlb-stats-api";
import { breadcrumbLd, datasetLd, jsonLdScript } from "@/lib/seo/jsonld";
import {
  BASEBALL_KOREA_PLAYERS, BASEBALL_KOREA_META, getBaseballKoreaSeasons, mlbClubOf, type BaseballKoreaPlayer, type PlayerSeason,
} from "@/lib/sports/baseball-korea";

export const revalidate = 3600;

const SEASON = BASEBALL_KOREA_META.season;

export const metadata: Metadata = {
  title: "해외파 한국 야구 선수 — MLB·마이너리그 시즌 성적 총정리",
  description:
    "이정후·김하성·송성문 등 MLB 와 마이너리그에서 뛰는 한국 선수 전원의 시즌 성적을 한 곳에. 레벨별 타율·홈런·OPS·ERA 와 최근 5경기, 소속 구단 다음 경기까지 한국어로 — 스코어베이스 야구.",
  keywords: ["해외파 야구 선수", "MLB 한국 선수", "이정후 성적", "김하성 기록", "송성문 MLB", "마이너리그 한국 선수", "코리안 메이저리거", "스코어베이스"],
  alternates: { canonical: `${SITE_URL}/baseball/korea` },
  openGraph: {
    title: "해외파 한국 야구 선수 — MLB·마이너리그 시즌 성적 총정리",
    description: "MLB·마이너리그 한국 선수 전원의 시즌 성적과 최근 5경기, 소속 구단 다음 경기.",
    url: `${SITE_URL}/baseball/korea`,
  },
};

function fmtKST(d: Date): string {
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}
function dday(d: Date): string {
  const kst = (x: Date) => Math.floor((x.getTime() + 9 * 3600_000) / 86400_000);
  const diff = kst(d) - kst(new Date());
  return diff === 0 ? "오늘" : diff === 1 ? "내일" : `D-${diff}`;
}
const POS_KO: Record<string, string> = { P: "투수", C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수", SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수", OF: "외야수", IF: "내야수", DH: "지명타자", TWP: "투타겸업" };
const LEVEL_TONE: Record<string, string> = {
  MLB: "bg-rose-500/10 text-rose-600 dark:text-rose-400 ring-rose-500/20",
  AAA: "bg-sky-500/10 text-sky-600 dark:text-sky-400 ring-sky-500/20",
  AA: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/20",
};
const levelCls = (lv: string) => LEVEL_TONE[lv] ?? "bg-neutral-500/10 text-neutral-600 dark:text-neutral-300 ring-neutral-500/20";
const isPitcher = (p: BaseballKoreaPlayer) => p.posType === "Pitcher" || p.pos === "P";
const clubKo = (name: string | null) => (name ? toKoreanTeamName(name, "MLB") || name : "");

/** 표에 보여줄 시즌 줄 — 현재 레벨 성적 우선, 없으면 상위 레벨 순서대로 첫 기록. */
function primaryLine(p: BaseballKoreaPlayer, s: PlayerSeason | undefined) {
  if (!s || s.levels.length === 0) return null;
  return s.levels.find((l) => l.sportId === p.sportId) ?? s.levels[0];
}

const playerHref = (p: BaseballKoreaPlayer) => (p.sportId === 1 ? `/players/${p.id}` : null);

function StatCells({ p, s }: { p: BaseballKoreaPlayer; s: PlayerSeason | undefined }) {
  const l = primaryLine(p, s);
  if (!l) return <td colSpan={5} className="px-2 py-2 text-xs text-neutral-400">이번 시즌 기록 없음</td>;
  if (isPitcher(p)) {
    const x = l.pitching;
    if (!x) return <td colSpan={5} className="px-2 py-2 text-xs text-neutral-400">등판 없음</td>;
    return (<>
      <td className="px-2 py-2 text-right tabular-nums">{x.g}<span className="text-neutral-400">경기</span></td>
      <td className="px-2 py-2 text-right tabular-nums">{x.ip}<span className="text-neutral-400">이닝</span></td>
      <td className="px-2 py-2 text-right tabular-nums font-bold">{x.era}<span className="font-normal text-neutral-400"> ERA</span></td>
      <td className="px-2 py-2 text-right tabular-nums">{x.whip}<span className="text-neutral-400"> WHIP</span></td>
      <td className="px-2 py-2 text-right tabular-nums">{x.so}K · {x.w}승 {x.l}패{x.sv ? ` ${x.sv}세` : ""}{x.hld ? ` ${x.hld}홀` : ""}</td>
    </>);
  }
  const x = l.hitting;
  if (!x) return <td colSpan={5} className="px-2 py-2 text-xs text-neutral-400">타석 없음</td>;
  return (<>
    <td className="px-2 py-2 text-right tabular-nums">{x.g}<span className="text-neutral-400">경기</span></td>
    <td className="px-2 py-2 text-right tabular-nums font-bold">{x.avg}</td>
    <td className="px-2 py-2 text-right tabular-nums">{x.hr}<span className="text-neutral-400">홈런</span></td>
    <td className="px-2 py-2 text-right tabular-nums">{x.rbi}<span className="text-neutral-400">타점</span></td>
    <td className="px-2 py-2 text-right tabular-nums">{x.ops}<span className="text-neutral-400"> OPS</span>{x.sb ? <span className="text-neutral-400"> · {x.sb}도루</span> : null}</td>
  </>);
}

type ClubTeam = { id: number; name: string; nameKo: string | null; logoUrl: string | null } | undefined;
function Table({ rows, title, note, seasons, clubOf }: { rows: BaseballKoreaPlayer[]; title: string; note?: string; seasons: Record<string, PlayerSeason>; clubOf: (p: BaseballKoreaPlayer) => ClubTeam }) {
return (
  <section className="space-y-2">
    <h2 className="text-sm font-bold text-neutral-900 dark:text-white">{title} <span className="text-neutral-400 font-normal">{rows.length}명</span></h2>
    {note && <p className="text-[11px] text-neutral-500">{note}</p>}
    <div className="overflow-x-auto rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 text-[11px] text-neutral-500 dark:bg-white/[0.03]">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">선수</th>
            <th className="px-2 py-2 text-left font-semibold">레벨 · 소속</th>
            <th className="px-2 py-2 text-left font-semibold">포지션</th>
            <th className="px-2 py-2 text-right font-semibold" colSpan={5}>{SEASON} 시즌 (현재 레벨)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {rows.map((p) => {
            const s = seasons[String(p.id)];
            const href = playerHref(p);
            const club = clubOf(p);
            return (
              <tr key={p.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.04]">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mlbHeadshotUrl(p.id)} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover bg-neutral-100 dark:bg-neutral-800" loading="lazy" />
                    <div className="min-w-0">
                      <div className="font-bold truncate">{href ? <Link href={href} className="hover:underline underline-offset-4">{p.nameKo}</Link> : p.nameKo}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{p.nameEn}{p.age ? ` · ${p.age}세` : ""}</div>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ${levelCls(p.level)}`}>{p.level}</span>
                    <TeamBadge logoUrl={club?.logoUrl} size={16} />
                    <span className="truncate text-xs">{p.sportId === 1 ? clubKo(p.team.name) : `${p.team.name}${p.team.parentOrg ? ` (${clubKo(p.team.parentOrg)})` : ""}`}</span>
                  </div>
                  {p.onFortyMan && p.sportId !== 1 && <div className="text-[10px] text-neutral-400 mt-0.5">40인 로스터</div>}
                </td>
                <td className="px-2 py-2 text-xs text-neutral-600 dark:text-neutral-300">{p.pos ? (POS_KO[p.pos] ?? p.pos) : "-"}</td>
                <StatCells p={p} s={s} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
);
}

export default async function BaseballKoreaPage() {
  const players = BASEBALL_KOREA_PLAYERS;
  const seasons = await getBaseballKoreaSeasons();
  // MLB 구단 ↔ 우리 Team(league=MLB) — MLB API 팀명과 Team.name 이 같은 표기
  const clubNames = [...new Set(players.map(mlbClubOf).filter((x): x is string => !!x))];
  const teams = await prisma.team.findMany({ where: { league: "MLB", name: { in: clubNames } }, select: { id: true, name: true, nameKo: true, logoUrl: true } });
  const teamByName = new Map(teams.map((t) => [t.name, t]));
  const ourIds = teams.map((t) => t.id);
  const now = new Date();
  const sel = { id: true, league: true, startTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, homeTeam: { select: { name: true, nameKo: true, logoUrl: true } }, awayTeam: { select: { name: true, nameKo: true, logoUrl: true } } } as const;
  const [upcoming, finished] = ourIds.length
    ? await Promise.all([
        prisma.match.findMany({ where: { league: "MLB", status: "SCHEDULED", startTime: { gte: now }, OR: [{ homeTeamId: { in: ourIds } }, { awayTeamId: { in: ourIds } }] }, orderBy: { startTime: "asc" }, take: 120, select: sel }),
        prisma.match.findMany({ where: { league: "MLB", status: "FINISHED", startTime: { lte: now }, OR: [{ homeTeamId: { in: ourIds } }, { awayTeamId: { in: ourIds } }] }, orderBy: { startTime: "desc" }, take: 120, select: sel }),
      ])
    : [[], []];
  type M = (typeof upcoming)[number] | (typeof finished)[number];
  const nextByTeam = new Map<number, M>();
  for (const m of upcoming) for (const id of [m.homeTeamId, m.awayTeamId]) if (id != null && ourIds.includes(id) && !nextByTeam.has(id)) nextByTeam.set(id, m);
  const lastByTeam = new Map<number, M>();
  for (const m of finished) for (const id of [m.homeTeamId, m.awayTeamId]) if (id != null && ourIds.includes(id) && !lastByTeam.has(id)) lastByTeam.set(id, m);
  const teamKo = (t: { name: string; nameKo: string | null }) => toKoreanTeamName(t.name, "MLB") || t.nameKo || t.name;
  const clubTeam = (p: BaseballKoreaPlayer) => { const c = mlbClubOf(p); return c ? teamByName.get(c) : undefined; };

  const majors = players.filter((p) => p.sportId === 1);
  const minors = players.filter((p) => p.sportId !== 1);
  const featured = [...majors, ...minors.filter((p) => p.onFortyMan)];
  // 최근 경기 — 구단 기준 중복 제거, 최신순
  const recentRows: Array<{ p: BaseballKoreaPlayer; m: M }> = [];
  const seenM = new Set<number>();
  for (const p of featured) {
    const t = clubTeam(p); const m = t ? lastByTeam.get(t.id) : undefined;
    if (m && !seenM.has(m.id)) { seenM.add(m.id); recentRows.push({ p, m }); }
  }
  recentRows.sort((a, b) => b.m.startTime.getTime() - a.m.startTime.getTime());

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd([{ name: "홈", path: "/" }, { name: "야구", path: "/baseball" }, { name: "해외파 한국 야구 선수", path: "/baseball/korea" }])) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(datasetLd({ name: `해외파 한국 야구 선수 ${SEASON} 시즌 성적`, description: "MLB·마이너리그 한국 선수 시즌 성적과 최근 경기", path: "/baseball/korea" })) }} />
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 dark:text-rose-400">Baseball · Korea abroad</p>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">해외파 한국 야구 선수</h1>
        <p className="text-sm text-neutral-500 break-keep">
          MLB {majors.length}명 · 마이너리그 {minors.length}명 · {SEASON} 시즌 성적과 최근 5경기, 소속 구단 다음 경기. 명단은 MLB 공식 데이터의 출생국 기준으로 매주 갱신됩니다.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/soccer/korea" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">축구 해외파</Link>
          <Link href="/golf/korea" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">골프 한국 선수</Link>
          <Link href="/baseball" className="rounded-full border border-neutral-200 dark:border-neutral-800 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-white/[0.06]">야구 허브</Link>
        </div>
      </header>

      {/* 주요 선수 — 메이저 + 40인 로스터 */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold text-neutral-900 dark:text-white">주요 선수 <span className="font-normal text-neutral-400">메이저리그 · 40인 로스터</span></h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {featured.map((p) => {
            const s = seasons[String(p.id)];
            const l = primaryLine(p, s);
            const club = clubTeam(p);
            const m = club ? nextByTeam.get(club.id) : undefined;
            const href = playerHref(p);
            const cells = isPitcher(p)
              ? [{ l: "경기", v: l?.pitching?.g }, { l: "ERA", v: l?.pitching?.era }, { l: "이닝", v: l?.pitching?.ip }, { l: "탈삼진", v: l?.pitching?.so }]
              : [{ l: "경기", v: l?.hitting?.g }, { l: "타율", v: l?.hitting?.avg }, { l: "홈런", v: l?.hitting?.hr }, { l: "OPS", v: l?.hitting?.ops }];
            return (
              <div key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mlbHeadshotUrl(p.id)} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover bg-neutral-100 ring-1 ring-neutral-200 dark:bg-neutral-800 dark:ring-neutral-800" loading="lazy" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-neutral-900 dark:text-white">
                      {href ? <Link href={href} className="hover:underline underline-offset-4">{p.nameKo}</Link> : p.nameKo}
                      <span className="ml-1.5 align-middle text-[10px] font-bold text-neutral-400">{p.pos ? (POS_KO[p.pos] ?? p.pos) : ""}</span>
                    </p>
                    <p className="flex items-center gap-1.5 truncate text-xs text-neutral-500">
                      <TeamBadge logoUrl={club?.logoUrl} size={16} />
                      <span className="truncate">{p.sportId === 1 ? clubKo(p.team.name) : `${p.team.name} · ${clubKo(p.team.parentOrg)} 산하`}</span>
                    </p>
                  </div>
                  <span className={`ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-black ring-1 ${levelCls(p.level)}`}>{p.level}</span>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {cells.map((c) => (
                    <div key={c.l}>
                      <p className="text-base font-black tabular-nums text-neutral-900 dark:text-white">{c.v ?? "-"}</p>
                      <p className="text-[10px] text-neutral-500">{c.l}</p>
                    </div>
                  ))}
                </div>
                {/* 같은 레벨 안에서 팀을 옮긴 선수는 합산 split 의 팀명이 옛 팀일 수 있어 현재 레벨이면 팀명을 생략 */}
                <p className="mt-1.5 text-[10px] text-neutral-400">{SEASON} · {l ? `${l.level}${l.sportId !== p.sportId && l.team ? ` · ${l.team}` : ""}` : "시즌 기록 없음"}</p>
                {s && s.recent.length > 0 && (
                  <ul className="mt-2 space-y-0.5 border-t border-neutral-100 pt-2 text-[11px] text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
                    {s.recent.slice(0, 3).map((g) => (
                      <li key={g.date + g.opp} className="flex gap-2 truncate">
                        <span className="w-10 shrink-0 tabular-nums text-neutral-400">{g.date.slice(5).replace("-", "/")}</span>
                        <span className="w-24 shrink-0 truncate text-neutral-500">{g.home ? "vs" : "@"} {clubKo(g.opp) || g.opp}</span>
                        <span className="truncate">{g.line}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {m && (
                  <p className="mt-2 truncate border-t border-neutral-100 pt-2 text-[11px] text-neutral-500 dark:border-neutral-800">
                    다음 {teamKo(m.homeTeam)} vs {teamKo(m.awayTeam)}
                    <span className="ml-1.5 font-semibold text-sky-600 dark:text-sky-400">{dday(m.startTime)} {fmtKST(m.startTime)}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <Table rows={majors} title="메이저리그" seasons={seasons} clubOf={clubTeam} />
      <Table rows={minors} title="마이너리그" seasons={seasons} clubOf={clubTeam} note="현재 소속 레벨의 시즌 성적입니다. 같은 시즌에 여러 레벨을 오간 선수는 현재 레벨 기록만 표시합니다." />

      {recentRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-neutral-900 dark:text-white">소속 구단 최근 경기</h2>
          <ul className="divide-y divide-neutral-100 overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
            {recentRows.slice(0, 8).map(({ p, m }) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="w-16 shrink-0 truncate text-xs font-semibold text-sky-600 dark:text-sky-400">{p.nameKo}</span>
                <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-neutral-700 dark:text-neutral-300">
                  <span className="truncate">{teamKo(m.homeTeam)}</span>
                  <TeamBadge logoUrl={m.homeTeam.logoUrl} size={16} />
                  <span className="shrink-0 font-black tabular-nums text-neutral-900 dark:text-white">{m.homeScore ?? "-"}-{m.awayScore ?? "-"}</span>
                  <TeamBadge logoUrl={m.awayTeam.logoUrl} size={16} />
                  <span className="truncate">{teamKo(m.awayTeam)}</span>
                </span>
                <span className="shrink-0 text-[11px] text-neutral-400">MLB · {fmtKST(m.startTime)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-xs text-neutral-500">
        출처 MLB Stats API(statsapi.mlb.com). 명단 갱신 {BASEBALL_KOREA_META.updatedAt.slice(0, 10)}. NPB 한국 선수는 공식 국적 데이터가 없어 이 페이지에 포함하지 않습니다.
      </p>
    </main>
  );
}

// NbaViews (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import Link from "next/link";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { fetchNbaPlayer } from "@/lib/sports/balldontlie";
import {
  fetchNbaEspnStats,
  fetchNbaEspnSeasons,
  fetchNbaEspnSplits,
  fetchNbaEspnAwards,
  type NbaSeasonRow,
  type NbaSplits,
  type NbaSplitRow,
} from "@/lib/sports/espn-nba-player";
import { toEnglishTeamName } from "@/lib/i18n/en";

import { lookupNbaPlayer, lookupNbaPlayerByBdlId } from "@/lib/sports/nba-players";
import ShareCardButton from "@/components/en/ShareCardButton";
import { ChevronLeft, ExternalLink } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import PlayerTabs from "../../../players/[pid]/PlayerTabs";
import NbaSeasonOverview from "./NbaSeasonOverview";
import KboPercentileSection from "@/components/en/players/KboPercentileSection";
import { getNbaPercentiles } from "@/lib/sports/nba-percentile";
import { NbaTrendChart } from "./NbaTrendChart";

/* ---------- 공통 헬퍼 ---------- */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        accent
          ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30"
          : "bg-neutral-50 dark:bg-white/[0.04]"
      }`}
    >
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const n1 = (x: number) => x.toFixed(1);
const pc = (x: number) => `${x.toFixed(1)}%`; // ESPN % 는 이미 0~100

// NBA 선수 연봉(USD) → "$52.6M · ₩726억". TheSports player.salary.
function fmtUsdKrw(usd: number): string {
  const eok = (usd * 1380) / 1e8;
  const krw = eok >= 10000 ? `${(eok / 10000).toFixed(2)}Group` : `${Math.round(eok).toLocaleString()}00 million KRW`;
  return `$${(usd / 1e6).toFixed(1)}M · ₩${krw}`;
}

// teamSlug("los-angeles-lakers") → "Los Angeles Lakers" (DB Team.name 매칭 키).
function slugToFull(slug: string): string {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
// teamSlug → 한글 팀명(없으면 title-case 영문).
function slugToTeam(slug: string): string {
  if (!slug) return "—";
  const full = slugToFull(slug);
  return toEnglishTeamName(full) || full;
}
// 팀명 정규화 — 소문자+영숫자만. BDL fullName·DB name·ESPN slug 표기차(LA/La·하이픈·공백) 흡수.
const normTeam = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type TeamInfo = { id: number; logo: string | null; name: string };

function NbaTeamCell({ slug, info }: { slug: string; info?: TeamInfo }) {
  if (!slug) return <>—</>;
  const ko = info ? toEnglishTeamName(info.name) || info.name : slugToTeam(slug);
  const inner = (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      {info?.logo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={info.logo} alt="" className="w-4 h-4 object-contain shrink-0" />
      )}
      <span className="truncate">{ko}</span>
    </span>
  );
  return info ? (
    <Link href={`/teams/${info.id}`} className="hover:text-neutral-900 dark:hover:text-white transition">
      {inner}
    </Link>
  ) : (
    inner
  );
}

type Tab = { key: string; label: string; content: ReactNode };
const tabsOf = (arr: (Tab | false | null | undefined)[]): Tab[] =>
  arr.filter((t): t is Tab => Boolean(t));

const hasNbaSplits = (s: NbaSplits): boolean =>
  Boolean(s.home || s.away || s.wins || s.losses || s.byMonth.length > 0);

/* ---------- 시즌기록 탭 ---------- */

function Th({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <th className={`px-2.5 py-2 text-right font-medium whitespace-nowrap ${accent ? "text-blue-600 dark:text-blue-400" : ""}`}>
      {children}
    </th>
  );
}
function Td({ children, accent, muted }: { children: ReactNode; accent?: boolean; muted?: boolean }) {
  return (
    <td className={`px-2.5 py-2 text-right tabular-nums whitespace-nowrap ${accent ? "font-bold" : ""} ${muted ? "text-neutral-400" : ""}`}>
      {children}
    </td>
  );
}

function SeasonCells({ r }: { r: NbaSeasonRow }) {
  return (
    <>
      <Td muted>{r.gp || "—"}</Td>
      <Td muted>{n1(r.min)}</Td>
      <Td accent>{n1(r.pts)}</Td>
      <Td>{n1(r.reb)}</Td>
      <Td>{n1(r.ast)}</Td>
      <Td muted>{n1(r.stl)}</Td>
      <Td muted>{n1(r.blk)}</Td>
      <Td>{pc(r.fgPct)}</Td>
      <Td>{pc(r.fg3Pct)}</Td>
      <Td muted>{pc(r.ftPct)}</Td>
    </>
  );
}

function NbaSeasonTable({ rows, career, teamMap }: { rows: NbaSeasonRow[]; career: NbaSeasonRow | null; teamMap: Map<string, TeamInfo> }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500">No season records.</p>;
  const ordered = rows.slice().reverse(); // 최신 시즌이 위로
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="px-3 py-2 text-left font-medium sticky left-0 bg-neutral-50 dark:bg-white/[0.04]">Season</th>
            <th className="px-2.5 py-2 text-left font-medium whitespace-nowrap">Team</th>
            <Th>GP</Th>
            <Th>MIN</Th>
            <Th accent>PTS</Th>
            <Th>REB</Th>
            <Th>AST</Th>
            <Th>STL</Th>
            <Th>BLK</Th>
            <Th>FG%</Th>
            <Th>3P%</Th>
            <Th>FT%</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {ordered.map((r, i) => (
            <tr key={`${r.year}-${r.teamSlug}-${i}`}>
              <td className="px-3 py-2 text-left font-semibold tabular-nums sticky left-0 bg-white dark:bg-neutral-900">{r.label}</td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-500 whitespace-nowrap max-w-[160px]">
                <NbaTeamCell slug={r.teamSlug} info={teamMap.get(normTeam(r.teamSlug))} />
              </td>
              <SeasonCells r={r} />
            </tr>
          ))}
          {career && (
            <tr className="bg-neutral-50 dark:bg-neutral-900/50 font-semibold">
              <td className="px-3 py-2 text-left sticky left-0 bg-neutral-50 dark:bg-neutral-900/50">Career</td>
              <td className="px-2.5 py-2 text-left text-xs text-neutral-400">Average</td>
              <SeasonCells r={career} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 스플릿 탭 ---------- */

function SplitCard({ row }: { row: NbaSplitRow | null }) {
  if (!row) return null;
  const cells = [
    { k: "PTS", val: n1(row.pts) },
    { k: "REB", val: n1(row.reb) },
    { k: "AST", val: n1(row.ast) },
  ];
  return (
    <div className="rounded-xl bg-white p-3.5 ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
      <div className="text-xs font-bold text-neutral-500 mb-2.5">
        {row.label} <span className="font-normal text-neutral-400">{row.gp}G</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c, i) => (
          <div key={c.k}>
            <div className="text-[10px] text-neutral-400">{c.k}</div>
            <div className={`text-base font-black tabular-nums ${i === 0 ? "text-blue-600 dark:text-blue-400" : ""}`}>{c.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NbaSplitsView({ splits }: { splits: NbaSplits }) {
  const hasHA = splits.home || splits.away;
  const hasWL = splits.wins || splits.losses;
  return (
    <div className="space-y-5">
      {hasHA && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">Home / away</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.home} />
            <SplitCard row={splits.away} />
          </div>
        </div>
      )}
      {hasWL && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">W / L</div>
          <div className="grid grid-cols-2 gap-3">
            <SplitCard row={splits.wins} />
            <SplitCard row={splits.losses} />
          </div>
        </div>
      )}
      {splits.byMonth.length > 0 && (
        <div>
          <div className="text-xs font-bold text-neutral-500 mb-2">By month</div>
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Month</th>
                  <th className="px-3 py-2 text-right font-medium">PTS</th>
                  <th className="px-3 py-2 text-right font-medium">REB</th>
                  <th className="px-3 py-2 text-right font-medium">AST</th>
                  <th className="px-3 py-2 text-right font-medium">FG%</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5 dark:divide-white/5">
                {splits.byMonth.map((r) => (
                  <tr key={r.label}>
                    <td className="px-3 py-2 text-left font-semibold">{r.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold">{n1(r.pts)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{n1(r.reb)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{n1(r.ast)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{pc(r.fgPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- 경기 탭 ---------- */

type RecentGame = Awaited<ReturnType<typeof fetchNbaEspnStats>>["recent"][number];

// 최근 경기 → 우리 매치 상세(/live/NBA) 링크.
// 1순위: ESPN eventId = 우리 externalId 직접 조인(espn 소스 매치, 실측 401869393 일치).
// 폴백: 스코어 쌍 유니크 매칭(BDL/ts 소스 매치) — 충돌 시 링크 생략.
async function nbaGameHrefs(games: RecentGame[]): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const withGame = games.filter((g) => g.game);
  if (!withGame.length) return out;
  let rows: { externalId: string; homeScore: number | null; awayScore: number | null }[] = [];
  try {
    rows = await prisma.match.findMany({
      where: {
        league: "NBA",
        OR: [
          { externalId: { in: withGame.map((g) => String(g.id)) } },
          { startTime: { gte: new Date(Date.now() - 400 * 86400e3) }, status: "FINISHED" },
        ],
      },
      select: { externalId: true, homeScore: true, awayScore: true },
    });
  } catch {
    return out;
  }
  const byExt = new Map(rows.map((m) => [m.externalId, m]));
  for (const g of withGame) {
    if (byExt.has(String(g.id))) {
      out.set(g.id, `/live/NBA/${g.id}`);
      continue;
    }
    const cands = rows.filter(
      (m) => m.homeScore === g.game!.homeTeamScore && m.awayScore === g.game!.visitorTeamScore,
    );
    if (cands.length === 1) out.set(g.id, `/live/NBA/${cands[0].externalId}`);
  }
  return out;
}

function NbaRecentGames({ games, hrefs }: { games: RecentGame[]; hrefs: Map<number, string> }) {
  if (games.length === 0) return <p className="text-sm text-neutral-500">No game records.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Date</th>
            <th className="text-left px-2 py-2 font-medium">Match</th>
            <th className="text-right px-2 py-2 font-medium">MIN</th>
            <th className="text-right px-2 py-2 font-medium">PTS</th>
            <th className="text-right px-2 py-2 font-medium">REB</th>
            <th className="text-right px-2 py-2 font-medium">AST</th>
            <th className="text-right px-2 py-2 font-medium">STL</th>
            <th className="text-right px-3 py-2 font-medium">BLK</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g) => (
            <tr key={g.id}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.game?.date?.slice(0, 10) ?? "—"}</td>
              <td className="px-2 py-2 truncate">
                {g.game ? (
                  hrefs.get(g.id) ? (
                    <Link href={hrefs.get(g.id)!} className="hover:underline">
                      {g.game.visitorTeam.abbr} {g.game.visitorTeamScore} - {g.game.homeTeamScore} {g.game.homeTeam.abbr}
                      <ExternalLink className="inline-block w-3 h-3 ml-1 -mt-0.5 text-neutral-400" aria-hidden />
                    </Link>
                  ) : (
                    `${g.game.visitorTeam.abbr} ${g.game.visitorTeamScore} - ${g.game.homeTeamScore} ${g.game.homeTeam.abbr}`
                  )
                ) : "—"}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.min}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.pts}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.reb}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.ast}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.stl}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.blk}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- 부상이력 (PlayerEvent nba-injury/nba-return) ---------- */

interface InjuryRow {
  id: string;
  type: string;
  occurredAt: Date;
  title: string;
  detail: unknown;
}

const fmtInjDate = (d: Date) =>
  `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;

function NbaInjuryHistory({ rows }: { rows: InjuryRow[] }) {
  return (
    <section className="space-y-2">
      {rows.map((r) => {
        const d = (r.detail ?? {}) as { status?: string };
        const isReturn = r.type === "RETURN";
        return (
          <div
            key={r.id}
            className={`flex items-center gap-3 rounded-lg px-4 py-3 ring-1 ${
              isReturn
                ? "bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-200 dark:ring-emerald-500/30"
                : "bg-rose-50 dark:bg-rose-500/10 ring-rose-200 dark:ring-rose-500/30"
            }`}
          >
            <span
              className={`text-xs font-semibold tabular-nums shrink-0 ${
                isReturn ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
              }`}
            >
              {fmtInjDate(r.occurredAt)}
            </span>
            <span className="text-sm">
              {r.title}
              {!isReturn && d.status ? <span className="ml-2 text-xs text-neutral-500">{d.status}</span> : null}
            </span>
          </div>
        );
      })}
      <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
        Built from weekly snapshots of the ESPN injury list. A return is inferred from the week the name disappears.
      </p>
    </section>
  );
}

interface TxRow {
  id: string;
  date: Date;
  category: string;
  teamName: string | null;
  descriptionKo: string | null;
  description: string;
}

const TX_LABEL: Record<string, { label: string; cls: string }> = {
  trade: { label: "Trade", cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  signing: { label: "Contract", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  short_term: { label: "Short-term deal", cls: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300" },
  waive: { label: "Released", cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  staff: { label: "Coaching & front office", cls: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  other: { label: "Other", cls: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400" },
};

/** 이동 이력 — SportsTransaction(ESPN 트랜잭션). /transactions/nba 피드의 이 선수분만. */
function NbaTransactionHistory({ rows }: { rows: TxRow[] }) {
  return (
    <section className="space-y-2">
      {rows.map((r) => {
        const c = TX_LABEL[r.category] ?? TX_LABEL.other;
        const koTeam = r.teamName ? toEnglishTeamName(r.teamName) || r.teamName : null;
        return (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-lg bg-neutral-50 px-4 py-3 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10"
          >
            <span className="shrink-0 text-xs font-semibold tabular-nums text-neutral-500">{fmtInjDate(r.date)}</span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${c.cls}`}>{c.label}</span>
                {koTeam && <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">{koTeam}</span>}
              </div>
              <p className="text-sm leading-snug">{r.descriptionKo || r.description}</p>
            </div>
          </div>
        );
      })}
      <p className="mt-1 text-[11px] leading-relaxed text-neutral-400">
        ESPN transaction feed. The original text is at{" "}
        <Link href="/transactions/nba" className="text-blue-600 hover:underline dark:text-blue-400">
          NBA transactions
        </Link>{" "}
        can be seen on the same page.
      </p>
    </section>
  );
}

/* ============================================================
 * 메인 뷰
 * ==========================================================*/

export async function NbaPlayerView({ pid }: { pid: string }) {
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const now = new Date();
  const m = now.getUTCMonth() + 1;
  const season = m >= 9 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

  // BDL 은 분당 5회 한도라 429 가 잦음 — 실패 시 로컬 로스터 인덱스(bdlId 역조회)로
  // 헤더를 구성해 렌더. 두 소스 모두 없을 때만 404.
  const profile = await fetchNbaPlayer(id);
  const local = profile ? null : lookupNbaPlayerByBdlId(id);
  if (!profile && !local) notFound();
  const fullName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : local!.name;
  const nameKo = fullName || fullName;
  const teamName = profile?.team?.fullName ?? local?.team ?? null;
  const teamKo = teamName ? toEnglishTeamName(teamName) || teamName : "";
  const tsp = lookupNbaPlayer(fullName); // ESPN headshot + TheSports 프로필
  // ts 세부 포지션(SG/PF) 우선 — BDL/ESPN 은 G/F 코스만
  const position = tsp?.tsPos || profile?.position || local?.pos || null;
  const jersey = profile?.jerseyNumber ?? (local?.number != null ? String(local.number) : null);
  const nameParts = fullName.split(/\s+/).filter(Boolean);
  const initials = `${nameParts[0]?.[0] ?? ""}${nameParts.length > 1 ? nameParts[nameParts.length - 1][0] : ""}`;
  const photo = tsp?.photo;
  const espnId = tsp?.espnId;

  // 통계는 BDL plan 401 → 무료 ESPN(시즌평균·시즌별·스플릿·수상)으로 우회.
  const [{ avg, recent }, { seasons, career }, splits, awards] = await Promise.all([
    espnId ? fetchNbaEspnStats(espnId) : Promise.resolve({ avg: null, recent: [] }),
    espnId ? fetchNbaEspnSeasons(espnId) : Promise.resolve({ seasons: [], career: null }),
    espnId ? fetchNbaEspnSplits(espnId) : Promise.resolve(null),
    espnId ? fetchNbaEspnAwards(espnId) : Promise.resolve([]),
  ]);

  // 리그 백분위 — espnId 정확 매칭 (규정 미충족·표본 부족이면 null → 섹션 생략)
  const percentiles = espnId ? await getNbaPercentiles(espnId).catch(() => null) : null;

  // 부상이력 — PlayerEvent(playerId=espnId, id prefix "nba-"). collect-player-events cron 이 적재.
  const injuryRows = espnId
    ? await prisma.playerEvent.findMany({
        where: { playerId: espnId, id: { startsWith: "nba-" } },
        orderBy: { occurredAt: "desc" },
        take: 40,
        select: { id: true, type: true, occurredAt: true, title: true, detail: true },
      })
    : [];

  // 이동 이력 — SportsTransaction(league=NBA, playerName=ESPN 표기).
  // BDL 이름과 로스터 인덱스 이름이 다를 수 있어(Jr. 등) 둘 다로 찾는다.
  const rosterName = lookupNbaPlayerByBdlId(id)?.name;
  const txNames = [...new Set([fullName, rosterName].filter((v): v is string => Boolean(v)))];
  const txRows = await prisma.sportsTransaction.findMany({
    where: { league: "NBA", playerName: { in: txNames } },
    orderBy: { date: "desc" },
    take: 30,
    select: { id: true, date: true, category: true, teamName: true, descriptionKo: true, description: true },
  });

  // 시즌기록 팀 로고/링크 — DB NBA Team(영문 name 매칭)으로 logoUrl·팀페이지 id.
  const nbaTeams = await prisma.team.findMany({ where: { league: "NBA" }, select: { id: true, name: true, logoUrl: true } });
  const teamMap = new Map<string, TeamInfo>(nbaTeams.map((t) => [normTeam(t.name), { id: t.id, logo: t.logoUrl, name: t.name }]));
  const currentTeam = teamName ? teamMap.get(normTeam(teamName)) : undefined;

  const birth = tsp?.birthday ? new Date(tsp.birthday * 1000) : null;
  // 서버 컴포넌트 — 요청(또는 revalidate)마다 1회 렌더라 클라이언트 렌더 순수성 규칙 대상이 아니다.
  // eslint-disable-next-line react-hooks/purity
  const age = birth ? Math.floor((Date.now() - birth.getTime()) / 31557600000) : null;
  const birthStr = birth
    ? `${birth.getUTCFullYear()}.${String(birth.getUTCMonth() + 1).padStart(2, "0")}.${String(birth.getUTCDate()).padStart(2, "0")}`
    : null;

  const overview = (
    <>
      {avg ? (
        <NbaSeasonOverview avg={avg} season={season} />
      ) : (
        <p className="text-sm text-neutral-500">{season} No season statistics.</p>
      )}

      {percentiles && <KboPercentileSection data={percentiles} />}

      {career && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">Career avg</h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="PTS" value={n1(career.pts)} accent />
            <Stat label="REB" value={n1(career.reb)} accent />
            <Stat label="AST" value={n1(career.ast)} accent />
            <Stat label="STL" value={n1(career.stl)} />
            <Stat label="BLK" value={n1(career.blk)} />
            <Stat label="GP" value={String(career.gp)} />
            <Stat label="FG%" value={pc(career.fgPct)} />
            <Stat label="3P%" value={pc(career.fg3Pct)} />
            <Stat label="FT%" value={pc(career.ftPct)} />
          </div>
        </section>
      )}

      {career && career.min > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            Per 36 minutes <span className="text-neutral-400 normal-case tracking-normal">per 36 MIN</span>
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
            <Stat label="PTS" value={n1((career.pts / career.min) * 36)} accent />
            <Stat label="REB" value={n1((career.reb / career.min) * 36)} accent />
            <Stat label="AST" value={n1((career.ast / career.min) * 36)} accent />
            <Stat label="STL" value={n1((career.stl / career.min) * 36)} />
            <Stat label="BLK" value={n1((career.blk / career.min) * 36)} />
          </div>
          <p className="text-[11px] text-neutral-400 mt-2 leading-relaxed">
            Production scaled to 36 minutes, so bench players and role players can be compared without minutes distorting the picture.
          </p>
        </section>
      )}

      <NbaTrendChart rows={seasons} />

      {awards.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">Awards</h2>
          <div className="flex flex-wrap gap-2">
            {awards.map((a) => (
              <span
                key={a.name}
                className="px-2.5 py-1 rounded-md text-sm border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300"
              >
                {a.name}
                {a.count && a.count !== "1x" ? ` ${a.count}` : ""}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );

  return (
    <article className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <header className="space-y-3">
        <Link
          href="/leagues/NBA"
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ChevronLeft className="h-3 w-3" aria-hidden /> NBA
        </Link>
        <div className="flex items-center gap-4 flex-wrap">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={nameKo} className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 object-cover object-top" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-neutral-100 dark:bg-neutral-800 shrink-0 flex items-center justify-center text-2xl font-bold text-neutral-400">
              {initials}
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{nameKo}</h1>
              {position && (
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                  {position}
                </span>
              )}
              {jersey && <span className="text-sm text-neutral-500">#{jersey}</span>}
              {age != null && <span className="text-sm text-neutral-500">{age}</span>}
              <ShareCardButton />
            </div>
            <div className="text-sm text-neutral-500">
              {teamKo ? (
                <>
                  {currentTeam ? (
                    <Link href={`/teams/${currentTeam.id}`} className="font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white transition">
                      {teamKo}
                    </Link>
                  ) : (
                    teamKo
                  )}
                  {" · "}
                </>
              ) : ""}
              {tsp?.heightCm
                ? `${tsp.heightCm}cm${tsp.weightKg ? ` · ${tsp.weightKg}kg` : ""}`
                : `${profile?.height ? `${profile.height}` : ""}${profile?.weight ? ` · ${profile.weight} lbs` : ""}`}
              {profile?.country ? ` · ${profile.country}` : ""}
              {tsp?.city ? ` · born ${tsp.city}` : ""}
            </div>
            {tsp?.salary ? (
              <div className="text-sm">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Salary {fmtUsdKrw(tsp.salary)}</span>
                {tsp.careerAge ? <span className="text-neutral-400"> · NBA {tsp.careerAge}yr</span> : null}
              </div>
            ) : null}
            <div className="text-[11px] text-neutral-400">
              BALLDONTLIE · ESPN · TheSports · {season} Season
              {profile?.draftYear ? ` · ${profile.draftYear} draft ${profile.draftRound}R ${profile.draftNumber}Rank` : ""}
              {birthStr ? ` · ${birthStr} born` : ""}
            </div>
          </div>
        </div>
      </header>

      <PlayerTabs
        tabs={tabsOf([
          { key: "overview", label: "Overview", content: overview },
          seasons.length > 0 && {
            key: "seasons",
            label: "Season log",
            content: <NbaSeasonTable rows={seasons} career={career} teamMap={teamMap} />,
          },
          recent.length > 0 && {
            key: "games",
            label: "G",
            content: <NbaRecentGames games={recent} hrefs={await nbaGameHrefs(recent)} />,
          },
          splits && hasNbaSplits(splits) && {
            key: "splits",
            label: "Splits",
            content: <NbaSplitsView splits={splits} />,
          },
          injuryRows.length > 0 && {
            key: "injuries",
            label: "Injury history",
            content: <NbaInjuryHistory rows={injuryRows} />,
          },
          txRows.length > 0 && {
            key: "transactions",
            label: "Movement history",
            content: <NbaTransactionHistory rows={txRows} />,
          },
        ])}
      />

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ Data sources: biography BALLDONTLIE · statistics, seasons, splits and awards ESPN · salary, birthday and birthplace TheSports.
      </p>
    </article>
  );
}

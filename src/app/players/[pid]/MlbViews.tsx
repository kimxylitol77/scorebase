// MLB 선수 4탭 뷰 (타자 / 투수) — 개요(퍼센타일·핵심스탯·구종)/시즌기록/경기/스플릿.
// 데이터: MLB Stats API (statsapi) + Baseball Savant 퍼센타일.

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { prisma } from "@/lib/db";
import ShareCardButton from "@/components/ShareCardButton";

// 최근 경기 → 우리 매치 상세(/live/mlb) 링크 — statsapi↔우리 externalId 체계가 달라
// 날짜(±2일)+상대팀명으로 매칭. 커버 경기만 링크 (축구 출전기록과 동일 패턴).
async function mlbGameHrefs(games: { date: string; opponent: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!games.length) return out;
  // statsapi date=미국 경기일. 저녁 경기(≈23~02 UTC)에 맞춰 23:00Z 를 기준점으로 — 자정 기준이면
  // 연속 시리즈에서 인접 경기로 어긋난다(저지 @Athletics 중복 실측).
  const times = games.map((g) => new Date(`${g.date}T23:00:00Z`).getTime());
  let rows: { externalId: string; startTime: Date; homeTeam: { name: string }; awayTeam: { name: string } }[] = [];
  try {
    rows = await prisma.match.findMany({
      where: {
        league: "MLB",
        startTime: { gte: new Date(Math.min(...times) - 86400e3), lte: new Date(Math.max(...times) + 2 * 86400e3) },
      },
      select: { externalId: true, startTime: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
    });
  } catch {
    return out; // DB 이슈 시 링크만 생략
  }
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "");
  for (const g of games) {
    const gn = norm(g.opponent);
    if (!gn) continue;
    const gt = new Date(`${g.date}T23:00:00Z`).getTime();
    let best: { ext: string; d: number } | null = null;
    for (const m of rows) {
      if (!/^\d+$/.test(m.externalId)) continue; // /live/mlb 는 숫자 id 라우트
      const names = [norm(m.homeTeam.name), norm(m.awayTeam.name)];
      if (!names.some((n) => n === gn || n.includes(gn) || gn.includes(n))) continue;
      const d = Math.abs(m.startTime.getTime() - gt);
      if (d > 2 * 86400e3) continue;
      if (!best || d < best.d) best = { ext: m.externalId, d };
    }
    if (best) out.set(`${g.date}|${g.opponent}`, `/live/mlb/${best.ext}`);
  }
  return out;
}

// 게임로그 "상대" 셀 — 커버 경기는 매치 상세 링크.
function OppCell({ g, hrefs }: { g: { date: string; opponent: string; isHome: boolean }; hrefs: Map<string, string> }) {
  const href = hrefs.get(`${g.date}|${g.opponent}`);
  const body = (
    <>
      <span className="text-neutral-400 mr-1">{g.isHome ? "vs" : "@"}</span>
      {g.opponent}
      {href && <ExternalLink className="inline-block w-3 h-3 ml-1 -mt-0.5 text-neutral-400" aria-hidden />}
    </>
  );
  return href ? (
    <Link href={href} className="hover:underline">{body}</Link>
  ) : (
    body
  );
}
import {
  mlbHeadshotUrl,
  type HitterProfile,
  type PitcherProfile,
  type HitterRecentGame,
  type PitcherRecentGame,
} from "@/lib/sports/mlb-stats-api";
import {
  getHitterCareer,
  getPitcherCareer,
  getPlayerSplits,
  fetchPlayerPercentiles,
  getPitchArsenal,
  getBattedBalls,
  getPitchLocations,
  getVelocityByInning,
} from "@/lib/sports/mlb-player-extras";
import PlayerTabs from "./PlayerTabs";
import PercentileBars from "./PercentileBars";
import { HitterTrendChart, PitcherTrendChart } from "./BaseballTrendChart";
import { HitterSeasonTable, PitcherSeasonTable } from "./SeasonTable";
import SplitsView from "./SplitsView";
import PitchArsenal from "./PitchArsenal";
import SprayChart from "./SprayChart";
import PitchZoneChart from "./PitchZoneChart";
import VelocityByInningChart from "./VelocityByInningChart";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import { toKoreanPlayerName } from "@/lib/player-names";
import { toKoreanTeamName } from "@/lib/team-names";
import BaseballPlayerSeo from "@/components/players/BaseballPlayerSeo";

/* ---------- 공통 작은 컴포넌트 ---------- */

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

// 정규화 지표(wRC+·ERA-, 100=리그평균) → "리그평균 ±N%" 배지 텍스트+색.
// lowerBetter=true 는 ERA- 처럼 낮을수록 우수한 지표(우수 방향을 +로 뒤집는다).
function avgCtx(
  v: number | undefined,
  lowerBetter = false,
): { sub: string; color: string } | null {
  if (v == null || !Number.isFinite(v)) return null;
  const diff = lowerBetter ? 100 - v : v - 100;
  const sign = diff > 0 ? "+" : "";
  return {
    sub: `리그평균 ${sign}${diff}%`,
    color: diff >= 0 ? "#10b981" : "#ef4444",
  };
}

function BioLine({
  height,
  weight,
  debut,
  draft,
  school,
}: {
  height?: string;
  weight?: number;
  debut?: string;
  draft?: string;
  school?: string;
}) {
  const cm = height?.match(/(\d+)'\s*(\d+)/);
  const hcm = cm ? `${Math.round((Number(cm[1]) * 12 + Number(cm[2])) * 2.54)}cm` : null;
  const phys = hcm && weight ? `${hcm} · ${Math.round(weight * 0.4536)}kg` : hcm;
  const parts = [phys, debut ? `데뷔 ${debut}` : null, draft || null, school || null].filter(
    Boolean,
  ) as string[];
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
      {parts.map((p, i) => (
        <span key={i}>{p}</span>
      ))}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  accent?: boolean;
  sub?: string;
  subColor?: string;
}) {
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
      {sub && (
        <div className="text-[9px] font-semibold tabular-nums" style={{ color: subColor }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function PlayerHeader({
  photoUrl,
  name,
  number,
  badges,
  sub,
  bio,
}: {
  photoUrl: string;
  name: string;
  number?: string;
  badges: ReactNode;
  sub: ReactNode;
  bio: ReactNode;
}) {
  return (
    <header className="space-y-3">
      <Link
        href="/leagues/MLB"
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
      >
        <ChevronLeft className="h-3 w-3" aria-hidden /> MLB
      </Link>
      <div className="flex items-center gap-4 flex-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          width={96}
          height={96}
          className="rounded-full bg-neutral-100 dark:bg-neutral-800 object-cover shrink-0"
        />
        <div className="space-y-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">{name}</h1>
            {number && <span className="text-xl font-bold text-neutral-400">#{number}</span>}
            {badges}
            <ShareCardButton />
          </div>
          <div className="text-sm text-neutral-500">{sub}</div>
          {bio}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <p className="text-[11px] text-neutral-500 leading-relaxed">
      ⓘ 데이터 출처: MLB 공식 Stats API (statsapi.mlb.com) · Statcast 퍼센타일 Baseball Savant.
      시즌·고급 지표(wRC+·WAR·FIP)는 매 경기 후 갱신됩니다.
    </p>
  );
}

const badge = (text: string, cls: string) => (
  <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{text}</span>
);

// 무거운 Statcast CSV(2MB) 는 개요를 블록하지 않도록 Suspense 로 분리 — 개요 먼저,
// 차트는 준비되면 스트리밍. fallback 은 같은 높이 스켈레톤으로 레이아웃 시프트 방지.
function ChartSkeleton({ label }: { label: string }) {
  return (
    <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="text-base font-bold tracking-tight mb-3 text-neutral-400">{label}</div>
      <div className="h-[220px] rounded-xl bg-neutral-100 dark:bg-white/[0.04] animate-pulse" />
    </section>
  );
}

async function SprayLoader({ pid, season }: { pid: number; season: number }) {
  const balls = await getBattedBalls(pid, season);
  return <SprayChart balls={balls} season={season} />;
}

async function PitchZoneLoader({ pid, season }: { pid: number; season: number }) {
  const locs = await getPitchLocations(pid, season);
  return <PitchZoneChart pitches={locs} season={season} />;
}

async function VelocityLoader({ pid, season }: { pid: number; season: number }) {
  const trend = await getVelocityByInning(pid, season);
  // 불펜·소화 이닝이 적은 투수는 이닝 3개를 못 채워 null — 카드 자체를 내지 않는다.
  return trend ? <VelocityByInningChart trend={trend} season={season} /> : null;
}

/* ============================================================
 * 타자
 * ==========================================================*/

function HitterGameLog({ games, hrefs }: { games: HitterRecentGame[]; hrefs: Map<string, string> }) {
  if (games.length === 0)
    return <p className="text-sm text-neutral-500">최근 경기 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">일자</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-2 py-2 font-medium">AB</th>
            <th className="text-right px-2 py-2 font-medium">H</th>
            <th className="text-right px-2 py-2 font-medium">HR</th>
            <th className="text-right px-2 py-2 font-medium">RBI</th>
            <th className="text-right px-2 py-2 font-medium">R</th>
            <th className="text-right px-2 py-2 font-medium">BB</th>
            <th className="text-right px-2 py-2 font-medium">SO</th>
            <th className="text-right px-2 py-2 font-medium">SB</th>
            <th className="text-right px-3 py-2 font-medium">AVG</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">{g.date.slice(5)}</td>
              <td className="px-3 py-2 truncate">
                <OppCell g={g} hrefs={hrefs} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.ab}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.h}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.hr}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.rbi}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.r}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.bb}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.so}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.sb}</td>
              <td className="px-3 py-2 text-right tabular-nums">{g.avg}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function MlbHitterView({
  profile,
  recent,
  season,
}: {
  profile: HitterProfile;
  recent: HitterRecentGame[];
  season: number;
}) {
  const pid = profile.pid;
  const [career, splits, pctl] = await Promise.all([
    getHitterCareer(pid),
    getPlayerSplits(pid, season, "hitting"),
    fetchPlayerPercentiles(pid, season, "batter"),
  ]);
  const s = profile.season;
  const c = profile.career;
  const sabr = career.find((r) => r.season === String(season));
  const wrc = avgCtx(sabr?.wrcPlus);
  const batsLabel =
    profile.bats === "L" ? "좌타" : profile.bats === "R" ? "우타" : profile.bats === "S" ? "스위치" : "";

  const overview = (
    <>
      {pctl && <PercentileBars values={pctl.values} type="batter" year={pctl.year} />}
      {s && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard label="타율" value={s.avg ?? "—"} accent />
            <StatCard label="OPS" value={s.ops ?? "—"} accent />
            <StatCard label="HR" value={s.hr != null ? String(s.hr) : "—"} />
            <StatCard label="RBI" value={s.rbi != null ? String(s.rbi) : "—"} />
            <StatCard label="SB" value={s.sb != null ? String(s.sb) : "—"} />
            <StatCard
              label="wRC+"
              value={sabr?.wrcPlus != null ? String(sabr.wrcPlus) : "—"}
              accent
              sub={wrc?.sub}
              subColor={wrc?.color}
            />
            <StatCard label="WAR" value={sabr?.war != null ? String(sabr.war) : "—"} accent />
            <StatCard label="wOBA" value={sabr?.woba != null ? sabr.woba.toFixed(3) : "—"} />
            <StatCard label="OBP" value={s.obp ?? "—"} />
            <StatCard label="SLG" value={s.slg ?? "—"} />
            <StatCard label="H" value={s.hits != null ? String(s.hits) : "—"} />
            <StatCard label="BB" value={s.bb != null ? String(s.bb) : "—"} />
            <StatCard label="SO" value={s.so != null ? String(s.so) : "—"} />
            <StatCard label="경기" value={s.games != null ? String(s.games) : "—"} />
          </div>
        </section>
      )}
      <HitterTrendChart rows={career} />
      <Suspense fallback={<ChartSkeleton label="타구 분포" />}>
        <SprayLoader pid={pid} season={season} />
      </Suspense>
      {c && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            통산 (career)
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard label="타율" value={c.avg ?? "—"} accent />
            <StatCard label="OPS" value={c.ops ?? "—"} accent />
            <StatCard label="HR" value={c.hr != null ? String(c.hr) : "—"} />
            <StatCard label="RBI" value={c.rbi != null ? String(c.rbi) : "—"} />
            <StatCard label="H" value={c.hits != null ? String(c.hits) : "—"} />
            <StatCard label="OBP" value={c.obp ?? "—"} />
            <StatCard label="SLG" value={c.slg ?? "—"} />
            <StatCard label="SB" value={c.sb != null ? String(c.sb) : "—"} />
            <StatCard label="R" value={c.runs != null ? String(c.runs) : "—"} />
            <StatCard label="경기" value={c.games != null ? String(c.games) : "—"} />
          </div>
        </section>
      )}
    </>
  );

  return (
    <article className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <AmbientGlow />
      <PlayerHeader
        photoUrl={mlbHeadshotUrl(pid)}
        name={toKoreanPlayerName(profile.name) || profile.name}
        number={profile.number}
        badges={
          <>
            {batsLabel && badge(batsLabel, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.position &&
              badge(
                profile.position,
                "bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300",
              )}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
          </>
        }
        sub={
          <>
            {profile.team ? `${toKoreanTeamName(profile.team, "MLB")} · ` : ""}
            {profile.birthCity}
            {profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
          </>
        }
        bio={
          <BioLine
            height={profile.height}
            weight={profile.weight}
            debut={profile.debut}
            draft={profile.draft}
            school={profile.school}
          />
        }
      />
      <BaseballPlayerSeo
        name={toKoreanPlayerName(profile.name) || profile.name}
        league="MLB"
        path={`/players/${pid}`}
        team={profile.team ? toKoreanTeamName(profile.team, "MLB") : null}
        position="타자"
        photo={mlbHeadshotUrl(pid)}
        height={profile.height ?? null}
        weight={profile.weight != null ? `${profile.weight} lbs` : null}
        statLine={
          s?.avg
            ? `${season} 시즌 타율 ${s.avg}${s.hr != null ? `, ${s.hr}홈런` : ""}${s.rbi != null ? ` ${s.rbi}타점` : ""}을 기록 중이다.`
            : null
        }
      />
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "seasons", label: "시즌기록", content: <HitterSeasonTable rows={career} advanced /> },
          { key: "games", label: "경기", content: <HitterGameLog games={recent} hrefs={await mlbGameHrefs(recent)} /> },
          { key: "splits", label: "스플릿", content: <SplitsView splits={splits} group="hitting" /> },
        ]}
      />
      <Footer />
    </article>
  );
}

/* ============================================================
 * 투수
 * ==========================================================*/

function PitcherGameLog({ games, hrefs }: { games: PitcherRecentGame[]; hrefs: Map<string, string> }) {
  if (games.length === 0)
    return <p className="text-sm text-neutral-500">최근 등판 기록이 없습니다.</p>;
  return (
    <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-2 py-2 font-medium">IP</th>
            <th className="text-right px-2 py-2 font-medium">ER</th>
            <th className="text-right px-2 py-2 font-medium">K</th>
            <th className="text-right px-2 py-2 font-medium">BB</th>
            <th className="text-right px-2 py-2 font-medium">H</th>
            <th className="text-right px-3 py-2 font-medium">시즌 ERA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/5 dark:divide-white/5">
          {games.map((g) => (
            <tr key={g.date}>
              <td className="px-3 py-2 text-xs text-neutral-500 tabular-nums">
                {g.date.slice(5)}
                {g.decision && (
                  <span
                    className={`ml-1.5 inline-block w-4 text-center text-[10px] font-bold rounded ${
                      g.decision === "W"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : g.decision === "L"
                          ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {g.decision}
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-xs">
                <OppCell g={g} hrefs={hrefs} />
              </td>
              <td className="px-2 py-2 text-right tabular-nums">{g.ip}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold">{g.er}</td>
              <td className="px-2 py-2 text-right tabular-nums">{g.so}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.bb}</td>
              <td className="px-2 py-2 text-right tabular-nums text-neutral-500">{g.hits}</td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">{g.era}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function MlbPitcherView({
  profile,
  recent,
  season,
}: {
  profile: PitcherProfile;
  recent: PitcherRecentGame[];
  season: number;
}) {
  const pid = profile.pid;
  const [career, splits, pctl, arsenal] = await Promise.all([
    getPitcherCareer(pid),
    getPlayerSplits(pid, season, "pitching"),
    fetchPlayerPercentiles(pid, season, "pitcher"),
    getPitchArsenal(pid, season),
  ]);
  const s = profile.season;
  const c = profile.career;
  const sabr = career.find((r) => r.season === String(season));
  const eraCtx = avgCtx(sabr?.eraMinus, true);
  const handLabel = profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "스위치";

  const overview = (
    <>
      {pctl && <PercentileBars values={pctl.values} type="pitcher" year={pctl.year} />}
      {s && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard
              label="ERA"
              value={fmtNum(s.era, 2)}
              accent
              sub={eraCtx?.sub}
              subColor={eraCtx?.color}
            />
            <StatCard label="WHIP" value={fmtNum(s.whip, 2)} accent />
            <StatCard label="K/9" value={fmtNum(s.k9, 1)} />
            <StatCard
              label="W-L"
              value={s.wins != null && s.losses != null ? `${s.wins}-${s.losses}` : "—"}
            />
            <StatCard label="FIP" value={sabr?.fip != null ? sabr.fip.toFixed(2) : "—"} accent />
            <StatCard label="WAR" value={sabr?.war != null ? String(sabr.war) : "—"} accent />
            <StatCard label="GS" value={s.gs != null ? String(s.gs) : "—"} />
            <StatCard label="IP" value={s.ip ?? "—"} />
            <StatCard label="삼진" value={s.so != null ? String(s.so) : "—"} />
            <StatCard label="볼넷" value={s.bb != null ? String(s.bb) : "—"} />
            <StatCard label="피홈런" value={s.hra != null ? String(s.hra) : "—"} />
            <StatCard label="피안타율" value={s.avg ?? "—"} />
          </div>
        </section>
      )}
      <PitcherTrendChart rows={career} />
      {arsenal.length > 0 && <PitchArsenal pitches={arsenal} />}
      <Suspense fallback={<ChartSkeleton label="이닝별 구속" />}>
        <VelocityLoader pid={pid} season={season} />
      </Suspense>
      <Suspense fallback={<ChartSkeleton label="투구 로케이션" />}>
        <PitchZoneLoader pid={pid} season={season} />
      </Suspense>
      {c && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            통산 (career)
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <StatCard label="ERA" value={fmtNum(c.era, 2)} accent />
            <StatCard label="WHIP" value={fmtNum(c.whip, 2)} accent />
            <StatCard
              label="W-L"
              value={c.wins != null && c.losses != null ? `${c.wins}-${c.losses}` : "—"}
            />
            <StatCard label="경기" value={c.games != null ? String(c.games) : "—"} />
            <StatCard label="선발" value={c.gs != null ? String(c.gs) : "—"} />
            <StatCard label="이닝" value={c.ip ?? "—"} />
            <StatCard label="삼진" value={c.so != null ? String(c.so) : "—"} />
          </div>
        </section>
      )}
    </>
  );

  return (
    <article className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <AmbientGlow />
      <PlayerHeader
        photoUrl={mlbHeadshotUrl(pid)}
        name={toKoreanPlayerName(profile.name) || profile.name}
        number={profile.number}
        badges={
          <>
            {badge(handLabel, "bg-neutral-100 dark:bg-neutral-800")}
            {profile.age != null && <span className="text-sm text-neutral-500">{profile.age}세</span>}
          </>
        }
        sub={
          <>
            {profile.team ? `${toKoreanTeamName(profile.team, "MLB")} · ` : ""}
            {profile.birthCity}
            {profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
          </>
        }
        bio={
          <BioLine
            height={profile.height}
            weight={profile.weight}
            debut={profile.debut}
            draft={profile.draft}
            school={profile.school}
          />
        }
      />
      <BaseballPlayerSeo
        name={toKoreanPlayerName(profile.name) || profile.name}
        league="MLB"
        path={`/players/${pid}`}
        team={profile.team ? toKoreanTeamName(profile.team, "MLB") : null}
        position="투수"
        photo={mlbHeadshotUrl(pid)}
        height={profile.height ?? null}
        weight={profile.weight != null ? `${profile.weight} lbs` : null}
        statLine={
          s?.era != null
            ? `${season} 시즌 평균자책점 ${s.era}${s.whip != null ? `, WHIP ${s.whip}` : ""}을 기록 중이다.`
            : null
        }
      />
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "seasons", label: "시즌기록", content: <PitcherSeasonTable rows={career} advanced /> },
          { key: "games", label: "경기", content: <PitcherGameLog games={recent} hrefs={await mlbGameHrefs(recent)} /> },
          { key: "splits", label: "스플릿", content: <SplitsView splits={splits} group="pitching" /> },
        ]}
      />
      <Footer />
    </article>
  );
}

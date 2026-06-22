// MLB 선수 4탭 뷰 (타자 / 투수) — 개요(퍼센타일·핵심스탯·구종)/시즌기록/경기/스플릿.
// 데이터: MLB Stats API (statsapi) + Baseball Savant 퍼센타일.

import Link from "next/link";
import type { ReactNode } from "react";
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
} from "@/lib/sports/mlb-player-extras";
import PlayerTabs from "./PlayerTabs";
import PercentileBars from "./PercentileBars";
import { HitterSeasonTable, PitcherSeasonTable } from "./SeasonTable";
import SplitsView from "./SplitsView";
import PitchArsenal from "./PitchArsenal";
import AmbientGlow from "@/components/AmbientGlow";
import { ChevronLeft } from "lucide-react";
import { toKoreanPlayerName } from "@/lib/player-names";

/* ---------- 공통 작은 컴포넌트 ---------- */

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
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

/* ============================================================
 * 타자
 * ==========================================================*/

function HitterGameLog({ games }: { games: HitterRecentGame[] }) {
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
                <span className="text-neutral-400 mr-1">{g.isHome ? "vs" : "@"}</span>
                {g.opponent}
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
            <StatCard label="wRC+" value={sabr?.wrcPlus != null ? String(sabr.wrcPlus) : "—"} accent />
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
    <article className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
            {profile.team ? `${profile.team} · ` : ""}
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
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "seasons", label: "시즌기록", content: <HitterSeasonTable rows={career} advanced /> },
          { key: "games", label: "경기", content: <HitterGameLog games={recent} /> },
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

function PitcherGameLog({ games }: { games: PitcherRecentGame[] }) {
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
                <span className="text-neutral-400 mr-1">{g.isHome ? "vs" : "@"}</span>
                <span className="font-medium">{g.opponent}</span>
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
            <StatCard label="ERA" value={fmtNum(s.era, 2)} accent />
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
      {arsenal.length > 0 && <PitchArsenal pitches={arsenal} />}
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
    <article className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
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
            {profile.team ? `${profile.team} · ` : ""}
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
      <PlayerTabs
        tabs={[
          { key: "overview", label: "개요", content: overview },
          { key: "seasons", label: "시즌기록", content: <PitcherSeasonTable rows={career} advanced /> },
          { key: "games", label: "경기", content: <PitcherGameLog games={recent} /> },
          { key: "splits", label: "스플릿", content: <SplitsView splits={splits} group="pitching" /> },
        ]}
      />
      <Footer />
    </article>
  );
}

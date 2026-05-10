// MLB 선수(투수) 상세 페이지 — 시즌 누적 + 최근 등판 game-by-game.
// 데이터 소스: MLB Stats API (statsapi.mlb.com) — 무료 공식.

import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import {
  fetchPitcherProfile,
  fetchPitcherRecent,
  type PitcherRecentGame,
} from "@/lib/sports/mlb-stats-api";

export const dynamic = "force-dynamic";
export const revalidate = 600; // 10분 ISR

interface Props {
  params: Promise<{ pid: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pid } = await params;
  const id = Number(pid);
  if (!Number.isFinite(id)) return { title: "Not Found" };
  const profile = await fetchPitcherProfile(id, new Date().getUTCFullYear());
  if (!profile) return { title: "선수 미발견" };
  return {
    title: `${profile.name} — MLB 선발 투수 통계`,
    description: `${profile.team ?? ""} ${profile.name} 의 ${new Date().getUTCFullYear()} 시즌 ERA·WHIP·K/9·최근 등판 결과.`,
  };
}

export default async function PlayerPage({ params }: Props) {
  const { pid } = await params;
  const id = Number(pid);
  if (!Number.isFinite(id)) notFound();
  const season = new Date().getUTCFullYear();
  const [profile, recent] = await Promise.all([
    fetchPitcherProfile(id, season),
    fetchPitcherRecent(id, season, 10),
  ]);
  if (!profile) notFound();

  const handLabel =
    profile.hand === "L" ? "좌완" : profile.hand === "R" ? "우완" : "스위치";
  const s = profile.season;

  return (
    <article className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* 헤더 */}
      <header className="space-y-3">
        <Link
          href="/leagues/MLB"
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
        >
          ← MLB
        </Link>
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight">
            {profile.name}
          </h1>
          <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-neutral-100 dark:bg-neutral-800">
            {handLabel}
          </span>
          {profile.age != null && (
            <span className="text-sm text-neutral-500">{profile.age}세</span>
          )}
        </div>
        <div className="text-sm text-neutral-500">
          {profile.team ? `${profile.team} · ` : ""}
          {profile.birthCity}{profile.birthCountry ? `, ${profile.birthCountry}` : ""} · MLB Stats API
        </div>
      </header>

      {/* 시즌 통계 카드 */}
      {s ? (
        <section className="rounded-2xl border border-neutral-200 dark:border-neutral-800 p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-neutral-500 mb-3">
            {season} 시즌 누적
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <Stat label="ERA" value={fmtNum(s.era, 2)} accent />
            <Stat label="WHIP" value={fmtNum(s.whip, 2)} />
            <Stat label="K/9" value={fmtNum(s.k9, 1)} />
            <Stat
              label="W-L"
              value={
                s.wins != null && s.losses != null
                  ? `${s.wins}-${s.losses}`
                  : "—"
              }
            />
            <Stat label="GS" value={s.gs != null ? String(s.gs) : "—"} />
            <Stat label="IP" value={s.ip ?? "—"} />
            <Stat label="삼진" value={s.so != null ? String(s.so) : "—"} />
            <Stat label="볼넷" value={s.bb != null ? String(s.bb) : "—"} />
            <Stat label="피홈런" value={s.hra != null ? String(s.hra) : "—"} />
            <Stat label="피안타율" value={s.avg ?? "—"} />
          </div>
        </section>
      ) : (
        <p className="text-sm text-neutral-500">{season} 시즌 통계가 아직 없습니다.</p>
      )}

      {/* 최근 등판 */}
      <section>
        <h2 className="text-lg font-semibold mb-3">최근 등판 ({recent.length})</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-neutral-500">{season} 등판 기록이 없습니다.</p>
        ) : (
          <RecentGames games={recent} />
        )}
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 데이터 출처: MLB 공식 Stats API (statsapi.mlb.com).
        ERA / WHIP / K/9 는 시즌 누적이며 매 등판마다 업데이트됩니다.
      </p>
    </article>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        accent
          ? "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30"
          : "bg-neutral-50 dark:bg-neutral-900"
      }`}
    >
      <div className="text-[10px] text-neutral-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function RecentGames({ games }: { games: PitcherRecentGame[] }) {
  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-500">
          <tr>
            <th className="text-left px-3 py-2 font-medium">날짜</th>
            <th className="text-left px-3 py-2 font-medium">상대</th>
            <th className="text-right px-3 py-2 font-medium">IP</th>
            <th className="text-right px-3 py-2 font-medium">ER</th>
            <th className="text-right px-3 py-2 font-medium">K</th>
            <th className="text-right px-3 py-2 font-medium">BB</th>
            <th className="text-right px-3 py-2 font-medium">H</th>
            <th className="text-right px-3 py-2 font-medium">시즌 ERA</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
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
              <td className="px-3 py-2 text-right tabular-nums">{g.ip}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                {g.er}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{g.so}</td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                {g.bb}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-neutral-500">
                {g.hits}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-xs text-neutral-500">
                {g.era}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtNum(n: number | undefined, dp: number): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dp);
}

// 테니스 선수 상세 — ESPN core API 프로필 + 시즌 통계 + 현재 랭킹.
// 랭킹 페이지 행 클릭으로 진입. docs/tennis-rankings 참고.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { fetchTennisPlayer, fetchTennisRankings } from "@/lib/sports/espn-tennis";
import { SITE_URL } from "@/lib/site-url";

export const revalidate = 86400;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const p = await fetchTennisPlayer(id);
  if (!p) return { title: "테니스 선수" };
  const name = p.nameKo ?? p.name;
  return {
    title: `${name} — 테니스 선수 프로필·세계랭킹·시즌 성적`,
    description: `${name}(${p.name}) 프로필과 시즌 성적. 세계랭킹, 단식 승패, 타이틀, 상금, 신장·주손·데뷔연도까지 한눈에 — 스코어베이스 테니스.`,
    keywords: [name, p.name, `${name} 랭킹`, `${name} 성적`, "테니스 선수", "ATP", "WTA"],
    alternates: { canonical: `${SITE_URL}/rankings/tennis/${id}` },
  };
}

export default async function TennisPlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const player = await fetchTennisPlayer(id);
  if (!player) notFound();

  // 현재 랭킹 — ATP·WTA 양쪽에서 조회 (선수가 어느 투어인지 사전 정보 없음)
  const [atp, wta] = await Promise.all([fetchTennisRankings("ATP"), fetchTennisRankings("WTA")]);
  const atpRow = atp.find((r) => r.athleteId === id);
  const wtaRow = wta.find((r) => r.athleteId === id);
  const rankRow = atpRow ?? wtaRow;
  const tour = atpRow ? "ATP" : wtaRow ? "WTA" : null;

  const name = player.nameKo ?? player.name;
  const profile: { label: string; value: string }[] = [
    player.countryKo || player.countryEn ? { label: "국적", value: player.countryKo ?? player.countryEn! } : null,
    player.age != null ? { label: "나이", value: `만 ${player.age}세` } : null,
    player.heightDisplay ? { label: "신장", value: player.heightDisplay } : null,
    player.weightDisplay ? { label: "체중", value: player.weightDisplay } : null,
    player.hand ? { label: "주손", value: player.hand === "Left" ? "왼손" : "오른손" } : null,
    player.debutYear ? { label: "프로 데뷔", value: `${player.debutYear}년` } : null,
    player.birthPlace ? { label: "출생지", value: player.birthPlace } : null,
  ].filter((x): x is { label: string; value: string } => x !== null);

  return (
    <main className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <nav className="text-[12px] text-neutral-500">
        <Link href="/rankings/tennis" className="hover:underline">테니스 세계랭킹</Link>
        <span className="mx-1.5 text-neutral-300 dark:text-neutral-700">/</span>
        <span>{name}</span>
      </nav>

      {/* 헤더 — 이름 + 랭킹 */}
      <header className="flex items-start gap-4">
        {player.headshot && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={player.headshot}
            alt={name}
            className="w-20 h-20 shrink-0 rounded-2xl object-cover bg-neutral-100 dark:bg-neutral-800"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {player.flag && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={player.flag} alt="" className="w-6 h-4 object-cover rounded-[2px]" />
            )}
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight break-keep">{name}</h1>
          </div>
          {player.nameKo && (
            <p className="mt-0.5 text-sm text-neutral-500">{player.name}</p>
          )}
          {rankRow && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[12px] font-bold text-rose-600 dark:text-rose-400">
                {tour} 세계 {rankRow.rank}위
              </span>
              <span className="tabular-nums text-neutral-500">{rankRow.points.toLocaleString("ko-KR")} 포인트</span>
              {rankRow.delta != null && (
                <span className={`text-[12px] font-bold tabular-nums ${rankRow.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"}`}>
                  {rankRow.delta > 0 ? `▲${rankRow.delta}` : `▼${Math.abs(rankRow.delta)}`}
                </span>
              )}
            </p>
          )}
        </div>
      </header>

      {/* 시즌 성적 */}
      {player.stats.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-bold tracking-tight">시즌 성적</h2>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {player.stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-neutral-50 px-3 py-2.5 dark:bg-white/[0.04]">
                <dt className="text-[11px] text-neutral-500">{s.label}</dt>
                <dd className="mt-0.5 text-lg font-black tabular-nums text-neutral-900 dark:text-white">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* 프로필 */}
      {profile.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-950">
          <h2 className="mb-3 text-sm font-bold tracking-tight">프로필</h2>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {profile.map((p) => (
              <div key={p.label} className="flex items-center justify-between py-2 text-sm">
                <dt className="text-neutral-500">{p.label}</dt>
                <dd className="font-semibold text-neutral-800 dark:text-neutral-200">{p.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={tour === "WTA" ? "/rankings/tennis?tour=wta" : "/rankings/tennis"}
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          ← {tour ?? "ATP"} 랭킹 전체
        </Link>
        <Link
          href="/scores?sport=tennis"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          🎾 테니스 라이브 스코어
        </Link>
      </div>

      <footer className="text-[11px] text-neutral-400 leading-relaxed">
        시즌 성적은 현재 시즌 기준이며 대회 진행에 따라 갱신됩니다. 데이터 출처 ESPN.
      </footer>
    </main>
  );
}

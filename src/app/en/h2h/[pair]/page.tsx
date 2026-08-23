// /en/h2h/[pair] — 팀 간 상대전적 (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { prisma } from "@/lib/db";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { GOOGLE_NOINDEX } from "@/lib/seo-robots";
import { cache } from "react";
import { enLeagueName, koEnLanguages, toEnglishTeamName } from "@/lib/i18n/en";
import AmbientGlow from "@/components/AmbientGlow";
import { Swords } from "lucide-react";

export const revalidate = 3600;

// ISR 활성화 — 이 선언이 없으면 revalidate 가 있어도 매 요청 렌더된다 (2026-08-01 실측).
// 빈 배열 = 빌드 프리렌더 0건, 요청 온 경로만 생성 후 캐시.
export function generateStaticParams() {
  return [] as { pair: string }[];
}

interface Props {
  params: Promise<{ pair: string }>;
}

function parsePair(pair: string): { a: number; b: number } | null {
  const m = /^(\d+)-vs-(\d+)$/.exec(pair);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return null;
  return { a, b };
}

// generateMetadata 와 페이지 본문이 같은 요청에서 중복 조회하지 않도록 react cache.
const loadH2h = cache(async (a: number, b: number) => {
  const [teamA, teamB, finished, next] = await Promise.all([
    prisma.team.findUnique({
      where: { id: a },
      select: { id: true, name: true, league: true, logoUrl: true },
    }),
    prisma.team.findUnique({
      where: { id: b },
      select: { id: true, name: true, league: true, logoUrl: true },
    }),
    prisma.match.findMany({
      where: {
        status: "FINISHED",
        OR: [
          { homeTeamId: a, awayTeamId: b },
          { homeTeamId: b, awayTeamId: a },
        ],
      },
      orderBy: { startTime: "desc" },
      take: 50,
      select: {
        id: true,
        league: true,
        startTime: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
      },
    }),
    prisma.match.findFirst({
      where: {
        status: "SCHEDULED",
        startTime: { gte: new Date() },
        OR: [
          { homeTeamId: a, awayTeamId: b },
          { homeTeamId: b, awayTeamId: a },
        ],
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        externalId: true,
        league: true,
        startTime: true,
        homeTeamId: true,
        predHome: true,
        predDraw: true,
        predAway: true,
      },
    }),
  ]);
  return { teamA, teamB, finished, next };
});

function tally(
  finished: Awaited<ReturnType<typeof loadH2h>>["finished"],
  a: number,
) {
  let winA = 0,
    winB = 0,
    draw = 0,
    goalsA = 0,
    goalsB = 0;
  for (const m of finished) {
    if (m.homeScore == null || m.awayScore == null) continue;
    const aIsHome = m.homeTeamId === a;
    const sA = aIsHome ? m.homeScore : m.awayScore;
    const sB = aIsHome ? m.awayScore : m.homeScore;
    goalsA += sA;
    goalsB += sB;
    if (sA > sB) winA++;
    else if (sA < sB) winB++;
    else draw++;
  }
  return { winA, winB, draw, goalsA, goalsB, n: winA + winB + draw };
}

function kstDate(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  return `${k.getUTCFullYear()}.${k.getUTCMonth() + 1}.${k.getUTCDate()}`;
}
function kstDateTime(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600_000);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${days[k.getUTCDay()]}) ${String(
    k.getUTCHours(),
  ).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  const ids = parsePair(pair);
  if (!ids) return { title: "Head to head" };
  const { a, b } = ids.a < ids.b ? { a: ids.a, b: ids.b } : { a: ids.b, b: ids.a };
  const { teamA, teamB, finished, next } = await loadH2h(a, b);
  if (!teamA || !teamB || (finished.length === 0 && !next)) return { title: "No head-to-head record" };
  const koA = toEnglishTeamName(teamA.name);
  const koB = toEnglishTeamName(teamB.name);
  const t = tally(finished, a);
  const record = t.n > 0 ? ` — ${t.n} meetings, ${t.winA}W ${t.draw}D ${t.winB}L` : " — first meeting";
  return {
    title: `${koA} vs ${koB} Head to Head${record}`,
    description: `${koA} vs ${koB} head-to-head record${record}. Recent results and average goals${
      next ? ", plus the next fixture and model win probabilities" : ""
    }.`,
    keywords: [
      `${koA} ${koB} head to head`,
      `${koA} vs ${koB} record`,
      `${koA} vs ${koB}`,
      `${koA} ${koB} h2h`,
      "head to head",
    ],
    alternates: {
      canonical: `/en/h2h/${a}-vs-${b}`,
      languages: koEnLanguages(`/h2h/${a}-vs-${b}`, `/en/h2h/${a}-vs-${b}`),
    },
    robots: GOOGLE_NOINDEX,
  };
}

export default async function H2hPage({ params }: Props) {
  const { pair } = await params;
  const ids = parsePair(pair);
  if (!ids) notFound();
  // 정렬 강제 — 역순 URL 은 영구 redirect (중복 페이지 방지)
  if (ids.a > ids.b) permanentRedirect(`/h2h/${ids.b}-vs-${ids.a}`);
  const { a, b } = ids;

  const { teamA, teamB, finished, next } = await loadH2h(a, b);
  if (!teamA || !teamB) notFound();
  if (finished.length === 0 && !next) notFound();

  const koA = toEnglishTeamName(teamA.name);
  const koB = toEnglishTeamName(teamB.name);
  const t = tally(finished, a);
  const recent = finished.slice(0, 15);
  const leagueLabel = enLeagueName(teamA.league);

  const winPct = (w: number) => (t.n > 0 ? Math.round((w / t.n) * 100) : 0);

  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <Swords className="h-3 w-3" aria-hidden /> Head to Head
          </span>
          <Link
            href={`/en/standings/${teamA.league}`}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
            prefetch={false}
          >
            {leagueLabel}
          </Link>
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          {koA} vs {koB} Head to Head
        </h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          Based on {t.n > 0 ? `${t.n} matches` : "records"} in our database.
        </p>
      </header>

      {/* 전적 요약 */}
      {t.n > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="grid grid-cols-3 text-center items-center">
            <Link
              href={`/en/teams/${teamA.id}`}
              className="group rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
              prefetch={false}
            >
              <div className="text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
                {t.winA}
              </div>
              <div className="mt-1 text-sm font-medium group-hover:underline truncate">{koA}  wins</div>
              <div className="text-[11px] text-neutral-400">{winPct(t.winA)}%</div>
            </Link>
            <div>
              <div className="text-3xl font-black tabular-nums text-neutral-400">{t.draw}</div>
              <div className="mt-1 text-sm text-neutral-500">Draws</div>
              <div className="text-[11px] text-neutral-400">of {t.n} meetings</div>
            </div>
            <Link
              href={`/en/teams/${teamB.id}`}
              className="group rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
              prefetch={false}
            >
              <div className="text-3xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                {t.winB}
              </div>
              <div className="mt-1 text-sm font-medium group-hover:underline truncate">{koB}  wins</div>
              <div className="text-[11px] text-neutral-400">{winPct(t.winB)}%</div>
            </Link>
          </div>
          <div className="mt-4 h-2 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
            <div className="bg-blue-500" style={{ width: `${winPct(t.winA)}%` }} />
            <div className="bg-neutral-300 dark:bg-neutral-600" style={{ width: `${winPct(t.draw)}%` }} />
            <div className="bg-rose-500" style={{ width: `${winPct(t.winB)}%` }} />
          </div>
          <p className="mt-3 text-xs text-neutral-500 text-center tabular-nums">
            Average goals {koA} {(t.goalsA / t.n).toFixed(1)} : {(t.goalsB / t.n).toFixed(1)} {koB}
          </p>
        </section>
      )}

      {/* 다음 맞대결 */}
      {next && (
        <section className="rounded-2xl bg-emerald-50/60 p-5 ring-1 ring-emerald-500/20 shadow-[0_24px_70px_-30px_rgba(16,185,129,0.25)] dark:bg-emerald-500/[0.06] dark:ring-emerald-500/20 dark:shadow-none">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Next meeting</h2>
            <span className="text-xs text-neutral-500">{kstDateTime(next.startTime)} KST</span>
          </div>
          {next.predHome != null && next.predAway != null && (
            <p className="mt-2 text-sm tabular-nums">
              Model probabilities —{" "}
              <strong>
                {next.homeTeamId === a ? koA : koB} {Math.round(next.predHome * 100)}%
              </strong>
              {next.predDraw != null && next.predDraw > 0.001 && (
                <> · draw {Math.round(next.predDraw * 100)}%</>
              )}{" "}
              ·{" "}
              <strong>
                {next.homeTeamId === a ? koB : koA} {Math.round(next.predAway * 100)}%
              </strong>
            </p>
          )}
          {next.externalId && (
            <Link
              href="/en/scores"
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-emerald-500/15 dark:text-emerald-400"
              prefetch={false}
            >
              Match details →
            </Link>
          )}
        </section>
      )}

      {/* 최근 맞대결 */}
      {recent.length > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="font-semibold mb-3">Recent meetings</h2>
          <ul className="divide-y divide-black/5 dark:divide-white/5">
            {recent.map((m) => {
              const aIsHome = m.homeTeamId === a;
              const sA = aIsHome ? m.homeScore : m.awayScore;
              const sB = aIsHome ? m.awayScore : m.homeScore;
              const aWin = sA != null && sB != null && sA > sB;
              const bWin = sA != null && sB != null && sB > sA;
              return (
                <li key={m.id} className="py-2 flex items-center gap-3 text-sm tabular-nums">
                  <span className="w-20 text-xs text-neutral-500">{kstDate(m.startTime)}</span>
                  <span className="w-14 text-[11px] text-neutral-400 truncate">
                    {enLeagueName(m.league)}
                  </span>
                  <span className={`flex-1 text-right truncate ${aWin ? "font-bold" : ""}`}>{koA}</span>
                  <span className="w-14 text-center font-semibold">
                    {sA ?? "-"} : {sB ?? "-"}
                  </span>
                  <span className={`flex-1 truncate ${bWin ? "font-bold" : ""}`}>{koB}</span>
                  <span className="w-5 text-center text-[11px]">
                    {aIsHome ? "🏠" : "✈️"}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[11px] text-neutral-400">
            🏠 = {koA} at home · score reads {koA} : {koB} 
          </p>
        </section>
      )}

      <p className="text-xs text-neutral-500 leading-relaxed break-keep">
        ⓘ Records cover the seasons in our database, so they may differ from all-time totals. Teams:{" "}
        <Link href={`/en/teams/${teamA.id}`} className="underline" prefetch={false}>
          {koA}
        </Link>{" "}
        ·{" "}
        <Link href={`/en/teams/${teamB.id}`} className="underline" prefetch={false}>
          {koB}
        </Link>{" "}
        · League:{" "}
        <Link href={`/en/predictions/${teamA.league}`} className="underline" prefetch={false}>
          {leagueLabel} predictions
        </Link>
      </p>
    </div>
  );
}

// 두 팀 상대전적(H2H) 페이지 — "한화 KIA 상대전적"류 검색 수요 타깃.
// URL: /h2h/{작은id}-vs-{큰id} (역순 진입 시 정렬 URL 로 redirect — 중복 색인 방지).
// 전적 요약 + 다음 맞대결(모델 승률) + 최근 맞대결 목록. 모든 리그 공용.
import { prisma } from "@/lib/db";
import { notFound, permanentRedirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { cache } from "react";
import { toKoreanTeamName } from "@/lib/team-names";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import AmbientGlow from "@/components/AmbientGlow";
import { Swords } from "lucide-react";

export const revalidate = 3600;

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
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} (${days[k.getUTCDay()]}) ${String(
    k.getUTCHours(),
  ).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  const ids = parsePair(pair);
  if (!ids) return { title: "상대전적" };
  const { a, b } = ids.a < ids.b ? { a: ids.a, b: ids.b } : { a: ids.b, b: ids.a };
  const { teamA, teamB, finished, next } = await loadH2h(a, b);
  if (!teamA || !teamB || (finished.length === 0 && !next)) return { title: "상대전적 없음" };
  const koA = toKoreanTeamName(teamA.name, teamA.league) || teamA.name;
  const koB = toKoreanTeamName(teamB.name, teamB.league) || teamB.name;
  const t = tally(finished, a);
  const record = t.n > 0 ? ` — ${t.n}전 ${t.winA}승 ${t.draw}무 ${t.winB}패` : " — 첫 맞대결";
  return {
    title: `${koA} ${koB} 상대전적${record}`,
    description: `${koA} vs ${koB} 역대 맞대결 전적${record}. 최근 경기 결과, 평균 득점${
      next ? ", 다음 맞대결 일정과 모델 승률" : ""
    }까지 데이터로 정리 — 스코어베이스.`,
    keywords: [
      `${koA} ${koB} 상대전적`,
      `${koA} ${koB} 전적`,
      `${koA} vs ${koB}`,
      `${koA} ${koB} 맞대결`,
      "상대전적",
      "스코어베이스",
    ],
    alternates: { canonical: `/h2h/${a}-vs-${b}` },
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

  const koA = toKoreanTeamName(teamA.name, teamA.league) || teamA.name;
  const koB = toKoreanTeamName(teamB.name, teamB.league) || teamB.name;
  const t = tally(finished, a);
  const recent = finished.slice(0, 15);
  const leagueLabel = LEAGUE_DISPLAY[teamA.league] ?? teamA.league;

  const winPct = (w: number) => (t.n > 0 ? Math.round((w / t.n) * 100) : 0);

  return (
    <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
            <Swords className="h-3 w-3" aria-hidden /> 상대전적
          </span>
          <Link
            href={`/leagues/${teamA.league}`}
            className="text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-700 dark:hover:text-neutral-300"
            prefetch={false}
          >
            {leagueLabel}
          </Link>
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight break-keep">
          {koA} vs {koB} 상대전적
        </h1>
        <p className="mt-3 text-sm text-neutral-500 break-keep">
          역대 맞대결 {t.n > 0 ? `${t.n}경기` : "기록"} 기준 — 우리 DB 에 수집된 경기 한정.
        </p>
      </header>

      {/* 전적 요약 */}
      {t.n > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <div className="grid grid-cols-3 text-center items-center">
            <Link
              href={`/teams/${teamA.id}`}
              className="group rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
              prefetch={false}
            >
              <div className="text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
                {t.winA}
              </div>
              <div className="mt-1 text-sm font-medium group-hover:underline truncate">{koA} 승</div>
              <div className="text-[11px] text-neutral-400">{winPct(t.winA)}%</div>
            </Link>
            <div>
              <div className="text-3xl font-black tabular-nums text-neutral-400">{t.draw}</div>
              <div className="mt-1 text-sm text-neutral-500">무승부</div>
              <div className="text-[11px] text-neutral-400">총 {t.n}전</div>
            </div>
            <Link
              href={`/teams/${teamB.id}`}
              className="group rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5"
              prefetch={false}
            >
              <div className="text-3xl font-black tabular-nums text-rose-600 dark:text-rose-400">
                {t.winB}
              </div>
              <div className="mt-1 text-sm font-medium group-hover:underline truncate">{koB} 승</div>
              <div className="text-[11px] text-neutral-400">{winPct(t.winB)}%</div>
            </Link>
          </div>
          <div className="mt-4 h-2 rounded-full overflow-hidden flex bg-neutral-100 dark:bg-neutral-800">
            <div className="bg-blue-500" style={{ width: `${winPct(t.winA)}%` }} />
            <div className="bg-neutral-300 dark:bg-neutral-600" style={{ width: `${winPct(t.draw)}%` }} />
            <div className="bg-rose-500" style={{ width: `${winPct(t.winB)}%` }} />
          </div>
          <p className="mt-3 text-xs text-neutral-500 text-center tabular-nums">
            평균 득점 {koA} {(t.goalsA / t.n).toFixed(1)} : {(t.goalsB / t.n).toFixed(1)} {koB}
          </p>
        </section>
      )}

      {/* 다음 맞대결 */}
      {next && (
        <section className="rounded-2xl bg-emerald-50/60 p-5 ring-1 ring-emerald-500/20 shadow-[0_24px_70px_-30px_rgba(16,185,129,0.25)] dark:bg-emerald-500/[0.06] dark:ring-emerald-500/20 dark:shadow-none">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">다음 맞대결</h2>
            <span className="text-xs text-neutral-500">{kstDateTime(next.startTime)} KST</span>
          </div>
          {next.predHome != null && next.predAway != null && (
            <p className="mt-2 text-sm tabular-nums">
              모델 승률 —{" "}
              <strong>
                {next.homeTeamId === a ? koA : koB} {Math.round(next.predHome * 100)}%
              </strong>
              {next.predDraw != null && next.predDraw > 0.001 && (
                <> · 무 {Math.round(next.predDraw * 100)}%</>
              )}{" "}
              ·{" "}
              <strong>
                {next.homeTeamId === a ? koB : koA} {Math.round(next.predAway * 100)}%
              </strong>
            </p>
          )}
          {next.externalId && (
            <Link
              href={`/live/${next.league}/${next.externalId}`}
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:bg-emerald-500/15 dark:text-emerald-400"
              prefetch={false}
            >
              경기 상세 →
            </Link>
          )}
        </section>
      )}

      {/* 최근 맞대결 */}
      {recent.length > 0 && (
        <section className="rounded-2xl bg-white p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
          <h2 className="font-semibold mb-3">최근 맞대결</h2>
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
                    {LEAGUE_DISPLAY[m.league] ?? m.league}
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
            🏠 = {koA} 홈 경기 · 점수는 {koA} : {koB} 순
          </p>
        </section>
      )}

      <p className="text-xs text-neutral-500 leading-relaxed break-keep">
        ⓘ 전적은 스코어베이스 수집 범위(최근 시즌 위주) 기준이라 역대 통산과 다를 수 있습니다.
        팀 상세:{" "}
        <Link href={`/teams/${teamA.id}`} className="underline" prefetch={false}>
          {koA}
        </Link>{" "}
        ·{" "}
        <Link href={`/teams/${teamB.id}`} className="underline" prefetch={false}>
          {koB}
        </Link>{" "}
        · 리그:{" "}
        <Link href={`/predictions/${teamA.league}`} className="underline" prefetch={false}>
          {leagueLabel} 예측
        </Link>
      </p>
    </div>
  );
}

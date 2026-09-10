// 개인 적중률 노트북 — 회원이 즐겨찾기한 팀·리그에 대한 AI 예측 적중률을 누적·시각화 (로그인 필수).
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { USER_COOKIE_NAME, readUserSessionCookie } from "@/lib/user-auth";
import { personalHitRate } from "@/lib/predict/personal-hit-rate";
import type { MarketRate } from "@/lib/predict/accuracy-stats";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import CumulativeAccuracyChart from "@/components/charts/CumulativeAccuracyChart";
import AmbientGlow from "@/components/AmbientGlow";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 팀 AI 적중률 · 스코어베이스",
  robots: { index: false, follow: false },
};

const CARD = "rounded-3xl bg-white ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none p-6";

function pct(r: MarketRate): string {
  return r.evaluated > 0 ? `${Math.round(r.rate * 100)}%` : "–";
}

function kst(d: Date): string {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
}

/** 적중률 셀 — 값 + 표본. 표본 0이면 대시. */
function Rate({ r }: { r: MarketRate }) {
  return (
    <td className="px-3 py-2.5 text-right tabular-nums">
      <span className={`font-semibold ${r.evaluated > 0 && r.rate >= 0.6 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{pct(r)}</span>
      {r.evaluated > 0 && <span className="ml-1 text-[10px] text-neutral-400">{r.correct}/{r.evaluated}</span>}
    </td>
  );
}

export default async function HitRatePage() {
  const c = await cookies();
  const session = readUserSessionCookie(c.get(USER_COOKIE_NAME)?.value);
  if (!session) redirect("/login?from=/account/hit-rate");

  const data = await personalHitRate(session.userId);
  const empty = data.teams.length === 0 && data.leagues.length === 0;

  return (
    <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      <AmbientGlow />
      <div className="mb-8 px-1">
        <Link href="/account" className="text-xs font-medium text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">← 내 정보</Link>
        <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight break-keep">내 팀 AI 적중률</h1>
        <p className="mt-2 text-sm text-neutral-500 leading-relaxed break-keep">
          즐겨찾기한 팀과 리그에서 AI 예측이 얼마나 맞았는지 자동으로 쌓입니다. 산식은{" "}
          <Link href="/predictions/accuracy" className="text-blue-600 dark:text-blue-400 hover:underline">전체 적중률</Link>과 같습니다.
        </p>
      </div>

      {empty ? (
        <section className={CARD}>
          <p className="text-sm text-neutral-500 leading-relaxed break-keep">
            아직 즐겨찾기한 팀이나 리그가 없습니다.{" "}
            <Link href="/scores" className="text-blue-600 dark:text-blue-400 hover:underline">스코어</Link>에서 팀 이름 옆 별표를 누르면
            그 팀의 경기부터 여기에 적중률이 쌓입니다.
          </p>
        </section>
      ) : (
        <div className="space-y-5">
          {data.teams.length > 0 && (
            <>
              <section className={CARD}>
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <h2 className="text-sm font-semibold text-neutral-500">즐겨찾기 팀</h2>
                  <div className="text-sm text-neutral-500">
                    합산 1X2 <span className="font-bold text-neutral-900 dark:text-white tabular-nums">{pct(data.overall)}</span>
                    <span className="ml-1 text-[11px] text-neutral-400">{data.overall.correct}/{data.overall.evaluated}</span>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-2">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-[11px] text-neutral-400">
                        <th className="px-3 py-1.5 text-left font-medium">팀</th>
                        <th className="px-3 py-1.5 text-right font-medium">1X2</th>
                        <th className="px-3 py-1.5 text-right font-medium">오버/언더</th>
                        <th className="px-3 py-1.5 text-right font-medium">핸디</th>
                        <th className="px-3 py-1.5 text-right font-medium">Strong</th>
                        <th className="px-3 py-1.5 text-left font-medium">최근 10경기</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                      {data.teams.map((t) => (
                        <tr key={t.teamId}>
                          <td className="px-3 py-2.5">
                            <Link href={`/teams/${t.teamId}`} className="font-medium hover:underline">{t.name}</Link>
                            <span className="ml-1.5 text-[10px] text-neutral-400">{LEAGUE_DISPLAY[t.league] ?? t.league} · {t.sample}경기</span>
                          </td>
                          <Rate r={t.oneXTwo} />
                          <Rate r={t.over} />
                          <Rate r={t.hc} />
                          <Rate r={t.strong} />
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1" aria-label={`최근 ${t.recent.length}경기 적중 ${t.recent.filter(Boolean).length}회`}>
                              {t.recent.map((ok, i) => (
                                <span key={i} className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"}`} />
                              ))}
                              {t.recent.length === 0 && <span className="text-[11px] text-neutral-400">채점 경기 없음</span>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] text-neutral-400 leading-relaxed">
                  채점이 끝난 경기만 셉니다. 초록 점은 AI 1X2 픽 적중, 회색은 빗나감(최신이 왼쪽). 팀 추가·해제는 내 정보의 즐겨찾기 팀에서.
                </p>
              </section>

              {data.chart.leagues.length > 0 && (
                <section className={CARD}>
                  <h2 className="text-sm font-semibold text-neutral-500 mb-1">팀별 누적 적중률</h2>
                  <p className="text-[11px] text-neutral-400 mb-4">시즌 진행에 따라 1X2 누적 적중률이 어디로 수렴하는지. 10경기 이상 팀만.</p>
                  <CumulativeAccuracyChart data={data.chart.points} leagues={data.chart.leagues} />
                </section>
              )}
            </>
          )}

          {data.leagues.length > 0 && (
            <section className={CARD}>
              <h2 className="text-sm font-semibold text-neutral-500 mb-4">즐겨찾기 리그</h2>
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="text-[11px] text-neutral-400">
                      <th className="px-3 py-1.5 text-left font-medium">리그</th>
                      <th className="px-3 py-1.5 text-right font-medium">1X2</th>
                      <th className="px-3 py-1.5 text-right font-medium">최근 30일</th>
                      <th className="px-3 py-1.5 text-right font-medium">오버/언더</th>
                      <th className="px-3 py-1.5 text-right font-medium">핸디</th>
                      <th className="px-3 py-1.5 text-right font-medium">Strong</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
                    {data.leagues.map((l) => (
                      <tr key={l.league}>
                        <td className="px-3 py-2.5">
                          <Link href={`/predictions/${l.league.toLowerCase()}`} className="font-medium hover:underline">{LEAGUE_DISPLAY[l.league] ?? l.league}</Link>
                        </td>
                        <Rate r={l.oneXTwo} />
                        <Rate r={l.rolling30} />
                        <Rate r={l.over} />
                        <Rate r={l.hc} />
                        <Rate r={l.strong} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {data.recent.length > 0 && (
            <section className={CARD}>
              <h2 className="text-sm font-semibold text-neutral-500 mb-3">최근 채점 경기</h2>
              <ul className="divide-y divide-neutral-100 dark:divide-white/5">
                {data.recent.map((m) => (
                  <li key={m.matchId} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-9 shrink-0 text-[11px] text-neutral-400 tabular-nums">{kst(m.startTime)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {m.home} <span className="text-neutral-400">vs</span> {m.away}
                      {m.homeScore != null && m.awayScore != null && (
                        <span className="ml-1.5 font-bold tabular-nums">{m.homeScore}-{m.awayScore}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-neutral-500">AI 픽 <span className="font-medium text-neutral-800 dark:text-neutral-200">{m.pick}</span></span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.correct ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-neutral-200/70 text-neutral-500 dark:bg-white/10"}`}>
                      {m.correct ? "적중" : "빗나감"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

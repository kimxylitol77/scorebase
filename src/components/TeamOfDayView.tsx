// 월드컵 '오늘의 베스트 XI' 본문 뷰 — base(/team-of-day)와 날짜별([date]) 라우트 공용.
// 날짜 네비게이션(완료 경기일 칩) + 피치 + 벤치 + SEO 본문. 데이터는 상위 라우트가 주입.
import Link from "next/link";
import type { TeamOfDay, TodPlayer } from "@/lib/sports/thesports/team-of-day";
import TeamOfDayPitch from "@/components/TeamOfDayPitch";

export const fmtDateKo = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};
export const koName = (p: TodPlayer) => p.name;
const names = (arr: TodPlayer[]) => arr.map(koName).join(", ");

/** 최신 완료일은 base URL, 과거일은 /[date] 로 — canonical 중복 방지. */
const todHref = (d: string, latest: string) =>
  d === latest ? "/world-cup/team-of-day" : `/world-cup/team-of-day/${d}`;

export default function TeamOfDayView({
  tod,
  allDates,
  currentDate,
}: {
  tod: TeamOfDay;
  allDates: string[];
  currentDate: string;
}) {
  const { date, matchCount, matches, xi, bench, topRating } = tod;
  const dk = fmtDateKo(date);
  const fw = xi.filter((p) => p.pos === "F");
  const mf = xi.filter((p) => p.pos === "M");
  const df = xi.filter((p) => p.pos === "D");
  const gk = xi.filter((p) => p.pos === "G");
  const mvp = [...xi].sort((a, b) => b.rating - a.rating)[0];
  const kr = xi.filter((p) => p.country === "South Korea");
  const latest = allDates[0] ?? date;

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white py-8 px-4">
      <div className="max-w-md mx-auto">
        <nav className="text-xs text-neutral-500 mb-3">
          <Link href="/predictions/WORLD_CUP" className="hover:text-neutral-700 dark:hover:text-neutral-300">월드컵</Link>
          <span className="mx-1">›</span><span className="text-neutral-700 dark:text-neutral-300">오늘의 베스트 XI</span>
        </nav>

        <div className="text-center mb-1">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-400/15 text-amber-700 dark:text-amber-300 text-xs font-bold tracking-[0.15em]">⚽ TEAM OF THE DAY</span>
        </div>
        <h1 className="text-center text-3xl font-black tracking-tight mb-1">{dk} 베스트 11</h1>
        <div className="text-center text-[11px] text-neutral-500 mb-1">2026 월드컵 · 그날 {matchCount}경기 최고 평점 11인 · 4-2-3-1</div>
        <div className="text-center text-[11px] text-neutral-500 mb-3">📅 경기 평점은 <span className="text-neutral-700 dark:text-neutral-300 font-semibold">매일 자동 갱신</span>됩니다</div>

        {/* 날짜 네비게이션 — 완료 경기일 칩 (최신순, 가로 스크롤) */}
        {allDates.length > 1 && (
          <nav aria-label="날짜 선택" className="mb-4 -mx-1 px-1">
            <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {allDates.map((d) => {
                const active = d === currentDate;
                return (
                  <Link
                    key={d}
                    href={todHref(d, latest)}
                    aria-current={active ? "page" : undefined}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition ${
                      active
                        ? "bg-amber-400 text-neutral-900"
                        : "bg-black/[0.05] dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-black/[0.09] dark:hover:bg-white/[0.16]"
                    }`}
                  >
                    {fmtDateKo(d)}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}

        <TeamOfDayPitch matches={matches} xi={xi} />

        {/* 벤치 */}
        {bench.length > 0 && (
          <div className="mt-5">
            <div className="text-xs font-bold text-neutral-600 dark:text-neutral-400 mb-2">후보 선수 · 차순위 평점</div>
            <div className="grid grid-cols-3 gap-2">
              {bench.map((p, i) => {
                const inner = (
                  <>
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-800 shrink-0 flex items-center justify-center ring-1 ring-black/10 dark:ring-white/15">
                      {p.logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.logo} alt="" className="w-full h-full object-cover" />
                      ) : (<span className="text-[10px] font-bold text-neutral-500 dark:text-neutral-400">{koName(p).slice(0, 1)}</span>)}
                    </div>
                    <div className="min-w-0 leading-tight">
                      <div className="text-[10px] font-bold truncate">{p.flag} {koName(p)}</div>
                      <div className="text-[9px] text-emerald-600 dark:text-emerald-300">평점 {p.rating.toFixed(1)}</div>
                    </div>
                  </>
                );
                const cls = "flex items-center gap-1.5 rounded-lg bg-black/[0.04] dark:bg-white/5 px-2 py-1.5";
                return p.hasMv ? (
                  <Link key={i} href={`/transfers/${p.id}`} className={`${cls} hover:bg-black/[0.07] dark:hover:bg-white/10 transition`}>{inner}</Link>
                ) : (
                  <div key={i} className={cls}>{inner}</div>
                );
              })}
            </div>
          </div>
        )}

        {/* SEO 본문 */}
        <article className="mt-8 space-y-4 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-300">
          <h2 className="text-xl font-black text-neutral-900 dark:text-white">{dk} 2026 월드컵 오늘의 베스트 11</h2>
          <p>2026 북중미 월드컵 {dk}에 열린 <strong className="text-neutral-900 dark:text-white">{matchCount}경기</strong>에서 가장 높은 경기 평점을 기록한 11명을 4-2-3-1 포메이션으로 선정했다. 별점 평균 최고 평점은 <strong className="text-neutral-900 dark:text-white">{topRating.toFixed(1)}</strong>점이다.{mvp ? <> 이날 최고 평점은 <strong className="text-neutral-900 dark:text-white">{koName(mvp)}</strong>({mvp.countryKo})의 <strong className="text-emerald-600 dark:text-emerald-400">{mvp.rating.toFixed(1)}</strong>점이다.</> : null}</p>
          {fw.length > 0 && (<><h3 className="text-lg font-bold text-neutral-900 dark:text-white pt-1">최전방</h3><p>공격진에는 <strong className="text-neutral-900 dark:text-white">{names(fw)}</strong>이(가) 이름을 올렸다.</p></>)}
          {mf.length > 0 && (<><h3 className="text-lg font-bold text-neutral-900 dark:text-white pt-1">중원</h3><p>중원은 <strong className="text-neutral-900 dark:text-white">{names(mf)}</strong>로 구성됐다.</p></>)}
          {df.length > 0 && (<><h3 className="text-lg font-bold text-neutral-900 dark:text-white pt-1">수비진</h3><p>포백은 <strong className="text-neutral-900 dark:text-white">{names(df)}</strong>가 맡았다.</p></>)}
          {gk.length > 0 && (<><h3 className="text-lg font-bold text-neutral-900 dark:text-white pt-1">골문</h3><p>골키퍼는 <strong className="text-neutral-900 dark:text-white">{names(gk)}</strong>가 지켰다.</p></>)}
          {kr.length > 0 && (
            <>
              <h3 className="text-lg font-bold text-neutral-900 dark:text-white pt-1">대한민국 선수</h3>
              <p>오늘의 베스트 11에 대한민국 선수 <strong className="text-neutral-900 dark:text-white">{kr.length}명</strong>({names(kr)})이 포함됐다.</p>
            </>
          )}
          <p className="text-xs text-neutral-500 pt-2">※ 오늘의 베스트 11은 TheSports 경기 평점을 기반으로 한 스코어베이스 자체 선정이며, 매일 최신 경기 데이터로 자동 갱신됩니다.</p>
        </article>

        <div className="mt-6 text-center">
          <Link href="/predictions/WORLD_CUP" className="text-sm text-amber-600 dark:text-amber-400 hover:underline">← 월드컵 예측·조별 순위 보기</Link>
        </div>
      </div>
    </div>
  );
}

// /world-cup/team-of-day — 월드컵 '오늘의 베스트 XI' (최근 완료일 경기 평점 기반 4-2-3-1).
// 데이터: getTeamOfDay() 가 TheSportsMatchCache 평점을 실시간 집계 (Vercel 안전, cron·빌드 불필요).
import Link from "next/link";
import type { Metadata } from "next";
import { getTeamOfDay, type TodPlayer } from "@/lib/sports/thesports/team-of-day";

export const revalidate = 1800;

const fmtDateKo = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};
const koName = (p: TodPlayer) => p.name;
const names = (arr: TodPlayer[]) => arr.map(koName).join(", ");

export async function generateMetadata(): Promise<Metadata> {
  const tod = await getTeamOfDay();
  if (!tod) return { title: "월드컵 오늘의 베스트 XI | Scorebase" };
  const stars = tod.xi.slice(0, 3).map(koName).join(", ");
  const dk = fmtDateKo(tod.date);
  return {
    title: `${dk} 월드컵 베스트 XI — ${stars} | Scorebase`,
    description: `2026 북중미 월드컵 ${dk} ${tod.matchCount}경기 최고 평점 11인. TheSports 경기 평점 기반 4-2-3-1 팀 오브 더 데이. ${stars} 등 오늘의 베스트 XI — 매일 자동 갱신.`,
    keywords: ["월드컵 베스트XI", "팀오브더데이", "오늘의 베스트11", "2026 월드컵", "월드컵 평점", "스코어베이스"],
    alternates: { canonical: "/world-cup/team-of-day" },
  };
}

export default async function Page() {
  const tod = await getTeamOfDay();
  if (!tod || tod.xi.length === 0) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 text-neutral-900 dark:text-white py-12 px-4">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-black mb-3">오늘의 베스트 XI</h1>
          <p className="text-neutral-500 text-sm mb-6">아직 평점이 집계된 완료 경기가 없습니다. 경기 종료 후 자동으로 채워집니다.</p>
          <Link href="/predictions/WORLD_CUP" className="text-sm text-amber-600 dark:text-amber-400 hover:underline">← 월드컵 예측·조별 순위 보기</Link>
        </div>
      </div>
    );
  }
  const { date, matchCount, matches, xi, bench, topRating } = tod;
  const dk = fmtDateKo(date);
  const fw = xi.filter((p) => p.pos === "F");
  const mf = xi.filter((p) => p.pos === "M");
  const df = xi.filter((p) => p.pos === "D");
  const gk = xi.filter((p) => p.pos === "G");
  const mvp = [...xi].sort((a, b) => b.rating - a.rating)[0];
  const kr = xi.filter((p) => p.country === "South Korea");

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

        {/* 그날 경기 결과 */}
        <div className="flex flex-wrap justify-center gap-1.5 mb-4 text-[11px]">
          {matches.map((m, i) => (
            <span key={i} className="inline-flex items-center rounded-md bg-black/[0.05] dark:bg-white/10 px-2 py-1 text-neutral-600 dark:text-neutral-300">
              {m.homeKo} <strong className="mx-1 text-neutral-900 dark:text-white">{m.homeScore ?? "-"}:{m.awayScore ?? "-"}</strong> {m.awayKo}
            </span>
          ))}
        </div>

        {/* 피치 — 4-2-3-1 */}
        <div className="relative w-full rounded-2xl overflow-hidden border border-emerald-700/40 shadow-2xl"
          style={{ aspectRatio: "3 / 4.2", background: "linear-gradient(to bottom, #0f5132 0%, #0c4429 50%, #0a3d27 100%)" }}>
          <div className="absolute inset-3 border-2 border-white/15 rounded-sm" />
          <div className="absolute left-3 right-3 top-1/2 border-t-2 border-white/15" />
          <div className="absolute left-1/2 top-1/2 w-24 h-24 -translate-x-1/2 -translate-y-1/2 border-2 border-white/15 rounded-full" />
          <div className="absolute left-1/2 bottom-3 w-32 h-12 -translate-x-1/2 border-2 border-t-0 border-white/15" />
          <div className="absolute left-1/2 top-3 w-32 h-12 -translate-x-1/2 border-2 border-b-0 border-white/15" />
          {xi.map((p, i) => {
            const inner = (
              <>
                <div className="relative w-14 h-14 rounded-full ring-2 ring-white/80 overflow-hidden bg-neutral-800 flex items-center justify-center shadow-lg">
                  {p.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.logo} alt={koName(p)} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-lg font-black text-neutral-300">{koName(p).slice(0, 1)}</span>
                  )}
                  {p.goals > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-amber-400 text-neutral-900 text-[9px] font-black ring-1 ring-white">⚽{p.goals > 1 ? p.goals : ""}</span>
                  )}
                </div>
                <div className="mt-1 px-0.5 text-[11px] font-bold leading-tight text-center w-full break-keep text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
                  <span className="mr-0.5 align-middle">{p.flag}</span>{koName(p)}{p.captain && <span className="ml-0.5 text-amber-300">©</span>}
                </div>
                <div className="text-amber-400 text-[10px] leading-none tracking-tight">{"★".repeat(p.star)}<span className="text-white/25">{"★".repeat(5 - p.star)}</span></div>
                <div className="mt-0.5 inline-flex items-center rounded bg-emerald-500/20 px-1 text-[9px] font-bold text-emerald-300 leading-tight">평점 {p.rating.toFixed(1)}</div>
              </>
            );
            return (
              <div key={i} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%`, width: "88px" }}>
                {p.hasMv ? (
                  <Link href={`/transfers/${p.id}`} className="flex flex-col items-center hover:opacity-80 transition" title={`${koName(p)} 시장가치·이적 보기`}>{inner}</Link>
                ) : (
                  <div className="flex flex-col items-center">{inner}</div>
                )}
              </div>
            );
          })}
        </div>

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

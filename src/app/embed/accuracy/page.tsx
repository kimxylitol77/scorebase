// AI 적중률 성적표 임베드 위젯 — 외부 블로그가 iframe 으로 붙이는 화면(사이트 chrome 없음).
// URL: /embed/accuracy?period=d30|d14|d7|all&theme=light|dark
// 데이터는 /predictions/accuracy 와 같은 accuracy-stats.statForLeague (리그별 1X2 승·무·패 적중).
// 리그마다 Match 쿼리 하나라 revalidate 1h — 위젯은 "인용 자석" 용도라 실시간일 필요가 없다.
import type { Metadata } from "next";
import { ACCURACY_LEAGUES, statForLeague, type WindowKey } from "@/lib/predict/accuracy-stats";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";

export const revalidate = 3600;

const SITE_URL = process.env.SITE_URL ?? "https://www.scorebase.kr";
const PERIOD_LABEL: Record<WindowKey, string> = { all: "시즌 전체", d30: "최근 30일", d14: "최근 14일", d7: "최근 7일" };

export const metadata: Metadata = {
  title: "AI 적중률 성적표 위젯",
  robots: { index: false, follow: true },
};

export default async function AccuracyEmbed({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const p = one("period");
  const period: WindowKey = p === "all" || p === "d14" || p === "d7" ? p : "d30";
  const dark = one("theme") === "dark";

  let rows: Array<{ league: string; evaluated: number; correct: number; rate: number }> = [];
  try {
    const stats = await Promise.all(ACCURACY_LEAGUES.map((lg) => statForLeague(lg)));
    rows = stats
      .map((s) => ({ league: s.league, ...s.windows[period].oneXTwo }))
      .filter((r) => r.evaluated >= 10)
      .sort((a, b) => b.rate - a.rate);
  } catch {
    // 빌드 프리렌더 중 Neon 연결 실패 대비 — 빈 표로 렌더, revalidate 로 다음에 채움.
  }
  const total = rows.reduce((s, r) => s + r.evaluated, 0);
  const hits = rows.reduce((s, r) => s + r.correct, 0);

  const wrap = dark ? "bg-neutral-950 text-neutral-100" : "bg-white text-neutral-900";
  const sub = dark ? "text-neutral-400" : "text-neutral-500";
  const line = dark ? "border-neutral-800" : "border-neutral-200";
  const track = dark ? "bg-neutral-800" : "bg-neutral-100";

  return (
    <div className={`${wrap} min-h-screen px-3 py-3 font-sans text-[13px]`}>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h1 className="text-[15px] font-bold tracking-tight">AI 승부 예측 적중률 · {PERIOD_LABEL[period]}</h1>
        <a href={`${SITE_URL}/predictions/accuracy`} target="_blank" rel="noopener" className={`text-[11px] ${sub} hover:underline`}>
          제공: 스코어베이스 →
        </a>
      </div>
      {rows.length === 0 ? (
        <p className={`py-6 text-center ${sub}`}>집계 데이터를 준비 중입니다.</p>
      ) : (
        <>
          <p className={`mb-2 text-[11px] ${sub}`}>
            전체 {total.toLocaleString()}경기 중 {hits.toLocaleString()}경기 적중 ({total ? Math.round((hits / total) * 100) : 0}%) · 경기 전 승·무·패 예측 기준
          </p>
          <ul className="space-y-1">
            {rows.map((r) => {
              const pctv = Math.round(r.rate * 100);
              return (
                <li key={r.league} className={`border-b ${line} py-1.5`}>
                  <div className="flex items-center justify-between gap-2 tabular-nums">
                    <span className="truncate">{LEAGUE_DISPLAY[r.league] ?? r.league}</span>
                    <span className="shrink-0">
                      <span className="font-semibold">{pctv}%</span>
                      <span className={`ml-1.5 text-[11px] ${sub}`}>{r.correct}/{r.evaluated}</span>
                    </span>
                  </div>
                  <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${track}`}>
                    <div className="h-full bg-rose-500" style={{ width: `${pctv}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

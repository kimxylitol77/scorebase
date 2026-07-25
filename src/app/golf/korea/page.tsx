// 골프 한국 선수 시즌 성적 트래커 — PGA·LPGA 시즌 대회를 집계한 정적 JSON 렌더.
// ESPN 에 세계랭킹·선수통계가 없어(docs/golf-korea-tracker) 대회 리더보드를 자체 집계한 결과.
// 데이터 생성: scripts/build-golf-korea-season.ts → data/golf-korea-season.json

import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import GolfWorldRanking from "@/components/golf/GolfWorldRanking";
import PlayerValueTabs from "@/components/PlayerValueTabs";
import { golfEventKo } from "@/lib/sports/golf-events-ko";
import { SITE_URL } from "@/lib/site-url";
import seasonData from "../../../../data/golf-korea-season.json";

export const revalidate = 3600;

interface Recent {
  event: string;
  date: string;
  order: number | null;
  score: string | null;
}
interface Player {
  tour: "PGA" | "LPGA";
  name: string;
  nameKo: string | null;
  id: string | null;
  starts: number;
  wins: number;
  top10: number;
  best: number | null;
  recent: Recent[];
}
const DATA = seasonData as { year: string; updatedAt: string; players: Player[] };

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; view?: string }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  if (sp?.view === "world") {
    return {
      title: `골프 세계랭킹 — 남자 OWGR 순위 (한국어)`,
      description: `공식 세계골프랭킹(OWGR) 남자 top100 을 한국어로. 순위·전주 대비 등락·평균점수와 한국 선수 위치까지 한 곳에서 — 스코어베이스 골프.`,
      keywords: [
        "골프 세계랭킹", "OWGR", "남자 골프 랭킹", "세계 골프 순위", "골프 순위",
        "김시우 랭킹", "김주형 랭킹", "임성재 랭킹", "셰플러", "매킬로이",
      ],
      alternates: { canonical: `${SITE_URL}/golf/korea?view=world` },
    };
  }
  const tour = sp?.tour === "pga" ? "PGA" : "LPGA";
  return {
    title: `${tour} 한국 선수 시즌 성적 — 우승·톱10 (${DATA.year})`,
    description: `${DATA.year} ${tour} 투어에 출전한 한국 선수 성적을 한 곳에서. 선수별 우승·톱10·출전 횟수와 최근 대회 순위까지 한국어로 정리 — 스코어베이스 골프.`,
    keywords: [
      `${tour} 한국 선수`, "LPGA 한국 선수", "PGA 한국 선수", "골프 한국 선수 성적",
      "LPGA 우승", "유해란", "김효주", "김주형", "임성재", "골프 시즌 성적",
    ],
    alternates: { canonical: `${SITE_URL}/golf/korea${tour === "PGA" ? "?tour=pga" : ""}` },
  };
}

function medalTone(order: number | null): string {
  if (order === 1) return "text-amber-500 font-black";
  if (order != null && order <= 10) return "text-emerald-600 dark:text-emerald-400 font-bold";
  return "text-neutral-500";
}

export default async function GolfKoreaPage({
  searchParams,
}: {
  searchParams: Promise<{ tour?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const view: "korea" | "world" = sp?.view === "world" ? "world" : "korea";
  const tour: "PGA" | "LPGA" = sp?.tour === "pga" ? "PGA" : "LPGA";
  const players = DATA.players.filter((p) => p.tour === tour);

  const totalWins = players.reduce((s, p) => s + p.wins, 0);
  const totalTop10 = players.reduce((s, p) => s + p.top10, 0);

  return (
    <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />{" "}
          {view === "world" ? "골프 · 세계랭킹" : `골프 · ${DATA.year} 시즌`}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          {view === "world" ? "골프 세계랭킹" : "한국 선수 시즌 성적"}
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep">
          {view === "world"
            ? "공식 세계골프랭킹(OWGR) 남자 top100 을 한국어로. 한국 선수는 색으로 강조했습니다."
            : `${DATA.year} PGA·LPGA 투어에 출전한 한국 선수들의 우승·톱10·출전 기록을 한 곳에 모았습니다. 대회가 끝날 때마다 갱신됩니다.`}
        </p>
      </header>

      {view === "world" && <PlayerValueTabs active="/golf/korea?view=world" />}

      {/* 뷰 전환 — 한국 선수 / 세계랭킹 */}
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(
          [
            { key: "korea", label: "한국 선수", href: "/golf/korea" },
            { key: "world", label: "세계랭킹", href: "/golf/korea?view=world" },
          ] as const
        ).map((v) => {
          const on = view === v.key;
          return (
            <Link
              key={v.key}
              href={v.href}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </div>

      {view === "world" && <GolfWorldRanking />}

      {/* 투어 탭 */}
      {view !== "world" && (
      <>
      <div className="inline-flex rounded-full border border-neutral-200 bg-neutral-100/60 p-1 dark:border-neutral-800 dark:bg-white/[0.04]">
        {(["LPGA", "PGA"] as const).map((t) => {
          const on = tour === t;
          return (
            <Link
              key={t}
              href={t === "LPGA" ? "/golf/korea" : "/golf/korea?tour=pga"}
              aria-current={on ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-white font-bold text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-300"
                  : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
              }`}
            >
              {t === "LPGA" ? "LPGA 여자" : "PGA 남자"}
            </Link>
          );
        })}
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "출전 선수", value: `${players.length}명` },
          { label: "시즌 우승", value: `${totalWins}회` },
          { label: "톱10", value: `${totalTop10}회` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
            <p className="text-[11px] text-neutral-500">{s.label}</p>
            <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900 dark:text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {players.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 dark:border-neutral-700 p-10 text-center text-sm text-neutral-500">
          집계된 {tour} 한국 선수 기록이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
          <div className="grid grid-cols-[1fr_44px_44px_52px] sm:grid-cols-[1fr_64px_64px_72px] items-center gap-2 border-b border-neutral-100 px-3 sm:px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-neutral-400 dark:border-neutral-800">
            <span>선수</span>
            <span className="text-center">출전</span>
            <span className="text-center">우승</span>
            <span className="text-center">톱10</span>
          </div>
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {players.map((p) => (
              <li key={`${p.tour}-${p.name}`} className="px-3 sm:px-4 py-3">
                <div className="grid grid-cols-[1fr_44px_44px_52px] sm:grid-cols-[1fr_64px_64px_72px] items-center gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">
                      {p.nameKo ?? p.name}
                      {p.wins > 0 && (
                        <span className="ml-1.5 align-middle text-[10px] font-bold text-amber-500">
                          🏆 {p.wins}승
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-400">
                      {p.name}
                      {p.best != null && ` · 최고 ${p.best}위`}
                    </span>
                  </span>
                  <span className="text-center text-sm tabular-nums text-neutral-600 dark:text-neutral-400">{p.starts}</span>
                  <span className={`text-center text-sm tabular-nums ${p.wins > 0 ? "font-black text-amber-500" : "text-neutral-400"}`}>
                    {p.wins}
                  </span>
                  <span className={`text-center text-sm tabular-nums ${p.top10 > 0 ? "font-bold text-emerald-600 dark:text-emerald-400" : "text-neutral-400"}`}>
                    {p.top10}
                  </span>
                </div>
                {/* 최근 성적 */}
                {p.recent.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {p.recent.map((r, i) => (
                      <li
                        key={`${r.event}-${i}`}
                        className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 text-[11px] dark:bg-white/[0.04]"
                        title={`${r.event} (${r.date})`}
                      >
                        <span className="max-w-[140px] truncate text-neutral-500">{golfEventKo(r.event)}</span>
                        <span className={medalTone(r.order)}>{r.order != null ? `${r.order}위` : "-"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      </>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <Link
          href="/scores?sport=golf"
          className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 px-3.5 py-2 text-xs font-medium text-neutral-700 transition-all hover:-translate-y-0.5 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-white/[0.06]"
        >
          ⛳ 골프 라이브 리더보드
        </Link>
      </div>

      {view !== "world" && (
        <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2">
          종료된 대회 기준 집계이며, 공동 순위는 같은 순위로 계산합니다. 선수 이름은 한국어 위키백과를 우선 사용합니다.
          데이터 출처 ESPN · 마지막 갱신 {DATA.updatedAt.slice(0, 10)}.
        </footer>
      )}
    </main>
  );
}

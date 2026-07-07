// MLB Statcast 리더보드 페이지 — Baseball Savant 공개 데이터로 타구질(배럴·타구속도·하드히트·xwOBA) 상위.
// 선수 페이지 percentile 과 같은 소스를 리그 전체 순위로 확장.
import type { Metadata } from "next";
import Link from "next/link";
import { Radar, Info } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import StatcastLeaderboard from "@/components/baseball/StatcastLeaderboard";
import { getStatcastLeaderboard } from "@/lib/sports/mlb-statcast-leaderboard";

export const revalidate = 21600; // 6h — Savant CSV 갱신 주기와 정렬

export const metadata: Metadata = {
  title: "MLB Statcast 리더보드 — 배럴%·타구속도·하드히트%·xwOBA 상위",
  description:
    "메이저리그 타자의 타구질 지표 순위. 배럴 비율, 평균 타구속도, 하드히트 비율, 기대 가중출루율(xwOBA)을 선수·팀 단위로 정렬. 데이터 출처 Baseball Savant(Statcast).",
  alternates: { canonical: "https://www.scorebase.kr/baseball/statcast" },
};

const METRICS = [
  {
    name: "배럴%",
    desc: "타구속도와 발사각도가 최적 범위(장타로 이어지는 조합)에 든 타구의 비율. 파워+정확도의 핵심 지표.",
  },
  {
    name: "평균 타구속도",
    desc: "방망이에 맞은 타구의 평균 속도(mph). 높을수록 강한 타구를 꾸준히 만든다는 뜻.",
  },
  {
    name: "하드히트%",
    desc: "95mph 이상으로 맞힌 타구의 비율. 강한 타구를 얼마나 자주 만드는지를 본다.",
  },
  {
    name: "xwOBA",
    desc: "기대 가중출루율. 타구질(속도·각도)만으로 계산한 '운을 뺀 실제 타격 생산성'. 야구에서 가장 신뢰받는 종합 타격 지표 중 하나.",
  },
];

export default async function StatcastPage() {
  const { players, teams, year } = await getStatcastLeaderboard();

  return (
    <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <AmbientGlow />

      <header className="space-y-3">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <Radar className="h-3.5 w-3.5" aria-hidden /> Statcast · Baseball Savant
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight break-keep">
          MLB Statcast 리더보드
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 break-keep max-w-2xl leading-relaxed">
          단순 타율·홈런이 아니라 <strong>타구 자체의 질</strong>로 타자를 줄세웁니다. 얼마나 세게(타구속도),
          얼마나 이상적인 각도로(배럴), 얼마나 자주 강하게(하드히트) 맞히는지 — 그리고 그것을 종합한{" "}
          <strong>xwOBA</strong>. 우리 선수 페이지의 Statcast 퍼센타일과 같은 소스를 리그 전체 순위로 편 것입니다.
        </p>
      </header>

      {players.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-8 text-center">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            현재 Statcast 데이터를 불러오지 못했습니다. 시즌 초·오프시즌이거나 일시적 오류일 수 있어 잠시 후 다시 채워집니다.
          </p>
        </div>
      ) : (
        <>
          {/* 지표 설명 */}
          <div className="grid gap-3 sm:grid-cols-2">
            {METRICS.map((m) => (
              <div
                key={m.name}
                className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-white/[0.04] p-4"
              >
                <div className="flex items-center gap-1.5 text-sm font-bold text-neutral-900 dark:text-white">
                  <Info className="h-3.5 w-3.5 text-rose-500" aria-hidden />
                  {m.name}
                </div>
                <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed break-keep">
                  {m.desc}
                </p>
              </div>
            ))}
          </div>

          <StatcastLeaderboard players={players} teams={teams} year={year} />
        </>
      )}

      <footer className="text-[11px] text-neutral-400 leading-relaxed pt-2 space-y-1">
        <p>
          데이터 출처 Baseball Savant (Statcast, MLB 공식) · 규정타석 타자 기준 · 6시간마다 갱신. 선수 이름을 누르면 상세
          퍼센타일 페이지로 이동합니다.
        </p>
        <p>
          <Link href="/baseball" className="text-rose-600 dark:text-rose-400 hover:opacity-80">
            야구 허브로 →
          </Link>
        </p>
      </footer>
    </main>
  );
}

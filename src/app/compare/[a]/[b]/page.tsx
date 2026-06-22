// 선수 비교(head-to-head) 결과 — 두 선수 시즌 스탯을 레이더 오버레이 + 좌우 비교 표로. a,b = TheSports player id.
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Repeat2 } from "lucide-react";
import AmbientGlow from "@/components/AmbientGlow";
import ComparePlayerRadar from "@/components/ComparePlayerRadar";
import { toRadarAxes } from "@/lib/player-radar";
import { loadComparePlayer, type ComparePlayer } from "../../loadComparePlayer";

export const dynamic = "force-dynamic";

const EUR_KRW = 1791.5;
function krw(eurM: number): string {
  const eok = (eurM * 1e6 * EUR_KRW) / 1e8;
  if (eok >= 10000) return (eok / 10000).toFixed(2) + "조";
  return Math.round(eok).toLocaleString() + "억";
}

// canonical = 두 id 정렬 순서로 정규화(A/B·B/A 중복 색인 방지). 페이지는 URL 순서대로 좌/우 렌더.
function canonicalPair(a: string, b: string): string {
  const [x, y] = [a, b].sort();
  return `/compare/${x}/${y}`;
}

export async function generateMetadata({ params }: { params: Promise<{ a: string; b: string }> }): Promise<Metadata> {
  const { a, b } = await params;
  const [pa, pb] = await Promise.all([loadComparePlayer(a), loadComparePlayer(b)]);
  if (!pa || !pb) return { title: "선수 비교" };
  const title = `${pa.name} vs ${pb.name} 비교 · 시즌 스탯·레이더 | 스코어베이스`;
  const description = `${pa.name}과(와) ${pb.name}의 이번 시즌 골·도움·슈팅·패스·수비 지표를 레이더 차트와 표로 한눈에 비교. 스코어베이스 선수 비교.`;
  return {
    title,
    description,
    keywords: [`${pa.name} ${pb.name}`, `${pa.name} 비교`, "선수 비교", "스탯 비교", "스코어베이스"],
    openGraph: { title, description, type: "website" },
    alternates: { canonical: canonicalPair(a, b) },
  };
}

const num = (v: number | null | undefined) => v ?? 0;

// 비교 표 행 정의 — pct=백분율, lowerBetter=낮을수록 우위(경고·퇴장), gk=골키퍼만.
type NumStatKey =
  | "matches" | "starts" | "goals" | "assists" | "minutes" | "shots" | "sot"
  | "keyPasses" | "passAcc" | "tackles" | "interceptions" | "saves" | "yellow" | "red";
const ROWS: { label: string; key: NumStatKey; pct?: boolean; lowerBetter?: boolean; gk?: boolean }[] = [
  { label: "경기", key: "matches" },
  { label: "선발", key: "starts" },
  { label: "골", key: "goals" },
  { label: "도움", key: "assists" },
  { label: "출전 시간(분)", key: "minutes" },
  { label: "슛", key: "shots" },
  { label: "유효슛", key: "sot" },
  { label: "키패스", key: "keyPasses" },
  { label: "패스 정확도", key: "passAcc", pct: true },
  { label: "태클", key: "tackles" },
  { label: "인터셉트", key: "interceptions" },
  { label: "세이브", key: "saves", gk: true },
  { label: "경고", key: "yellow", lowerBetter: true },
  { label: "퇴장", key: "red", lowerBetter: true },
];

function PlayerHead({ p, side }: { p: ComparePlayer; side: "A" | "B" }) {
  const accent = side === "A" ? "text-rose-600 dark:text-rose-400" : "text-cyan-600 dark:text-cyan-400";
  const ring = side === "A" ? "ring-rose-500/30" : "ring-cyan-500/30";
  return (
    <Link
      href={`/transfers/${p.id}`}
      className="flex flex-col items-center text-center gap-2 group min-w-0 flex-1"
    >
      <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 overflow-hidden flex items-center justify-center ring-2 ${ring}`}>
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt={p.name} className="w-full h-full object-cover transition group-hover:scale-105" />
        ) : (
          <span className="text-2xl font-bold text-neutral-500">{p.name.slice(0, 1)}</span>
        )}
      </div>
      <div className="min-w-0">
        <div className="font-bold text-lg sm:text-xl tracking-tight break-keep group-hover:underline">{p.name}</div>
        <div className="text-xs text-neutral-500 truncate">
          {[p.posLabel, p.team, p.leagueLabel].filter(Boolean).join(" · ") || "—"}
        </div>
        {p.value != null && (
          <div className={`mt-1 text-sm font-black tabular-nums ${accent}`}>€{p.value}M <span className="font-normal text-neutral-400">{krw(p.value)}</span></div>
        )}
      </div>
    </Link>
  );
}

export default async function ComparePage({ params }: { params: Promise<{ a: string; b: string }> }) {
  const { a, b } = await params;
  const [pa, pb] = await Promise.all([loadComparePlayer(a), loadComparePlayer(b)]);
  if (!pa || !pb) notFound();

  const sa = pa.season;
  const sb = pb.season;
  const bothPlayable = !!sa && !!sb && num(sa.minutes) > 0 && num(sb.minutes) > 0;
  const hasGk = pa.posLabel === "GK" || pb.posLabel === "GK" || num(sa?.saves) > 0 || num(sb?.saves) > 0;

  // 표시할 행 — gk 행은 둘 중 하나라도 세이브 있을 때만
  const rows = ROWS.filter((r) => !r.gk || num(sa?.saves) > 0 || num(sb?.saves) > 0);

  return (
    <article className="relative max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-7">
      <AmbientGlow />
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/compare"
          className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 dark:text-rose-400"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden /> 선수 비교
        </Link>
        <Link
          href={`/compare/${b}/${a}`}
          className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition"
          title="좌우 바꾸기"
        >
          <Repeat2 className="h-3.5 w-3.5" aria-hidden /> 좌우 바꾸기
        </Link>
      </div>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-500 mb-3 text-center">선수 비교</p>
        <div className="flex items-start gap-3">
          <PlayerHead p={pa} side="A" />
          <span className="self-center text-sm font-black text-neutral-400 shrink-0 pt-8">VS</span>
          <PlayerHead p={pb} side="B" />
        </div>
      </header>

      {/* 레이더 오버레이 */}
      <section className="rounded-2xl bg-white p-4 sm:p-5 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <h2 className="text-base font-bold tracking-tight mb-3">
          <span className="bg-gradient-to-r from-rose-500 to-cyan-500 bg-clip-text text-transparent">시즌 지표 레이더</span>
        </h2>
        {bothPlayable ? (
          <>
            <ComparePlayerRadar axesA={toRadarAxes(sa!)} axesB={toRadarAxes(sb!)} nameA={pa.name} nameB={pb.name} />
            <p className="text-center text-[11px] text-neutral-400 mt-1">레이더에 마우스를 올리면 실제 수치가 표시됩니다 · 골/도움/키패스/태클/인터셉트는 90분당 기준</p>
            {hasGk && (
              <p className="text-center text-[11px] text-amber-600 dark:text-amber-400 mt-1">골키퍼는 필드플레이어 지표(공격·수비) 기준이라 레이더가 낮게 보일 수 있습니다 — 세이브는 아래 표 참고</p>
            )}
          </>
        ) : (
          <p className="text-sm text-neutral-500 py-8 text-center">두 선수 모두 이번 시즌 출전 기록이 있어야 레이더를 표시합니다.</p>
        )}
      </section>

      {/* 비교 표 */}
      <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-sm dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 dark:bg-white/[0.04] text-xs text-neutral-500">
            <tr>
              <th className="px-3 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400 w-1/3 truncate">{pa.name}</th>
              <th className="px-2 py-2.5 text-center font-medium">지표</th>
              <th className="px-3 py-2.5 text-left font-semibold text-cyan-600 dark:text-cyan-400 w-1/3 truncate">{pb.name}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 dark:divide-white/5">
            {rows.map((r) => {
              const va = num(sa?.[r.key]);
              const vb = num(sb?.[r.key]);
              const hasData = sa != null || sb != null;
              let aWin = false;
              let bWin = false;
              if (hasData && va !== vb) {
                const aBetter = r.lowerBetter ? va < vb : va > vb;
                aWin = aBetter;
                bWin = !aBetter;
              }
              const fmt = (v: number) => (r.pct ? `${Math.round(v)}%` : v.toLocaleString());
              return (
                <tr key={r.key}>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${aWin ? "font-black text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                    {sa ? fmt(va) : "—"}
                  </td>
                  <td className="px-2 py-2.5 text-center text-xs text-neutral-500 whitespace-nowrap">{r.label}</td>
                  <td className={`px-3 py-2.5 text-left tabular-nums ${bWin ? "font-black text-cyan-600 dark:text-cyan-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                    {sb ? fmt(vb) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        ⓘ 이번 시즌 성적 = 스코어베이스 데이터(TheSports). 레이더는 90분당·정확도 지표를 0~100 으로 정규화한 상대 비교용. 리그가 다르면 난이도 차이는 반영되지 않습니다.
      </p>
    </article>
  );
}

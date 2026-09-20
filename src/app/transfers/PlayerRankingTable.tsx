// /transfers 랭킹 뷰(종합·유망주·상승률) 공용 표 — 모바일 카드 + PC 컬럼. 행 클릭 → /transfers/[id].
import Link from "next/link";

export interface RankRowData {
  id: string;
  rank: number;
  name: string;
  photo: string | null;
  teamName: string;
  teamLogo: string | null;
  leagueName: string | null;
  leagueLogo: string | null;
  posCode: string | null;
  age: number | null;
  countryFlag: string | null;
  country: string | null;
  value: number; // €M
  hist: number[];
  stat: { n: number; g: number; a: number; rating: number | null } | null;
  // 종합·유망주
  score?: number;
  parts?: { label: string; pct: number }[];
  // 상승률
  v1y?: number;
  deltaPct?: number;
  deltaAbs?: number;
}

export type RankKind = "power" | "prospects" | "growth";

function Spark({ data }: { data: number[] }) {
  if (data.length < 2) return <svg width={70} height={26} className="shrink-0" aria-hidden />;
  const w = 70, h = 26, pad = 3;
  const max = Math.max(...data), min = Math.min(...data);
  const span = max - min || 1;
  const pts = data
    .map((v, i) => `${(pad + (i / (data.length - 1)) * (w - pad * 2)).toFixed(1)},${(pad + (1 - (v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
  const up = data[data.length - 1] >= data[0];
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={up ? "#10b981" : "#f43f5e"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ScoreBar({ score }: { score: number }) {
  const tone = score >= 80 ? "from-emerald-500 to-cyan-500" : score >= 60 ? "from-cyan-500 to-sky-500" : "from-neutral-400 to-neutral-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-neutral-100 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </div>
      <span className="w-11 text-right font-bold tabular-nums text-cyan-600 dark:text-cyan-400">{score.toFixed(1)}</span>
    </div>
  );
}

function Parts({ parts }: { parts: { label: string; pct: number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-neutral-500 tabular-nums" title="각 항목의 풀 내 백분위(0~100)">
      {parts.map((p) => (
        <span key={p.label}>
          {p.label} <span className="font-semibold text-neutral-700 dark:text-neutral-300">{Math.round(p.pct)}</span>
        </span>
      ))}
    </div>
  );
}

function StatLine({ stat }: { stat: RankRowData["stat"] }) {
  if (!stat || stat.n === 0) return <span className="text-neutral-400">기록 없음</span>;
  return (
    <span className="tabular-nums">
      {stat.n}경기 {stat.g}골 {stat.a}도움{stat.rating != null ? <> · 평점 <span className="font-semibold text-neutral-700 dark:text-neutral-300">{stat.rating.toFixed(2)}</span></> : null}
    </span>
  );
}

function Delta({ pct, abs }: { pct: number; abs: number }) {
  const up = abs >= 0;
  return (
    <div className={`font-bold tabular-nums ${up ? "text-emerald-500" : "text-rose-500"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="text-[11px] font-semibold opacity-80">({up ? "+" : "−"}€{Math.abs(abs)}M)</span>
    </div>
  );
}

const CARD = "overflow-hidden rounded-3xl border border-neutral-200/80 bg-white dark:border-white/10 dark:bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:shadow-none divide-y divide-neutral-100 dark:divide-white/5 mt-4";
const ROW = "flex items-center gap-3 px-4 lg:px-5 py-3 hover:bg-neutral-50 dark:hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]";

export default function PlayerRankingTable({ kind, rows, emptyText }: { kind: RankKind; rows: RankRowData[]; emptyText: string }) {
  if (rows.length === 0) return <p className="text-sm text-neutral-500 py-20 text-center">{emptyText}</p>;
  const isGrowth = kind === "growth";
  const scoreHead = kind === "power" ? "종합 지수" : "유망주 지수";
  return (
    <>
      {/* 모바일·태블릿 카드 */}
      <div className={`lg:hidden ${CARD}`}>
        {rows.map((p) => (
          <Link key={p.id} href={`/transfers/${p.id}`} className={ROW}>
            <div className={`w-6 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
            <Photo p={p} />
            <div className="flex-1 min-w-0">
              {/* 이름은 한 줄 통째로 — 포지션·나이는 둘째 줄(375px 에서 이름 잘림 방지) */}
              <div className="font-bold truncate">{p.name}</div>
              <div className="text-xs text-neutral-500 truncate flex items-center gap-1">
                {p.posCode && <span className="px-1 py-px rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500 shrink-0">{p.posCode}</span>}
                {p.age ? <span className="shrink-0">{p.age}세 ·</span> : null}
                {p.teamLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.teamLogo} alt="" className="w-3.5 h-3.5 object-contain inline-block" />
                )}
                <span className="truncate">{p.teamName}</span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5 truncate">
                {isGrowth ? <>€{p.v1y}M → €{p.value}M</> : <StatLine stat={p.stat} />}
              </div>
            </div>
            <div className="w-[96px] shrink-0 text-right leading-tight">
              {isGrowth ? (
                <Delta pct={p.deltaPct ?? 0} abs={p.deltaAbs ?? 0} />
              ) : (
                <>
                  <ScoreBar score={p.score ?? 0} />
                  <div className="text-[11px] text-neutral-500 tabular-nums mt-0.5">€{p.value}M</div>
                </>
              )}
            </div>
          </Link>
        ))}
      </div>
      {/* PC 컬럼 */}
      <div className={`hidden lg:block ${CARD}`}>
        <div className="flex items-center gap-3 px-5 py-2.5 text-[11px] font-semibold text-neutral-400 bg-neutral-50 dark:bg-white/[0.03]">
          <div className="w-12 text-center shrink-0">순위</div>
          <div className="flex-1 min-w-0">이름</div>
          <div className="w-12 text-center shrink-0">나이</div>
          <div className="w-14 text-center shrink-0">포지션</div>
          <div className="w-44 shrink-0">소속팀</div>
          {isGrowth ? (
            <>
              <div className="w-[76px] shrink-0 text-center">추이</div>
              <div className="w-36 shrink-0 text-right">1년 전 → 현재</div>
              <div className="w-36 shrink-0 text-right">변동</div>
            </>
          ) : (
            <>
              <div className="w-52 shrink-0">이번 시즌</div>
              <div className="w-56 shrink-0">{scoreHead}</div>
              <div className="w-20 shrink-0 text-right">몸값</div>
            </>
          )}
        </div>
        {rows.map((p) => (
          <Link key={p.id} href={`/transfers/${p.id}`} className={ROW}>
            <div className={`w-12 text-center font-bold tabular-nums shrink-0 ${p.rank <= 3 ? "text-cyan-500" : "text-neutral-400"}`}>{p.rank}</div>
            <div className="flex-1 min-w-0 flex items-center gap-3">
              <Photo p={p} />
              <div className="min-w-0">
                <div className="font-bold truncate">{p.name}</div>
                <div className="text-[11px] text-neutral-500 flex items-center gap-1 min-w-0">
                  {p.countryFlag && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.countryFlag} alt="" aria-hidden className="w-4 h-3 object-cover rounded-[1px] shrink-0" />
                  )}
                  <span className="truncate">{p.country || ""}</span>
                </div>
              </div>
            </div>
            <div className="w-12 text-center text-sm tabular-nums shrink-0 text-neutral-600 dark:text-neutral-300">{p.age ?? "—"}</div>
            <div className="w-14 text-center shrink-0">
              {p.posCode ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-500">{p.posCode}</span> : <span className="text-neutral-300">—</span>}
            </div>
            <div className="w-44 shrink-0 flex items-center gap-2 min-w-0">
              {p.teamLogo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm text-neutral-600 dark:text-neutral-300 truncate">{p.teamName}</div>
                {p.leagueName && (
                  <div className="text-[11px] text-neutral-500 flex items-center gap-1 truncate">
                    {p.leagueLogo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.leagueLogo} alt="" className="w-3.5 h-3.5 object-contain shrink-0" />
                    )}
                    {p.leagueName}
                  </div>
                )}
              </div>
            </div>
            {isGrowth ? (
              <>
                <div className="w-[76px] shrink-0 flex justify-center"><Spark data={p.hist} /></div>
                <div className="w-36 shrink-0 text-right text-sm tabular-nums text-neutral-600 dark:text-neutral-300">
                  €{p.v1y}M → <span className="font-bold text-cyan-600 dark:text-cyan-400">€{p.value}M</span>
                </div>
                <div className="w-36 shrink-0 text-right"><Delta pct={p.deltaPct ?? 0} abs={p.deltaAbs ?? 0} /></div>
              </>
            ) : (
              <>
                <div className="w-52 shrink-0 text-xs text-neutral-500"><StatLine stat={p.stat} /></div>
                <div className="w-56 shrink-0">
                  <ScoreBar score={p.score ?? 0} />
                  {p.parts && <Parts parts={p.parts} />}
                </div>
                <div className="w-20 shrink-0 text-right font-bold tabular-nums text-neutral-600 dark:text-neutral-300">€{p.value}M</div>
              </>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}

function Photo({ p }: { p: RankRowData }) {
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-neutral-200 to-neutral-300 dark:from-neutral-700 dark:to-neutral-800 shrink-0 overflow-hidden flex items-center justify-center ring-1 ring-black/5 dark:ring-white/10">
      {p.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photo} alt={p.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-sm font-bold text-neutral-500 dark:text-neutral-400">{p.name.slice(0, 1)}</span>
      )}
    </div>
  );
}

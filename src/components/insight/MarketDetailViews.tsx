// 오버언더·BTTS 마켓 심화 뷰 — AI 예측 종합의 서브탭 콘텐츠 (서버 렌더).
// 확률 바 + 시장 배당 대비 + 양 팀 최근 경기 이력 뱃지. 데이터는 MatchInsight 가 계산해 주입.

import type { ReactNode } from "react";

/** 팀별 최근 경기 한 줄 — 총득점(오버 판정)·양팀득점(BTTS 판정) 공용. */
export interface RecentRow {
  /** "07.26" 형태 경기일 (KST) */
  date: string;
  /** 상대 팀 한글명 */
  opp: string;
  homeScore: number;
  awayScore: number;
  /** 이 팀이 홈이었는지 */
  wasHome: boolean;
}

function ProbBar({
  leftLabel,
  rightLabel,
  leftPct,
  tone,
}: {
  leftLabel: string;
  rightLabel: string;
  leftPct: number; // 0~100
  tone: "orange" | "pink";
}) {
  const left = Math.min(99, Math.max(1, Math.round(leftPct)));
  const toneCls = tone === "orange" ? "bg-orange-500" : "bg-pink-500";
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-zinc-900 dark:text-white">
          {leftLabel} {left}%
        </span>
        <span className="text-zinc-500 dark:text-white/50">
          {rightLabel} {100 - left}%
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-zinc-200 dark:bg-white/10 overflow-hidden">
        <div className={`h-full ${toneCls}`} style={{ width: `${left}%` }} />
      </div>
    </div>
  );
}

/** 시장 배당 → 내재 확률(%) — vig 미제거 근사. 배당 없으면 null. */
function impliedPct(odds: number | null | undefined): number | null {
  return odds && odds > 1 ? Math.round((1 / odds) * 100) : null;
}

function Badge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex min-w-[2.6rem] justify-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : "bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-white/45"
      }`}
    >
      {label}
    </span>
  );
}

function RecentTable({
  teamName,
  rows,
  judge,
}: {
  teamName: string;
  rows: RecentRow[];
  judge: (r: RecentRow) => { ok: boolean; label: string };
}) {
  if (rows.length === 0) return null;
  const hit = rows.filter((r) => judge(r).ok).length;
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-bold text-zinc-700 dark:text-white/70">{teamName}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-white/45">
          최근 {rows.length}경기 중 {hit}회
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r, i) => {
          const j = judge(r);
          return (
            <li key={i} className="flex items-center gap-2 text-[11px] text-zinc-600 dark:text-white/55">
              <span className="w-10 shrink-0 tabular-nums text-zinc-400 dark:text-white/35">{r.date}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.wasHome ? "vs" : "@"} {r.opp}
              </span>
              <span className="shrink-0 tabular-nums">
                {r.homeScore}-{r.awayScore}
              </span>
              <Badge ok={j.ok} label={j.label} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ModelVsMarket({
  modelPct,
  marketPct,
  marketLabel,
}: {
  modelPct: number;
  marketPct: number | null;
  marketLabel: string;
}) {
  if (marketPct == null) return null;
  const edge = Math.round(modelPct) - marketPct;
  return (
    <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
      시장 배당 내재 확률 {marketLabel} {marketPct}% · 모델과의 차이{" "}
      <span className={edge >= 3 ? "font-bold text-emerald-600 dark:text-emerald-400" : edge <= -3 ? "font-bold text-rose-500" : ""}>
        {edge >= 0 ? "+" : ""}
        {edge}%p
      </span>
      {Math.abs(edge) >= 3 && " — 모델과 시장의 시각이 갈리는 지점"}
    </p>
  );
}

/** 오버언더 심화 탭. */
export function OverUnderDetail({
  line,
  pOver,
  expectedTotal,
  homeName,
  awayName,
  homeRows,
  awayRows,
  oddsOver,
  oddsUnder,
  dcProbOver25,
  resultNote,
}: {
  line: number;
  pOver: number;
  expectedTotal: number;
  homeName: string;
  awayName: string;
  homeRows: RecentRow[];
  awayRows: RecentRow[];
  oddsOver?: number | null;
  oddsUnder?: number | null;
  dcProbOver25?: number | null;
  resultNote?: ReactNode;
}) {
  const judge = (r: RecentRow) => {
    const t = r.homeScore + r.awayScore;
    return { ok: t > line, label: t > line ? `O ${t}` : `U ${t}` };
  };
  return (
    <div className="space-y-4">
      <ProbBar
        leftLabel={`OVER ${line}`}
        rightLabel={`UNDER ${line}`}
        leftPct={pOver * 100}
        tone="orange"
      />
      <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
        모델 기대 총득점 {expectedTotal.toFixed(1)} · 기준선 {line}
        {dcProbOver25 != null && ` · Dixon-Coles OVER 2.5 확률 ${Math.round(dcProbOver25 * 100)}%`}
      </p>
      <ModelVsMarket
        modelPct={pOver * 100}
        marketPct={impliedPct(oddsOver)}
        marketLabel={`OVER ${line}`}
      />
      {impliedPct(oddsUnder) != null && (
        <p className="-mt-3 text-[11px] text-zinc-400 dark:text-white/30">
          (UNDER {line} 내재 확률 {impliedPct(oddsUnder)}%)
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <RecentTable teamName={homeName} rows={homeRows} judge={judge} />
        <RecentTable teamName={awayName} rows={awayRows} judge={judge} />
      </div>
      {resultNote}
    </div>
  );
}

/** BTTS(양 팀 득점) 심화 탭 — 축구 전용. */
export function BttsDetail({
  pBtts,
  homeName,
  awayName,
  homeRows,
  awayRows,
  oddsBttsYes,
  oddsBttsNo,
  dcProbBttsYes,
  resultNote,
}: {
  pBtts: number;
  homeName: string;
  awayName: string;
  homeRows: RecentRow[];
  awayRows: RecentRow[];
  oddsBttsYes?: number | null;
  oddsBttsNo?: number | null;
  dcProbBttsYes?: number | null;
  resultNote?: ReactNode;
}) {
  const judge = (r: RecentRow) => {
    const yes = r.homeScore > 0 && r.awayScore > 0;
    return { ok: yes, label: yes ? "YES" : "NO" };
  };
  return (
    <div className="space-y-4">
      <ProbBar leftLabel="양 팀 득점 YES" rightLabel="NO" leftPct={pBtts * 100} tone="pink" />
      {dcProbBttsYes != null && (
        <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-white/45">
          Dixon-Coles 득점 모델 기준 양 팀 득점 확률 {Math.round(dcProbBttsYes * 100)}%
        </p>
      )}
      <ModelVsMarket modelPct={pBtts * 100} marketPct={impliedPct(oddsBttsYes)} marketLabel="YES" />
      {impliedPct(oddsBttsNo) != null && (
        <p className="-mt-3 text-[11px] text-zinc-400 dark:text-white/30">
          (NO 내재 확률 {impliedPct(oddsBttsNo)}%)
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <RecentTable teamName={homeName} rows={homeRows} judge={judge} />
        <RecentTable teamName={awayName} rows={awayRows} judge={judge} />
      </div>
      {resultNote}
    </div>
  );
}

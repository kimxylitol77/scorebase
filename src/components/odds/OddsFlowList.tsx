// 축구 배당 흐름 목록 — "어느 쪽으로 배당이 움직이나(=돈이 몰리나)"를 그래프+자연어로. 클릭 시 업체별 상세.
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import TeamBadge from "@/components/TeamBadge";
import { LEAGUE_DISPLAY, getLeagueFlag } from "@/lib/sports/sport-leagues";

export type BookRec = {
  nm: string;
  h: number;
  d: number | null;
  a: number;
  tl?: number;
  ov?: number;
  un?: number;
  hl?: number;
  hh?: number;
  ha?: number;
};

export type FlowMatch = {
  id: number;
  league: string;
  status: string;
  startTime: number;
  homeKo: string;
  awayKo: string;
  homeLogo: string | null;
  awayLogo: string | null;
  movementSide: "home" | "draw" | "away";
  movementLabel: string;
  points: number[]; // 가장 크게 움직인 결과의 배당 시계열 (오래된→최신)
  series: { t: number; home: number; draw: number | null; away: number }[]; // 홈·무·원정 전체 시계열
  openOdds: number | null;
  currentOdds: number | null;
  deltaPct: number; // 음수면 해당 결과의 배당 하락
  bestOdds: number | null;
  modelProb: number | null;
  marketProb: number | null;
  lastUpdatedAt: number | null;
  books: BookRec[];
};

const C_DROP = "#d97706"; // 배당 하락
const C_RISE = "#2563eb"; // 배당 상승
const C_FLAT = "#b4b2a9"; // 잠잠

// 멀티라인 그래프 — 결과별 색 (홈/무/원정 궤적)
const C_HOME = "#2563eb"; // 홈
const C_DRAWLINE = "#9ca3af"; // 무
const C_AWAY = "#e24b4a"; // 원정
const SIDE_COLOR: Record<"home" | "draw" | "away", string> = {
  home: C_HOME,
  draw: C_DRAWLINE,
  away: C_AWAY,
};

type Tone = -1 | 0 | 1;

// 흐름을 사람 말로 — 배당 변동은 시장 이동 신호일 뿐, 확정적인 근거는 아니다.
function narrate(m: FlowMatch): { tone: Tone; text: string } {
  const enough = m.points.length >= 2 && m.openOdds != null && m.currentOdds != null;
  if (!enough)
    return { tone: 0, text: `${m.homeKo} vs ${m.awayKo} · 배당 흐름을 모으는 중` };
  const d = m.deltaPct;
  const op = (m.openOdds as number).toFixed(2);
  const cu = (m.currentOdds as number).toFixed(2);
  if (Math.abs(d) < 1.5)
    return { tone: 0, text: `${m.homeKo} vs ${m.awayKo} · 아직 큰 움직임 없음` };
  if ((m.currentOdds as number) < (m.openOdds as number))
    return { tone: 1, text: `${m.movementLabel} 배당 하락 (${op} → ${cu})` };
  return { tone: -1, text: `${m.movementLabel} 배당 상승 (${op} → ${cu})` };
}

function toneColor(t: Tone): string {
  return t === 1 ? C_DROP : t === -1 ? C_RISE : C_FLAT;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const z = (x: number) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${z(d.getHours())}:${z(d.getMinutes())}`;
}

// 홈 배당 시계열 그래프
function Spark({
  points,
  color,
  w,
  h,
  strokeW = 2.5,
}: {
  points: number[];
  color: string;
  w: number;
  h: number;
  strokeW?: number;
}) {
  if (points.length < 2)
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} aria-hidden="true">
        <line
          x1="0"
          x2={w}
          y1={h / 2}
          y2={h / 2}
          stroke={C_FLAT}
          strokeWidth="1.5"
          strokeDasharray="3,4"
        />
      </svg>
    );
  const pad = strokeW + 1;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const n = points.length;
  const xOf = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const yOf = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const d = points.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const lx = xOf(n - 1);
  const ly = yOf(points[n - 1]);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={strokeW + 1} fill={color} />
    </svg>
  );
}

// 배당을 내재확률로 변환해 세 결과를 같은 축에 겹친다 — 돈이 어디로 몰리는지 직관적.
// 마진 제거를 위해 매 시점 합=1로 정규화. 배당 하락 = 확률 상승 = 선이 위로.
function impliedSeries(
  series: FlowMatch["series"],
  hasDraw: boolean,
): { home: number; draw: number | null; away: number }[] {
  return series.map((p) => {
    const ih = p.home > 0 ? 1 / p.home : 0;
    const id = hasDraw && p.draw != null && p.draw > 0 ? 1 / p.draw : 0;
    const ia = p.away > 0 ? 1 / p.away : 0;
    const s = ih + id + ia || 1;
    return { home: ih / s, draw: hasDraw ? id / s : null, away: ia / s };
  });
}

// 홈·무·원정 세 궤적을 내재확률로 겹쳐 그린다. movementSide 궤적을 진하게 강조.
function MultiSpark({
  series,
  hasDraw,
  movementSide,
  w,
  h,
  strokeW = 2,
}: {
  series: FlowMatch["series"];
  hasDraw: boolean;
  movementSide: "home" | "draw" | "away";
  w: number;
  h: number;
  strokeW?: number;
}) {
  const probs = impliedSeries(series, hasDraw);
  const n = probs.length;
  if (n < 2)
    return (
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} aria-hidden="true">
        <line x1="0" x2={w} y1={h / 2} y2={h / 2} stroke={C_FLAT} strokeWidth="1.5" strokeDasharray="3,4" />
      </svg>
    );
  const all: number[] = [];
  probs.forEach((p) => {
    all.push(p.home, p.away);
    if (p.draw != null) all.push(p.draw);
  });
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const pad = strokeW + 2;
  const xOf = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const yOf = (v: number) => pad + (1 - (v - min) / range) * (h - pad * 2);
  const lines: { key: "home" | "draw" | "away"; vals: number[] }[] = [
    { key: "home", vals: probs.map((p) => p.home) },
    ...(hasDraw ? [{ key: "draw" as const, vals: probs.map((p) => p.draw as number) }] : []),
    { key: "away", vals: probs.map((p) => p.away) },
  ];
  // 강조 궤적을 마지막에 그려 맨 위에 오게 한다.
  lines.sort((a, b) => (a.key === movementSide ? 1 : 0) - (b.key === movementSide ? 1 : 0));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: w, height: h }} preserveAspectRatio="none" aria-hidden="true">
      {lines.map((ln) => {
        const emph = ln.key === movementSide;
        const d = ln.vals.map((v, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
        const lastX = xOf(n - 1);
        const lastY = yOf(ln.vals[n - 1]);
        return (
          <g key={ln.key}>
            <path
              d={d}
              fill="none"
              stroke={SIDE_COLOR[ln.key]}
              strokeWidth={emph ? strokeW + 0.8 : strokeW}
              strokeOpacity={emph ? 1 : 0.3}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {emph && <circle cx={lastX} cy={lastY} r={strokeW + 1} fill={SIDE_COLOR[ln.key]} />}
          </g>
        );
      })}
    </svg>
  );
}

function deltaLabel(m: FlowMatch): string {
  if (m.points.length < 2 || m.openOdds == null || m.currentOdds == null) return "";
  const d = m.deltaPct;
  if (Math.abs(d) < 1.5) return "";
  return `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(0)}%`;
}

function relativeTime(ms: number | null): string {
  if (!ms) return "갱신 시각 없음";
  const diff = Math.max(0, Math.floor((Date.now() - ms) / 60_000));
  if (diff < 1) return "방금 갱신";
  if (diff < 60) return `${diff}분 전 갱신`;
  return `${Math.floor(diff / 60)}시간 전 갱신`;
}

function modelEdge(m: FlowMatch): number | null {
  if (m.modelProb == null || m.marketProb == null) return null;
  return (m.modelProb - m.marketProb) * 100;
}

// AI 예측과 시장(배당 내재확률)의 괴리를 회원 언어로. 부호가 핵심 인사이트다.
// edge>0 = 돈 몰리는 쪽을 AI도 높게 봄(근거 있음), edge<0 = 돈은 몰리는데 AI는 신중(과열 경고).
function edgeNote(m: FlowMatch): { text: string; tag: string; tone: "agree" | "caution" } | null {
  const e = modelEdge(m);
  if (e == null || Math.abs(e) < 5) return null;
  if (e >= 5)
    return {
      text: `AI 예측도 ${m.movementLabel} 쪽으로 기울어요 — 흐름에 근거가 있습니다`,
      tag: `AI 동의 +${e.toFixed(0)}%p`,
      tone: "agree",
    };
  return {
    text: `돈은 ${m.movementLabel} 쪽인데 AI 예측은 더 신중해요 — 시장 과열일 수 있습니다`,
    tag: `AI 신중 −${Math.abs(e).toFixed(0)}%p`,
    tone: "caution",
  };
}

// ── 업체별 상세 (클릭 시) — 종목별 마켓 라벨 ──
const MARKET_LABELS: Record<string, string[]> = {
  soccer: ["승·무·패", "오버언더", "핸디캡"],
  baseball: ["머니라인", "오버언더", "런라인"],
  basketball: ["머니라인", "오버언더", "스프레드"],
};

function mode(arr: number[]): number {
  const c: Record<number, number> = {};
  let best = arr[0];
  let bn = 0;
  for (const v of arr) {
    c[v] = (c[v] || 0) + 1;
    if (c[v] > bn) {
      bn = c[v];
      best = v;
    }
  }
  return best;
}

function Cell({ v, best }: { v: number | null | undefined; best: number }) {
  return (
    <div
      className={`text-center tabular-nums ${
        v != null && v === best
          ? "rounded bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
          : ""
      }`}
    >
      {v != null ? v.toFixed(2) : "-"}
    </div>
  );
}

function MarketTable({ books, tab, hasDraw }: { books: BookRec[]; tab: number; hasDraw: boolean }) {
  if (tab === 0) {
    const bh = Math.max(...books.map((b) => b.h));
    const ba = Math.max(...books.map((b) => b.a));
    // 축구=승/무/패(3), 야구·농구=승/패(2, 무승부 없음)
    if (hasDraw) {
      const bd = Math.max(...books.filter((b) => b.d != null).map((b) => b.d as number), 0);
      return (
        <div>
          <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-400">승 · 무 · 패</div>
          {books.map((b) => (
            <div
              key={b.nm}
              className="grid grid-cols-[1fr_52px_52px_52px] items-center gap-1.5 border-b border-neutral-100 px-3 py-2 text-[13px] dark:border-neutral-800"
            >
              <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
              <Cell v={b.h} best={bh} />
              <Cell v={b.d} best={bd} />
              <Cell v={b.a} best={ba} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div>
        <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-400">홈 승 · 원정 승</div>
        {books.map((b) => (
          <div
            key={b.nm}
            className="grid grid-cols-[1fr_60px_60px] items-center gap-1.5 border-b border-neutral-100 px-3 py-2 text-[13px] dark:border-neutral-800"
          >
            <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
            <Cell v={b.h} best={bh} />
            <Cell v={b.a} best={ba} />
          </div>
        ))}
      </div>
    );
  }
  if (tab === 1) {
    const tb = books.filter((b) => b.tl != null);
    if (!tb.length) return <div className="px-3 py-2 text-[13px] text-neutral-400">오버언더 제공 업체 없음</div>;
    const ln = mode(tb.map((b) => b.tl as number));
    const f = tb.filter((b) => b.tl === ln);
    const bo = Math.max(...f.map((b) => b.ov as number));
    const bu = Math.max(...f.map((b) => b.un as number));
    return (
      <div>
        <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-400">기준선 {ln} · 오버 · 언더</div>
        {f.map((b) => (
          <div
            key={b.nm}
            className="grid grid-cols-[1fr_52px_52px] items-center gap-1.5 border-b border-neutral-100 px-3 py-2 text-[13px] dark:border-neutral-800"
          >
            <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
            <Cell v={b.ov} best={bo} />
            <Cell v={b.un} best={bu} />
          </div>
        ))}
      </div>
    );
  }
  const sb = books.filter((b) => b.hl != null);
  if (!sb.length)
    return <div className="px-3 py-2 text-[13px] text-neutral-400">이 라인의 핸디캡 제공 업체가 적음</div>;
  const ln = mode(sb.map((b) => b.hl as number));
  const f = sb.filter((b) => b.hl === ln);
  const bhh = Math.max(...f.map((b) => b.hh as number));
  const bha = Math.max(...f.map((b) => b.ha as number));
  return (
    <div>
      <div className="px-3 pb-1 pt-1 text-[11px] text-neutral-400">
        핸디캡 홈 {ln > 0 ? "+" : ""}
        {ln} · 홈 · 원정
      </div>
      {f.map((b) => (
        <div
          key={b.nm}
          className="grid grid-cols-[1fr_52px_52px] items-center gap-1.5 border-b border-neutral-100 px-3 py-2 text-[13px] dark:border-neutral-800"
        >
          <div className="truncate text-neutral-600 dark:text-neutral-300">{b.nm}</div>
          <Cell v={b.hh} best={bhh} />
          <Cell v={b.ha} best={bha} />
        </div>
      ))}
    </div>
  );
}

// ── 상세 펼침 (업체별) ──
function Detail({ m, sport, hasDraw }: { m: FlowMatch; sport: string; hasDraw: boolean }) {
  const [tab, setTab] = useState(0);
  const labels = MARKET_LABELS[sport] ?? MARKET_LABELS.soccer;
  if (!m.books.length)
    return (
      <div className="px-3 py-3 text-[13px] text-neutral-400">업체별 배당은 아직 수집 전이에요.</div>
    );
  return (
    <div>
      <div className="flex gap-2 px-2 py-3">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={`rounded-lg border px-4 py-1.5 text-[13px] ${
              tab === i
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
                : "border-neutral-200 text-neutral-500 dark:border-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <MarketTable books={m.books} tab={tab} hasDraw={hasDraw} />
    </div>
  );
}

// ── 큰 히어로 카드 ──
function Hero({ m, hasDraw }: { m: FlowMatch; hasDraw: boolean }) {
  const nar = narrate(m);
  const color = toneColor(nar.tone);
  const dl = deltaLabel(m);
  const edge = modelEdge(m);
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
      <div className="mb-3 flex items-center gap-1.5 text-[12px] font-medium text-rose-500">
        <span className="inline-flex h-2 w-2 rounded-full bg-rose-500" />
        지금 시장이 가장 크게 움직이는 경기
      </div>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-2xl font-medium leading-tight sm:text-[26px]">
            <TeamBadge logoUrl={m.homeLogo} size={22} />
            <span className="truncate">{m.homeKo}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-lg text-neutral-400">
            <TeamBadge logoUrl={m.awayLogo} size={18} />
            <span className="truncate">{m.awayKo}</span>
          </div>
          <div className="mt-2 text-[12px] text-neutral-400">
            {getLeagueFlag(m.league)} {LEAGUE_DISPLAY[m.league] ?? m.league} · {fmtTime(m.startTime)}
          </div>
        </div>
        {m.currentOdds != null && (
          <div className="text-right">
            <div className="text-[32px] font-medium leading-none tabular-nums" style={{ color }}>
              {m.currentOdds.toFixed(2)}
            </div>
            {dl && (
              <div className="mt-1.5 text-[15px] font-medium" style={{ color }}>
                {m.openOdds?.toFixed(2)} → {m.currentOdds.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mb-1 mt-4">
        {m.series.length >= 2 ? (
          <MultiSpark series={m.series} hasDraw={hasDraw} movementSide={m.movementSide} w={600} h={80} strokeW={3} />
        ) : (
          <Spark points={m.points} color={color} w={600} h={80} strokeW={3} />
        )}
      </div>
      {m.series.length >= 2 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          <LineKey color={C_HOME} label={m.homeKo} emph={m.movementSide === "home"} />
          {hasDraw && <LineKey color={C_DRAWLINE} label="무승부" emph={m.movementSide === "draw"} />}
          <LineKey color={C_AWAY} label={m.awayKo} emph={m.movementSide === "away"} />
          <span className="text-neutral-400">선이 위로 오를수록 그쪽으로 돈이 몰리는 중</span>
        </div>
      )}
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-[15px] leading-relaxed"
        style={{
          background: nar.tone === 1 ? "rgba(29,158,117,0.1)" : nar.tone === -1 ? "rgba(226,75,74,0.1)" : "rgba(180,178,169,0.12)",
          color,
        }}
      >
        <span
          className="mt-0.5 inline-block h-4 w-4 flex-shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span>{nar.text}</span>
      </div>
      {(() => {
        const en = edgeNote(m);
        if (!en) return null;
        return (
          <div
            className={`mt-2 flex items-start gap-2 rounded-xl px-4 py-2.5 text-[14px] leading-relaxed ${
              en.tone === "agree"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"
            }`}
          >
            <span>{en.tone === "agree" ? "✓" : "!"}</span>
            <span>{en.text}</span>
          </div>
        );
      })()}
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] sm:grid-cols-4">
        <Metric label="움직인 결과" value={m.movementLabel} />
        <Metric label="최고 배당" value={m.bestOdds?.toFixed(2) ?? "-"} />
        <Metric label="AI-시장 차이" value={edge == null ? "데이터 없음" : `${edge >= 0 ? "+" : ""}${edge.toFixed(0)}%p`} tone={edge != null && edge >= 5 ? "positive" : undefined} />
        <Metric label="데이터 상태" value={relativeTime(m.lastUpdatedAt)} />
      </div>
    </div>
  );
}

function LineKey({ color, label, emph }: { color: string; label: string; emph: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-1 w-5 rounded-full" style={{ background: color, opacity: emph ? 1 : 0.4 }} />
      <span className={emph ? "font-medium" : ""} style={emph ? { color } : undefined}>
        {label}
      </span>
    </span>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="text-[10px] text-neutral-400">{label}</div>
      <div className={`mt-0.5 truncate font-medium tabular-nums ${tone === "positive" ? "text-emerald-700 dark:text-emerald-400" : "text-neutral-700 dark:text-neutral-200"}`}>{value}</div>
    </div>
  );
}

// ── 일반 흐름 카드 ──
function FlowCard({ m, sport, hasDraw }: { m: FlowMatch; sport: string; hasDraw: boolean }) {
  const [open, setOpen] = useState(false);
  const nar = narrate(m);
  const color = toneColor(nar.tone);
  const dl = deltaLabel(m);
  const dim = nar.tone === 0;
  const en = edgeNote(m);
  return (
    <div className={`rounded-xl border border-neutral-200 dark:border-neutral-800 ${dim ? "opacity-60" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 bg-white px-4 py-3 text-left dark:bg-neutral-900"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[16px] font-medium leading-snug">
            <TeamBadge logoUrl={m.homeLogo} size={17} />
            <span className="truncate">{m.homeKo}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[16px] leading-snug text-neutral-400">
            <TeamBadge logoUrl={m.awayLogo} size={15} />
            <span className="truncate">{m.awayKo}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]" style={{ color: dim ? undefined : color }}>
            <span>{nar.text}</span>
            {m.bestOdds != null && <span className="text-neutral-400">최고 {m.bestOdds.toFixed(2)}</span>}
            {en && (
              <span
                className={`font-medium ${
                  en.tone === "agree"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-500"
                }`}
              >
                {en.tag}
              </span>
            )}
          </div>
        </div>
        {m.series.length >= 2 ? (
          <MultiSpark series={m.series} hasDraw={hasDraw} movementSide={m.movementSide} w={110} h={46} strokeW={2} />
        ) : (
          <Spark points={m.points} color={color} w={110} h={46} />
        )}
        {dl && (
          <div className="w-16 flex-shrink-0 text-right" style={{ color }}>
            <div className="text-[18px] font-medium leading-none tabular-nums">{dl}</div>
            <div className="mt-1 text-[10px] font-normal text-neutral-400">
              {m.movementLabel} {m.deltaPct < 0 ? "하락" : "상승"}
            </div>
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-white/[0.02]">
          <Detail m={m} sport={sport} hasDraw={hasDraw} />
          <div className="px-3 pb-3 pt-1">
            <div className="mb-2 text-[11px] text-neutral-400">{relativeTime(m.lastUpdatedAt)} · 최고 배당은 초록색으로 표시됩니다.</div>
            <Link
              href={`/live/${m.league.toLowerCase()}/${m.id}`}
              className="text-[12px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              이 경기 자세히 보기 — 승·무·패 변동 + 업체별 배당 →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

const SPORT_TABS: [string, string][] = [
  ["soccer", "축구"],
  ["baseball", "야구"],
  ["basketball", "농구"],
];

type MovementFilter = "drop" | "all" | "rise";

function MovementFilters({ value, onChange }: { value: MovementFilter; onChange: (value: MovementFilter) => void }) {
  const items: Array<[MovementFilter, string]> = [
    ["drop", "배당 하락"],
    ["all", "전체"],
    ["rise", "배당 상승"],
  ];
  return (
    <div className="mt-5 flex items-center gap-2 overflow-x-auto pb-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`flex-none rounded-md border px-3 py-1.5 text-[13px] transition ${
            value === key
              ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
              : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SportTabs({ sport }: { sport: string }) {
  return (
    <div className="mt-4 flex gap-2">
      {SPORT_TABS.map(([s, label]) => (
        <a
          key={s}
          href={`/odds?sport=${s}`}
          className={`rounded-lg px-4 py-1.5 text-[14px] ${
            s === sport
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "border border-neutral-200 text-neutral-500 dark:border-neutral-700"
          }`}
        >
          {label}
        </a>
      ))}
    </div>
  );
}

export default function OddsFlowList({
  matches,
  sport,
  hasDraw,
}: {
  matches: FlowMatch[];
  sport: string;
  hasDraw: boolean;
}) {
  // 전체 목록을 기본으로 두고, 사용자가 필요할 때만 강한 변동을 거른다.
  const [movementFilter, setMovementFilter] = useState<MovementFilter>("all");
  const filteredMatches = useMemo(() => {
    if (movementFilter === "drop") return matches.filter((m) => m.deltaPct <= -1.5);
    if (movementFilter === "rise") return matches.filter((m) => m.deltaPct >= 1.5);
    return matches;
  }, [matches, movementFilter]);

  if (!matches.length)
    return (
      <div>
        <h1 className="text-2xl font-medium">배당 흐름</h1>
        <SportTabs sport={sport} />
        <div className="py-16 text-center text-[15px] text-neutral-400">
          아직 배당 흐름을 모으는 중이에요. 잠시 후 다시 확인해 주세요.
        </div>
      </div>
    );

  const displayMatches = filteredMatches.length ? filteredMatches : matches;
  const hero = displayMatches[0];
  const rest = displayMatches.slice(1);
  const heroMoves = hero.points.length >= 2 && Math.abs(hero.deltaPct) >= 3;

  return (
    <div>
      <h1 className="text-2xl font-medium">배당 흐름</h1>
      <SportTabs sport={sport} />
      <p className="mt-4 text-[14px] text-neutral-500 dark:text-neutral-400">
        홈·무·원정 배당을 확률로 바꿔 시간에 따라 어디로 돈이 몰리는지 겹쳐서 보여줍니다. 선이 위로 오를수록 그쪽으로 돈이 몰리는 중이며, 시장 이동 신호일 뿐 결과를 보장하지 않습니다.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
        <LineKey color={C_HOME} label="홈" emph />
        {hasDraw && <LineKey color={C_DRAWLINE} label="무승부" emph />}
        <LineKey color={C_AWAY} label="원정" emph />
        <span className="text-neutral-400">굵은 선 = 가장 크게 움직인 결과</span>
      </div>

      <MovementFilters value={movementFilter} onChange={setMovementFilter} />

      {!filteredMatches.length && (
        <p className="mt-4 rounded-lg border border-dashed border-neutral-200 px-4 py-3 text-[13px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          이 기준에 맞는 큰 변동은 아직 없습니다. 전체 경기로 보여드릴게요.
        </p>
      )}

      {heroMoves && (
        <div className="mt-5">
          <Hero m={hero} hasDraw={hasDraw} />
        </div>
      )}

      <div className="mb-2 mt-6 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        {movementFilter === "drop" ? "배당 하락 폭이 큰 순" : movementFilter === "rise" ? "배당 상승 폭이 큰 순" : heroMoves ? "많이 움직인 순" : "예정 경기"}
      </div>
      <div className="space-y-2">
        {(heroMoves ? rest : displayMatches).map((m) => (
          <FlowCard key={m.id} m={m} sport={sport} hasDraw={hasDraw} />
        ))}
      </div>
    </div>
  );
}

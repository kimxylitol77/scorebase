// 축구 배당 흐름 목록 — "어느 쪽으로 배당이 움직이나(=돈이 몰리나)"를 그래프+자연어로. 클릭 시 업체별 상세.
"use client";

import { useState } from "react";
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
  points: number[]; // 홈 배당 시계열 (오래된→최신)
  openH: number | null;
  curH: number | null;
  deltaPct: number; // 홈 배당 변동률(%) — 음수면 배당 하락(홈 몰림)
  books: BookRec[];
};

const C_DROP = "#1d9e75"; // 배당 내려감 = 돈 몰림 (초록)
const C_RISE = "#e24b4a"; // 배당 올라감 = 돈 빠짐 (빨강)
const C_FLAT = "#b4b2a9"; // 잠잠

type Tone = -1 | 0 | 1;

// 흐름을 사람 말로 — 배당 변동 방향/폭 → 자연어
function narrate(m: FlowMatch): { tone: Tone; text: string } {
  const enough = m.points.length >= 2 && m.openH != null && m.curH != null;
  if (!enough)
    return { tone: 0, text: `${m.homeKo} vs ${m.awayKo} · 배당 흐름을 모으는 중` };
  const d = m.deltaPct;
  const op = (m.openH as number).toFixed(2);
  const cu = (m.curH as number).toFixed(2);
  if (Math.abs(d) < 1.5)
    return { tone: 0, text: `${m.homeKo} vs ${m.awayKo} · 아직 큰 움직임 없음` };
  if ((m.curH as number) < (m.openH as number))
    return { tone: 1, text: `${m.homeKo} 쪽으로 돈이 몰리는 중 (${op} → ${cu})` };
  return { tone: -1, text: `${m.awayKo} 쪽으로 흐름이 기우는 중 (홈 ${op} → ${cu})` };
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

function deltaLabel(m: FlowMatch): string {
  if (m.points.length < 2 || m.openH == null || m.curH == null) return "";
  const d = m.deltaPct;
  if (Math.abs(d) < 1.5) return "";
  return `${d < 0 ? "−" : "+"}${Math.abs(d).toFixed(0)}%`;
}

// ── 업체별 상세 (클릭 시) ──
const MARKETS = ["1X2", "오버언더", "핸디캡"] as const;

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

function MarketTable({ books, tab }: { books: BookRec[]; tab: number }) {
  if (tab === 0) {
    const bh = Math.max(...books.map((b) => b.h));
    const bd = Math.max(...books.filter((b) => b.d != null).map((b) => b.d as number), 0);
    const ba = Math.max(...books.map((b) => b.a));
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
function Detail({ m }: { m: FlowMatch }) {
  const [tab, setTab] = useState(0);
  if (!m.books.length)
    return (
      <div className="px-3 py-3 text-[13px] text-neutral-400">업체별 배당은 아직 수집 전이에요.</div>
    );
  return (
    <div>
      <div className="flex gap-2 px-2 py-3">
        {MARKETS.map((label, i) => (
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
      <MarketTable books={m.books} tab={tab} />
    </div>
  );
}

// ── 큰 히어로 카드 ──
function Hero({ m }: { m: FlowMatch }) {
  const nar = narrate(m);
  const color = toneColor(nar.tone);
  const dl = deltaLabel(m);
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
        {m.curH != null && (
          <div className="text-right">
            <div className="text-[32px] font-medium leading-none tabular-nums" style={{ color }}>
              {m.curH.toFixed(2)}
            </div>
            {dl && (
              <div className="mt-1.5 text-[15px] font-medium" style={{ color }}>
                {m.openH?.toFixed(2)} → {m.curH.toFixed(2)}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="my-4">
        <Spark points={m.points} color={color} w={600} h={80} strokeW={3} />
      </div>
      <div
        className="flex items-start gap-2 rounded-xl px-4 py-3 text-[15px] leading-relaxed"
        style={{
          background: nar.tone === 1 ? "rgba(29,158,117,0.1)" : nar.tone === -1 ? "rgba(186,117,23,0.1)" : "rgba(180,178,169,0.12)",
          color,
        }}
      >
        <span
          className="mt-0.5 inline-block h-4 w-4 flex-shrink-0 rounded-full"
          style={{ background: color }}
        />
        <span>{nar.text}</span>
      </div>
    </div>
  );
}

// ── 일반 흐름 카드 ──
function FlowCard({ m }: { m: FlowMatch }) {
  const [open, setOpen] = useState(false);
  const nar = narrate(m);
  const color = toneColor(nar.tone);
  const dl = deltaLabel(m);
  const dim = nar.tone === 0;
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
          <div className="mt-1.5 text-[13px]" style={{ color: dim ? undefined : color }}>
            {nar.text}
          </div>
        </div>
        <Spark points={m.points} color={color} w={110} h={46} />
        {dl && (
          <div className="w-16 flex-shrink-0 text-right" style={{ color }}>
            <div className="text-[18px] font-medium leading-none tabular-nums">{dl}</div>
            <div className="mt-1 text-[10px] font-normal text-neutral-400">
              {m.deltaPct < 0 ? "홈 배당 하락" : "홈 배당 상승"}
            </div>
          </div>
        )}
      </button>
      {open && (
        <div className="border-t border-neutral-100 bg-neutral-50/50 dark:border-neutral-800 dark:bg-white/[0.02]">
          <Detail m={m} />
          <div className="px-3 pb-3 pt-1">
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

export default function OddsFlowList({ matches }: { matches: FlowMatch[] }) {
  if (!matches.length)
    return (
      <div>
        <h1 className="text-2xl font-medium">축구 배당 흐름</h1>
        <div className="py-16 text-center text-[15px] text-neutral-400">
          배당 흐름을 모으는 중이에요. 잠시 후 다시 확인해 주세요.
        </div>
      </div>
    );

  const hero = matches[0];
  const rest = matches.slice(1);
  const heroMoves = hero.points.length >= 2 && Math.abs(hero.deltaPct) >= 3;

  return (
    <div>
      <h1 className="text-2xl font-medium">축구 배당 흐름</h1>
      <p className="mt-1 text-[14px] text-neutral-500 dark:text-neutral-400">
        배당이 어느 쪽으로 움직이는지 — 내려갈수록 그쪽으로 돈이 몰리는 거예요.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-6 rounded-full" style={{ background: C_DROP }} />
          <span style={{ color: C_DROP }}>내려감 = 돈 몰림</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-6 rounded-full" style={{ background: C_RISE }} />
          <span style={{ color: C_RISE }}>올라감 = 돈 빠짐</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1 w-6 rounded-full" style={{ background: C_FLAT }} />
          <span className="text-neutral-400">잠잠</span>
        </span>
      </div>

      {heroMoves && (
        <div className="mt-5">
          <Hero m={hero} />
        </div>
      )}

      <div className="mb-2 mt-6 text-[13px] font-medium text-neutral-500 dark:text-neutral-400">
        {heroMoves ? "많이 움직인 순" : "예정 경기"}
      </div>
      <div className="space-y-2">
        {(heroMoves ? rest : matches).map((m) => (
          <FlowCard key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

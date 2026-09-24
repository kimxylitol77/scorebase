"use client";
// 라인업 임팩트 탭 — 확정 타순의 기대득점(xR) 게이지 + 선수별 교체 Δ 워터폴. databallr 의 게이지·워터폴 문법을
// 우리 토큰(라이트 로즈 / 다크 elevated)으로. 산식은 src/lib/sports/baseball/lineup-impact.ts, 계산은 서버(page.tsx)에서.
import Link from "next/link";
import { useState } from "react";
import type { LineupImpact, PlayerImpact, WowySplit } from "@/lib/sports/baseball/lineup-impact";
import { WOWY_MIN_GAMES } from "@/lib/sports/baseball/lineup-impact";

export interface LineupImpactSide {
  teamName: string;
  impact: LineupImpact;
}

interface Props {
  home: LineupImpactSide;
  away: LineupImpactSide;
  league: { rpg: number; woba: number; fallback: boolean };
  /** MLB pid → 한글 선수명 (page.tsx buildMlbPlayerNameKoMap, 사전에 있는 선수만) */
  nameKoBy?: Record<number, string>;
  /** pid → 출전/결장 경기 팀 득점 (2단계 WOWY). 없으면 줄 생략 */
  wowy?: Record<number, WowySplit>;
}

type Unit = "game" | "pa";

const fmt = (v: number, d = 2) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(d);
const fmtWoba = (v: number) => v.toFixed(3).replace(/^0/, "");

/** xR 게이지 — 리그 평균을 12시로 두고 ±1.5점을 반원 양끝으로. */
function Gauge({ label, xr, rpg, accent }: { label: string; xr: number; rpg: number; accent: boolean }) {
  const span = 1.5;
  const t = Math.max(-1, Math.min(1, (xr - rpg) / span)); // -1..1
  const r = 44, cx = 56, cy = 56;
  const a = (deg: number) => ({ x: cx + r * Math.cos((deg * Math.PI) / 180), y: cy + r * Math.sin((deg * Math.PI) / 180) });
  const start = a(180), end = a(360);
  const cur = a(180 + 180 * ((t + 1) / 2));
  const largeArc = (t + 1) / 2 > 0.5 ? 1 : 0;
  const stroke = accent ? "stroke-rose-500 dark:stroke-rose-400" : "stroke-sky-500 dark:stroke-sky-400";
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 112 64" className="h-16 w-28" aria-hidden="true">
        <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`} className="fill-none stroke-neutral-200 dark:stroke-white/10" strokeWidth="6" strokeLinecap="round" />
        <path d={`M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${cur.x} ${cur.y}`} className={`fill-none ${stroke}`} strokeWidth="6" strokeLinecap="round" />
        <line x1={cx} y1={cy - r + 4} x2={cx} y2={cy - r - 6} className="stroke-neutral-400 dark:stroke-neutral-500" strokeWidth="1.5" />
        <circle cx={cur.x} cy={cur.y} r="4" className={accent ? "fill-rose-500 dark:fill-rose-400" : "fill-sky-500 dark:fill-sky-400"} />
      </svg>
      <div className="-mt-3 text-2xl font-bold tabular-nums tracking-tight">{xr.toFixed(2)}</div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">{label} 기대득점</div>
      <div className={`mt-0.5 text-xs font-semibold tabular-nums ${xr >= rpg ? "text-emerald-600 dark:text-emerald-400" : "text-neutral-500"}`}>
        리그 평균 {rpg.toFixed(2)} 대비 {fmt(xr - rpg)}
      </div>
    </div>
  );
}

/** 워터폴 — 타순 순서로 Δ 를 누적. 점선이 누적합. */
/** 출전/결장 팀 득점 한 줄 — 표본이 적으면 차이를 숫자로 내지 않는다 */
function WowyLine({ w }: { w: WowySplit | undefined }) {
  if (!w || w.rpgWith == null) return null;
  const diffCls = w.diff == null ? "text-neutral-400" : w.diff >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  return (
    <span className="block text-[10px] leading-snug tabular-nums text-neutral-400 break-keep" title="이 선수가 선발일 때와 아닐 때 팀 경기당 득점 (올 시즌, 이 경기 제외)">
      출전 {w.rpgWith.toFixed(2)}
      <span className="text-neutral-300 dark:text-neutral-600">({w.gpWith}G)</span>
      {w.rpgWithout != null ? (
        <>
          {" · 결장 "}{w.rpgWithout.toFixed(2)}
          <span className="text-neutral-300 dark:text-neutral-600">({w.gpWithout}G)</span>
          {" "}
          <span className={`font-semibold ${diffCls}`}>{w.diff == null ? `표본 ${WOWY_MIN_GAMES}G 미만` : fmt(w.diff)}</span>
        </>
      ) : (
        <span> · 결장 없음</span>
      )}
    </span>
  );
}

function Waterfall({ players, unit, nameKoBy, accent, wowy }: { players: PlayerImpact[]; unit: Unit; nameKoBy?: Record<number, string>; accent: boolean; wowy?: Record<number, WowySplit> }) {
  const vals = players.map((p) => (unit === "game" ? p.delta : p.delta / p.paPerGame));
  const max = Math.max(0.05, ...vals.map((v) => Math.abs(v)));
  let run = 0;
  const cum = vals.map((v) => (run += v));
  const total = run;
  const best = vals.indexOf(Math.max(...vals));
  return (
    <div>
      <ul className="divide-y divide-neutral-100 dark:divide-white/5">
        {players.map((p, i) => {
          const v = vals[i];
          const w = (Math.abs(v) / max) * 50; // 좌우 50% 씩
          const pos = v >= 0;
          const hi = i === best;
          return (
            <li key={p.pid} className={`grid grid-cols-[1.5rem_minmax(0,1.7fr)_minmax(0,1fr)_3.4rem] items-center gap-2 px-2 py-1.5 text-sm ${hi ? "rounded-lg bg-rose-50/70 dark:bg-white/[0.05]" : ""}`}>
              <span className="text-[11px] font-bold tabular-nums text-neutral-400">{p.slot}</span>
              <span className="min-w-0 leading-tight">
                <Link href={`/players/${p.pid}`} className={`block truncate hover:underline ${hi ? "font-semibold" : ""}`}>{nameKoBy?.[p.pid] ?? p.name}</Link>
                <span className="block truncate text-[10px] tabular-nums text-neutral-400">
                  wOBA {fmtWoba(p.woba)}
                  {p.shrunk && <span className="ml-1 rounded bg-neutral-100 px-1 text-neutral-500 dark:bg-white/10" title={`시즌 ${p.pa}타석 — 표본 부족, 리그 평균 쪽으로 보정`}>표본 {p.pa}</span>}
                </span>
                <WowyLine w={wowy?.[p.pid]} />
              </span>
              <span className="relative h-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-neutral-300 dark:bg-white/20" />
                <span
                  className={`absolute inset-y-0 rounded-sm ${pos ? (accent ? "bg-rose-500/80 dark:bg-rose-400/80" : "bg-sky-500/80 dark:bg-sky-400/80") : "bg-neutral-400/70 dark:bg-neutral-500/70"}`}
                  style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
                {/* 누적합 눈금 — 타순을 내려오며 어디까지 쌓였는지 */}
                <span className="absolute -inset-y-0.5 w-px -translate-x-1/2 bg-neutral-700 dark:bg-neutral-200" style={{ left: `${50 + (Math.max(-max, Math.min(max, cum[i])) / max) * 50}%` }} title={`누적 ${fmt(cum[i])}`} />
              </span>
              <span className={`text-right text-xs font-semibold tabular-nums ${pos ? "text-neutral-800 dark:text-neutral-100" : "text-neutral-500"}`}>{fmt(v)}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex items-center justify-between px-2 text-[11px] text-neutral-500">
        <span>벤치 평균 타자로 전원 교체 대비</span>
        <span className="font-semibold tabular-nums text-neutral-700 dark:text-neutral-200">합계 {fmt(total)}{unit === "game" ? "점/경기" : "점/타석"}</span>
      </div>
    </div>
  );
}

export default function LineupImpactCard({ home, away, league, nameKoBy, wowy }: Props) {
  const [unit, setUnit] = useState<Unit>("game");
  const sides: Array<{ side: LineupImpactSide; accent: boolean }> = [
    { side: away, accent: false },
    { side: home, accent: true },
  ];
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5 shadow-[0_24px_70px_-30px_rgba(15,23,30,0.18)] dark:bg-white/[0.04] dark:ring-white/10 dark:shadow-none sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold">라인업 임팩트</h3>
          <p className="mt-0.5 text-[11px] text-neutral-500 break-keep">
            확정 타순 9명의 시즌 wOBA 를 선형가중치로 득점 환산한 기대득점. 막대는 그 선수 대신 벤치 평균 타자가 들어갔을 때의 변화.
          </p>
        </div>
        <div className="inline-flex rounded-full bg-neutral-100 p-0.5 text-[11px] font-semibold dark:bg-white/10" role="tablist" aria-label="단위">
          {(["game", "pa"] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              role="tab"
              aria-selected={unit === u}
              onClick={() => setUnit(u)}
              className={`rounded-full px-3 py-1 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${unit === u ? "bg-white text-neutral-900 shadow-sm dark:bg-white/[0.12] dark:text-white" : "text-neutral-500"}`}
            >
              {u === "game" ? "경기당" : "타석당"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        {sides.map(({ side, accent }) => (
          <div key={side.teamName} className="rounded-xl bg-neutral-50 py-3 dark:bg-white/[0.03]">
            <Gauge label={side.teamName} xr={side.impact.xr} rpg={league.rpg} accent={accent} />
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sides.map(({ side, accent }) => (
          <section key={side.teamName}>
            <div className="mb-1 flex items-center justify-between px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
              <span>{side.teamName}</span>
              <span className="normal-case tracking-normal">
                벤치 wOBA {fmtWoba(side.impact.benchWoba)}
                {side.impact.benchFallback && <span className="ml-1 text-neutral-400">(리그 평균 대체)</span>}
              </span>
            </div>
            <Waterfall players={side.impact.players} unit={unit} nameKoBy={nameKoBy} accent={accent} wowy={wowy} />
          </section>
        ))}
      </div>

      <p className="mt-4 text-[10px] leading-relaxed text-neutral-400 break-keep">
        wOBA 가중치 uBB .69 · HBP .72 · 1B .89 · 2B 1.27 · 3B 1.62 · HR 2.10, 득점 환산 스케일 1.2. 타석수는 타순 기준(1번 4.65 → 9번 3.77).
        시즌 50타석 미만은 리그 평균 쪽으로 보정. 리그 기준 R/G {league.rpg.toFixed(2)} · wOBA {fmtWoba(league.woba)}
        {league.fallback ? " (고정값)" : " (시즌 30팀 합계)"}. 수비·투수·구장은 반영하지 않는다.
        {wowy && " 출전·결장 득점은 올 시즌 선발 라인업 기준이며 이 경기는 제외, 어느 쪽이든 10경기 미만이면 차이를 표시하지 않는다."}
      </p>
    </div>
  );
}

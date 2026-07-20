"use client";
// 2026 월드컵 녹아웃 브래킷 — 데스크탑 좌우 미러링 트리(가운데 결승 수렴) + 모바일 라운드 탭.
// flex-1 슬라이스 + 가운데 정렬로 라운드별 카드가 자동으로 페어 중앙에 위치 → 커넥터 정합.
// 팀 hover/대한민국 토글로 결승까지 경로 하이라이트. AI advance 확률 배지 통합.
import { useState } from "react";
import Link from "next/link";
import { Trophy, Sparkles } from "lucide-react";
import type { BracketSlot, BracketTeamRef, WcRound } from "@/lib/predict/wc-bracket";
import { WC_ROUND_LABEL, WC_ROUND_DATES } from "@/lib/predict/wc-bracket";

const ROUND_TABS: WcRound[] = ["r32", "r16", "qf", "sf", "final"];

function kst(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul",
  }).format(d);
}

export default function WcBracket({ slots, koreaTeamId }: { slots: BracketSlot[]; koreaTeamId: number | null }) {
  const [hot, setHot] = useState<number | null>(null);
  const [tab, setTab] = useState<WcRound>("r32");
  const [koreaOn, setKoreaOn] = useState(false);

  const active = koreaOn ? koreaTeamId : hot;
  const byNo = (n: number) => slots.find((s) => s.matchNo === n)!;
  const topR32 = slots.filter((s) => s.round === "r32" && s.half === "top").sort((a, b) => a.order - b.order);
  const botR32 = slots.filter((s) => s.round === "r32" && s.half === "bottom").sort((a, b) => a.order - b.order);
  const col = (round: WcRound, half: "top" | "bottom") =>
    slots.filter((s) => s.round === round && s.half === half).sort((a, b) => a.order - b.order);

  const ctx = { active, setHot };

  // 우승 배너 — 결승(M104) 종료 + 승자 해석 시에만 표시 (DB 스코어 기반, 하드코딩 금지)
  const finalSlot = slots.find((s) => s.round === "final" && s.matchNo === 104);
  const champion =
    finalSlot && finalSlot.status === "FINISHED"
      ? finalSlot.home.won
        ? finalSlot.home
        : finalSlot.away.won
          ? finalSlot.away
          : null
      : null;
  const runnerUp = champion
    ? finalSlot!.home.won
      ? finalSlot!.away
      : finalSlot!.home
    : null;

  return (
    <div className="space-y-4">
      {champion && (
        <div className="relative overflow-hidden rounded-[1.5rem] sm:rounded-[2rem] shadow-sm">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_60%)]" />
          <div className="flex flex-col gap-1.5 px-5 py-5 text-white sm:flex-row sm:items-center sm:gap-4">
            <Trophy className="h-9 w-9 shrink-0 drop-shadow" aria-hidden />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-85">
                FIFA World Cup 2026 Champion
              </div>
              <div className="text-xl font-bold tracking-tight sm:text-2xl">
                {champion.flag ? `${champion.flag} ` : ""}
                {champion.nameKo ?? champion.name ?? champion.label} 우승
              </div>
              {runnerUp && finalSlot!.homeScore != null && finalSlot!.awayScore != null && (
                <div className="mt-0.5 text-xs opacity-90 sm:text-sm">
                  결승 {finalSlot!.home.nameKo ?? finalSlot!.home.label}{" "}
                  {finalSlot!.homeScore} - {finalSlot!.awayScore}{" "}
                  {finalSlot!.away.nameKo ?? finalSlot!.away.label}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* 컨트롤 + 범례 */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-3 text-[11px] text-neutral-500">
          <Legend className="bg-emerald-500" label="진출" />
          <Legend className="bg-rose-500" label="LIVE" />
          <Legend className="bg-amber-500" label="3위 와일드카드" />
          <span className="hidden sm:inline-flex items-center gap-1"><Sparkles className="w-3 h-3 text-violet-500" />AI 진출 확률</span>
        </div>
        {koreaTeamId != null && (
          <button
            onClick={() => setKoreaOn((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
              koreaOn
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
            }`}
          >
            🇰🇷 대한민국 경로 {koreaOn ? "끄기" : "보기"}
          </button>
        )}
      </div>

      {/* ── 데스크탑: 좌우 미러링 트리 (lg+) ── */}
      <div className="hidden lg:block overflow-x-auto">
        <div className="flex items-stretch justify-center gap-2 min-w-max py-2">
          {/* 좌측 (top half) */}
          <HalfTree
            mirror={false}
            columns={[
              { round: "r32", label: WC_ROUND_LABEL.r32, list: topR32 },
              { round: "r16", label: WC_ROUND_LABEL.r16, list: col("r16", "top") },
              { round: "qf", label: WC_ROUND_LABEL.qf, list: col("qf", "top") },
              { round: "sf", label: WC_ROUND_LABEL.sf, list: col("sf", "top") },
            ]}
            ctx={ctx}
          />
          {/* 가운데 결승 + 3·4위전 */}
          <CenterColumn final={byNo(104)} third={byNo(103)} ctx={ctx} />
          {/* 우측 (bottom half, 미러) */}
          <HalfTree
            mirror
            columns={[
              { round: "sf", label: WC_ROUND_LABEL.sf, list: col("sf", "bottom") },
              { round: "qf", label: WC_ROUND_LABEL.qf, list: col("qf", "bottom") },
              { round: "r16", label: WC_ROUND_LABEL.r16, list: col("r16", "bottom") },
              { round: "r32", label: WC_ROUND_LABEL.r32, list: botR32 },
            ]}
            ctx={ctx}
          />
        </div>
      </div>

      {/* ── 모바일·태블릿: 라운드 탭 + 세로 카드 (<lg) ── */}
      <div className="lg:hidden space-y-4">
        <div className="flex gap-1 p-1 rounded-2xl bg-neutral-100 dark:bg-neutral-900 overflow-x-auto">
          {ROUND_TABS.map((r) => (
            <button
              key={r}
              onClick={() => setTab(r)}
              className={`flex-1 min-w-0 px-3 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition ${
                tab === r
                  ? "bg-white dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm"
                  : "text-neutral-500 dark:text-neutral-400"
              }`}
            >
              {WC_ROUND_LABEL[r]}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-neutral-500 -mt-1">{WC_ROUND_LABEL[tab]} · {WC_ROUND_DATES[tab]} (현지)</div>
        <div className="space-y-2.5">
          {slots
            .filter((s) => s.round === tab)
            .sort((a, b) => (a.half === b.half ? a.order - b.order : a.half === "top" ? -1 : 1))
            .map((s) => (
              <MatchCard key={s.matchNo} slot={s} ctx={ctx} wide />
            ))}
          {tab === "final" && <MatchCard slot={byNo(103)} ctx={ctx} wide />}
        </div>
      </div>

      <p className="text-[11px] text-neutral-400 leading-relaxed">
        대진은 FIFA 고정 슬롯(Match 73~104) 기준. 조 1·2위는 현재 순위로, 조 3위 8팀은 실제 대진 발표 후 채워집니다.
        진출 확률은 자체 Elo 기반 추정으로 배당·전망과 다를 수 있습니다.
      </p>
    </div>
  );
}

interface Ctx {
  active: number | null;
  setHot: (n: number | null) => void;
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block w-2 h-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

interface ColDef {
  round: WcRound;
  label: string;
  list: BracketSlot[];
}

function HalfTree({ columns, mirror, ctx }: { columns: ColDef[]; mirror: boolean; ctx: Ctx }) {
  return (
    <div className="flex flex-col">
      {/* 라운드 헤더 */}
      <div className="flex">
        {columns.map((c, i) => (
          <div key={c.round} className="contents">
            <div className="w-[182px] text-center text-[10px] font-bold tracking-[0.18em] uppercase text-neutral-400 pb-2">
              {c.label}
            </div>
            {i < columns.length - 1 && <div className="w-8 shrink-0" />}
          </div>
        ))}
      </div>
      <div className="flex flex-1 min-h-[700px]">
        {columns.map((c, i) => (
          <div key={c.round} className="contents">
            <div className="w-[182px] flex flex-col">
              {c.list.map((s) => (
                <div key={s.matchNo} className="flex-1 flex flex-col justify-center">
                  <MatchCard slot={s} ctx={ctx} />
                </div>
              ))}
            </div>
            {i < columns.length - 1 && <Connector count={columns[i + 1].list.length} mirror={mirror} />}
          </div>
        ))}
      </div>
    </div>
  );
}

// 커넥터 컬럼 — 받는 라운드 카드 수만큼 "}" 모양 엘보. flex-1 정렬로 페어 중앙에 자동 정렬.
function Connector({ count, mirror }: { count: number; mirror: boolean }) {
  return (
    <div className="w-8 shrink-0 flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex-1 relative">
          {/* 세로 (페어 두 카드 중심 연결) */}
          <span
            className={`absolute top-1/4 h-1/2 border-neutral-300 dark:border-neutral-600 ${
              mirror ? "right-0 border-r" : "left-0 border-l"
            }`}
          />
          {/* 가로 (받는 카드로) */}
          <span
            className={`absolute top-1/2 w-full border-t border-neutral-300 dark:border-neutral-600 ${
              mirror ? "right-0" : "left-0"
            }`}
          />
        </div>
      ))}
    </div>
  );
}

function CenterColumn({ final, third, ctx }: { final: BracketSlot; third: BracketSlot; ctx: Ctx }) {
  return (
    <div className="flex flex-col">
      <div className="text-center text-[10px] font-bold tracking-[0.18em] uppercase text-amber-500 pb-2">결승</div>
      <div className="flex-1 flex flex-col items-center justify-center gap-5 min-h-[700px] w-[210px]">
        <Trophy className="w-7 h-7 text-amber-400" aria-hidden />
        <div className="w-full"><MatchCard slot={final} ctx={ctx} isFinal /></div>
        <div className="w-full opacity-90">
          <div className="text-center text-[10px] font-semibold text-neutral-400 mb-1">3·4위전</div>
          <MatchCard slot={third} ctx={ctx} small />
        </div>
      </div>
    </div>
  );
}

function MatchCard({
  slot,
  ctx,
  isFinal,
  wide,
  small,
}: {
  slot: BracketSlot;
  ctx: Ctx;
  isFinal?: boolean;
  wide?: boolean;
  small?: boolean;
}) {
  const live = slot.status === "LIVE";
  const done = slot.status === "FINISHED";
  const onActive =
    ctx.active != null && (slot.home.teamId === ctx.active || slot.away.teamId === ctx.active);
  const dim = ctx.active != null && !onActive && (slot.home.teamId != null || slot.away.teamId != null);

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-white/[0.04] overflow-hidden transition-all duration-300 ${
        isFinal
          ? "border-amber-300 dark:border-amber-500/40 shadow-[0_10px_30px_-12px_rgba(217,119,6,0.4)]"
          : live
            ? "border-rose-300 dark:border-rose-500/40"
            : onActive
              ? "border-emerald-400 dark:border-emerald-500/50 ring-1 ring-emerald-400/40"
              : "border-neutral-200 dark:border-neutral-800"
      } ${dim ? "opacity-40" : ""} ${wide ? "" : "text-[13px]"}`}
    >
      <TeamRow side={slot.home} score={slot.homeScore} prob={slot.homeProb} live={live} done={done} ctx={ctx} small={small} />
      <div className="border-t border-neutral-100 dark:border-neutral-800" />
      <TeamRow side={slot.away} score={slot.awayScore} prob={slot.awayProb} live={live} done={done} ctx={ctx} small={small} />
      <Footer slot={slot} live={live} />
    </div>
  );
}

function TeamRow({
  side,
  score,
  prob,
  live,
  done,
  ctx,
  small,
}: {
  side: BracketTeamRef;
  score: number | null;
  prob: number | null;
  live: boolean;
  done: boolean;
  ctx: Ctx;
  small?: boolean;
}) {
  const resolved = side.name != null;
  const interactive = side.teamId != null;
  const isThird = side.label.endsWith("조 3위") && !resolved;

  const right =
    done || live ? (
      <span className={`tabular-nums font-bold ${live ? "text-rose-600 dark:text-rose-400" : ""} ${side.out ? "text-neutral-400" : ""}`}>
        {score ?? "-"}
      </span>
    ) : prob != null ? (
      <span className="tabular-nums text-[10px] font-semibold text-violet-500 dark:text-violet-400">{Math.round(prob * 100)}%</span>
    ) : null;

  return (
    <div
      onMouseEnter={interactive ? () => ctx.setHot(side.teamId) : undefined}
      onMouseLeave={interactive ? () => ctx.setHot(null) : undefined}
      className={`flex items-center gap-1.5 px-2.5 ${small ? "py-1" : "py-1.5"} ${
        side.won ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
      } ${interactive ? "cursor-default" : ""}`}
    >
      <span className="w-4 text-center shrink-0" aria-hidden>
        {resolved ? side.flag || "🏳️" : isThird ? "🟡" : ""}
      </span>
      <span
        className={`flex-1 truncate ${small ? "text-[12px]" : "text-[13px]"} ${
          !resolved
            ? "text-neutral-400 dark:text-neutral-500 italic"
            : side.won
              ? "font-bold text-emerald-700 dark:text-emerald-300"
              : side.out
                ? "text-neutral-400 line-through decoration-neutral-300"
                : "font-medium"
        }`}
        title={side.label}
      >
        {resolved ? side.nameKo : side.label}
        {side.provisional && resolved && <span className="ml-1 text-[9px] text-neutral-400 not-italic">잠정</span>}
      </span>
      <span className="shrink-0 w-9 text-right">{right}</span>
    </div>
  );
}

function Footer({ slot, live }: { slot: BracketSlot; live: boolean }) {
  const label = live ? (
    <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" /> LIVE
    </span>
  ) : slot.status === "FINISHED" ? (
    "종료"
  ) : slot.startTime ? (
    kst(slot.startTime)
  ) : (
    `M${slot.matchNo}`
  );
  const inner = (
    <div className="flex items-center justify-between px-2.5 py-1 text-[10px] text-neutral-400 bg-neutral-50/60 dark:bg-white/[0.02] border-t border-neutral-100 dark:border-neutral-800">
      <span className="tabular-nums">{label}</span>
      <span className="tabular-nums text-neutral-300 dark:text-neutral-600">M{slot.matchNo}</span>
    </div>
  );
  return slot.externalId ? (
    <Link href={`/live/WORLD_CUP/${slot.externalId}`} prefetch={false} className="block hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors">
      {inner}
    </Link>
  ) : (
    inner
  );
}

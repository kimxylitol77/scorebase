// KBO·NPB 포스트시즌 대진표(서버 컴포넌트) — KBO 는 계단식(와일드카드→한국시리즈), NPB 는 좌 센트럴·우 퍼시픽·가운데 일본시리즈.
// 시리즈 카드 문법은 MLB 대진표(MlbPostseasonBracket)와 같다: 시드·로고·승수 또는 AI 시리즈 승리 확률, 노란 시드 = 현재 순위 기준 예상.
import Link from "next/link";
import { ChevronRight, Sparkles, Trophy } from "lucide-react";
import TeamLogoImg from "@/components/TeamLogoImg";
import type { LadderModel, LSeries, LTeam } from "@/lib/sports/baseball/ladder-postseason";

/** 다크 모드에서 어두운 로고가 묻혀 밝은 원 위에 올린다 */
const LOGO_CHIP = "dark:rounded-full dark:bg-white/90 dark:p-[2px]";

export function kstTime(iso: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(iso));
}

export default function LadderBracket({ model, logoById }: { model: LadderModel; logoById: Record<number, string> }) {
  const by = Object.fromEntries(model.series.map((s) => [s.key, s]));
  const final = by[model.finalKey];
  const champ = model.champion;
  return (
    <div className="space-y-4">
      {champ && final && (
        <div className="relative overflow-hidden rounded-[1.5rem] shadow-sm sm:rounded-[2rem]">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-rose-500 to-fuchsia-600" />
          <div className="relative flex items-center gap-4 px-5 py-5 text-white">
            <Trophy className="h-9 w-9 shrink-0 drop-shadow" aria-hidden />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.25em] opacity-85">{model.league === "KBO" ? "Korean Series Champion" : "Japan Series Champion"}</div>
              <div className="text-xl font-bold tracking-tight sm:text-2xl">{champ.name} 우승</div>
              <div className="mt-0.5 text-xs tabular-nums opacity-90 sm:text-sm">
                {final.label} {final.top.name} {final.winsTop} - {final.winsBottom} {final.bottom.name}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
        <Legend dot="bg-emerald-500" label="진출" />
        <Legend dot="bg-rose-500" label="LIVE" />
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-amber-500/15 text-[9px] font-bold text-amber-700 dark:text-amber-300">4</span>
          노란 시드 = 현재 순위 기준 예상
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="rounded bg-sky-500/10 px-1 text-[9px] font-bold text-sky-700 dark:text-sky-300">+1</span> 1승 안고 시작
        </span>
        <span className="inline-flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-violet-500" aria-hidden /> AI 시리즈 승리 확률
        </span>
      </div>

      {model.league === "KBO" ? (
        // 계단 — 오른쪽으로 갈수록 위 시드가 기다린다. 데스크탑은 가로, 좁은 화면은 세로.
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:gap-0">
          {(["wc", "spo", "po", "ks"] as const).map((k, i) => (
            <div key={k} className="contents">
              {i > 0 && <ChevronRight className="mx-auto h-4 w-4 shrink-0 rotate-90 text-neutral-300 lg:mx-1 lg:mb-[46px] lg:rotate-0 dark:text-neutral-600" aria-hidden />}
              <div className="lg:flex-1">
                <div className={`lg:mb-[var(--lift)]`} style={{ ["--lift" as string]: `${i * 34}px` }}>
                  <RoundHead s={by[k]} gold={k === "ks"} />
                  <SeriesCard s={by[k]} logoById={logoById} isFinal={k === "ks"} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(220px,0.8fr)_1fr] lg:items-center">
          {(["c", "p"] as const).map((g, gi) => (
            <div key={g} className={`space-y-2 ${gi === 1 ? "lg:order-3" : ""}`}>
              <div className={`text-[11px] font-bold tracking-[0.12em] text-neutral-500 dark:text-neutral-400 ${gi === 1 ? "lg:text-right" : ""}`}>
                {g === "c" ? "센트럴리그" : "퍼시픽리그"} 클라이맥스 시리즈
              </div>
              <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${gi === 1 ? "sm:flex-row-reverse" : ""}`}>
                <div className="sm:flex-1">
                  <RoundHead s={by[`fs-${g}`]} />
                  <SeriesCard s={by[`fs-${g}`]} logoById={logoById} />
                </div>
                <ChevronRight className={`mx-auto h-4 w-4 shrink-0 rotate-90 text-neutral-300 sm:mx-0 dark:text-neutral-600 ${gi === 1 ? "sm:rotate-180" : "sm:rotate-0"}`} aria-hidden />
                <div className="sm:flex-1">
                  <RoundHead s={by[`final-${g}`]} />
                  <SeriesCard s={by[`final-${g}`]} logoById={logoById} />
                </div>
              </div>
            </div>
          ))}
          <div className="space-y-2 lg:order-2">
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-500">
              <Trophy className="h-4 w-4" aria-hidden /> 일본시리즈
            </div>
            <SeriesCard s={by.js} logoById={logoById} isFinal />
          </div>
        </div>
      )}
    </div>
  );
}

function RoundHead({ s, gold }: { s: LSeries; gold?: boolean }) {
  return (
    <div className="mb-1 flex items-baseline justify-between gap-2 px-0.5">
      <span className={`text-[11px] font-bold tracking-[0.08em] ${gold ? "text-amber-600 dark:text-amber-400" : "text-neutral-500 dark:text-neutral-400"}`}>
        {s.group ? s.label.replace(`${s.group} CS `, "") : s.label}
      </span>
      <span className="text-[10px] text-neutral-400">{s.formatLabel}</span>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

function SeriesCard({ s, logoById, isFinal }: { s: LSeries; logoById: Record<number, string>; isFinal?: boolean }) {
  const live = s.state === "LIVE";
  const liveGame = s.games.find((g) => g.state === "LIVE");
  const nextGame = s.games.find((g) => g.state === "SCHEDULED");
  const linkGame = liveGame ?? nextGame ?? [...s.games].reverse().find((g) => g.state === "FINAL");
  const href = linkGame?.href ?? null;
  const status = live ? (
    <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-rose-500" aria-hidden /> LIVE
    </span>
  ) : s.state === "FINAL" ? "시리즈 종료" : nextGame ? `${kstTime(nextGame.date)} 한국` : s.top.id != null && s.bottom.id != null ? "일정 발표 전" : "상대 미정";
  const footer = (
    <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 px-2.5 py-1 text-[10px] text-neutral-500 dark:border-white/[0.06] dark:bg-white/[0.02] dark:text-neutral-400">
      <span className="tabular-nums">{status}</span>
      {s.games.length > 0 && <span className="tabular-nums text-neutral-400 dark:text-neutral-500">{s.games.filter((g) => g.state === "FINAL").length}경기</span>}
    </div>
  );
  const external = href?.startsWith("http");
  return (
    <div
      className={`overflow-hidden rounded-xl bg-white ring-1 dark:bg-white/[0.04] ${
        isFinal ? "shadow-[0_10px_30px_-12px_rgba(217,119,6,0.45)] ring-amber-300 dark:ring-amber-500/40" : live ? "ring-rose-300 dark:ring-rose-500/40" : "ring-black/[0.07] dark:ring-white/10"
      }`}
    >
      <TeamRow t={s.top} wins={s.winsTop} adv={s.advantage} prob={s.probTop} s={s} logoById={logoById} />
      <div className="border-t border-neutral-100 dark:border-white/[0.06]" />
      <TeamRow t={s.bottom} wins={s.winsBottom} adv={0} prob={s.probTop == null ? null : 1 - s.probTop} s={s} logoById={logoById} />
      {href ? (
        external ? (
          <a href={href} target="_blank" rel="nofollow noopener" className="block transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]">{footer}</a>
        ) : (
          <Link href={href} prefetch={false} className="block transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.04]">{footer}</Link>
        )
      ) : (
        footer
      )}
    </div>
  );
}

function TeamRow({ t, wins, adv, prob, s, logoById }: { t: LTeam; wins: number; adv: number; prob: number | null; s: LSeries; logoById: Record<number, string> }) {
  const won = s.winnerId != null && t.id === s.winnerId;
  const out = s.winnerId != null && t.id !== s.winnerId && !t.placeholder;
  const started = s.state !== "SCHEDULED";
  const logo = t.id != null ? logoById[t.id] : undefined;
  const nameEl = (
    <span
      className={`truncate text-[13px] ${
        t.placeholder ? "italic text-neutral-400 dark:text-neutral-500" : won ? "font-bold text-emerald-700 dark:text-emerald-300" : out ? "text-neutral-400 line-through decoration-neutral-300 dark:decoration-neutral-600" : "font-semibold text-neutral-900 dark:text-white"
      }`}
    >
      {t.name}
    </span>
  );
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${won ? "bg-emerald-50 dark:bg-emerald-500/10" : ""}`}>
      <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] font-bold tabular-nums ${t.projected ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "text-neutral-400"}`}>
        {t.seed ?? ""}
      </span>
      {logo ? (
        <TeamLogoImg url={logo} name={t.name} size={18} className={`h-[18px] w-[18px] shrink-0 object-contain ${LOGO_CHIP}`} fallbackClassName="h-[18px] w-[18px] shrink-0 rounded-full bg-neutral-200 text-[8px] dark:bg-white/10" />
      ) : (
        <span className="h-[18px] w-[18px] shrink-0 rounded-full border border-dashed border-neutral-300 dark:border-white/15" aria-hidden />
      )}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        {t.id != null && !t.placeholder ? (
          <Link href={`/teams/${t.id}`} prefetch={false} className="min-w-0 truncate hover:underline">{nameEl}</Link>
        ) : (
          nameEl
        )}
        {adv > 0 && <span className="shrink-0 rounded bg-sky-500/10 px-1 text-[9px] font-bold text-sky-700 dark:text-sky-300">+{adv}</span>}
      </span>
      <span className="w-9 shrink-0 text-right">
        {started ? (
          <span className={`text-[14px] font-bold tabular-nums ${won ? "text-emerald-700 dark:text-emerald-300" : "text-neutral-700 dark:text-neutral-200"}`}>{wins}</span>
        ) : prob != null ? (
          <span className="text-[10px] font-semibold tabular-nums text-violet-600 dark:text-violet-400">{Math.round(prob * 100)}%</span>
        ) : null}
      </span>
    </div>
  );
}

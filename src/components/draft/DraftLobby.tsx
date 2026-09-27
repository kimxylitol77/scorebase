// 블라인드 드래프트 로비(전 종목 공용) — 리그 탭·게임·하는 법·순위. 종목 페이지 세 곳이 이 컴포넌트를 쓴다.
import Link from "next/link";
import { notFound } from "next/navigation";
import AmbientGlow from "@/components/AmbientGlow";
import { MODES, SPORT_LABEL, SPORT_MODES, SPORT_PATH, isDraftMode, playPath, type DraftMode, type Sport } from "@/lib/draft/modes";
import { availableModes, getPool } from "@/lib/draft/pool";
import { getLeaderboard, type LeaderRow } from "@/lib/draft/service";
import { slotLabels } from "@/lib/draft/labels";
import DraftGame from "./DraftGame";
import Leaderboard from "./Leaderboard";

async function safeLeaders(mode: DraftMode, period: "today" | "all"): Promise<LeaderRow[]> {
  try {
    return await getLeaderboard(mode, period);
  } catch {
    return []; // 표를 못 읽어도 게임은 열려야 한다
  }
}

/** "가드 2·포워드 2·센터 1" */
function lineupText(mode: DraftMode): string {
  const count = new Map<string, number>();
  for (const l of slotLabels(mode)) count.set(l, (count.get(l) ?? 0) + 1);
  return [...count].map(([l, n]) => `${l} ${n}`).join("·");
}

const OTHER_SPORTS: Sport[] = ["basketball", "baseball", "soccer"];

export default async function DraftLobby({ sport, modeParam }: { sport: Sport; modeParam?: string }) {
  const ready = availableModes();
  const modes = SPORT_MODES[sport].filter((m) => ready.includes(m));
  if (modes.length === 0) notFound();
  const mode: DraftMode = isDraftMode(modeParam) && modes.includes(modeParam) ? modeParam : modes[0];
  const cfg = MODES[mode];
  const meta = getPool(mode).meta;
  const n = cfg.slots.length;
  const [today, all] = await Promise.all([safeLeaders(mode, "today"), safeLeaders(mode, "all")]);
  const seasonText = cfg.draws ? `${cfg.games}경기 무패` : `${cfg.games}전 전승`;

  const steps: [string, string][] = [
    ["판을 읽는다", "한 구단의 역대 선수 21명이 나옵니다. 보이는 건 이름·시즌·포지션뿐입니다."],
    ["한 명을 뽑는다", "뽑는 순간 판 전체의 기여도가 공개되고, 내 선택이 몇 등이었는지 나옵니다."],
    [`${n}명을 완성한다`, `${n}판에서 ${n}명. 완성한 팀으로 ${cfg.games}경기 시즌을 돌려 성적을 냅니다. 목표는 ${seasonText}입니다.`],
  ];

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-8">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
          {SPORT_LABEL[sport]} 게임
        </span>
        <h1 className="mt-3 text-2xl font-semibold break-keep text-neutral-900 sm:text-3xl dark:text-white">블라인드 드래프트</h1>
        <p className="mt-1.5 max-w-2xl text-sm break-keep text-neutral-500 dark:text-neutral-400">
          이름만 보고 역대 최강 팀을 짜 보세요. 기록은 뽑은 뒤에야 공개됩니다.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <nav className="inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/[0.06]" aria-label="리그 선택">
            {modes.map((m) => (
              <Link
                key={m}
                href={playPath(m)}
                aria-current={m === mode ? "page" : undefined}
                className={`rounded-full px-5 py-1.5 text-sm font-semibold transition-all duration-300 ${
                  m === mode ? "bg-white text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-400" : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                {MODES[m].label}
              </Link>
            ))}
          </nav>
          {OTHER_SPORTS.filter((s) => s !== sport && SPORT_MODES[s].some((m) => ready.includes(m))).map((s) => (
            <Link
              key={s}
              href={SPORT_PATH[s]}
              className="rounded-full border border-neutral-200 px-3.5 py-1.5 text-xs font-medium text-neutral-600 transition-all duration-300 hover:border-rose-400 hover:text-rose-600 dark:border-white/10 dark:text-neutral-300 dark:hover:text-rose-400"
            >
              {SPORT_LABEL[s]} 드래프트
            </Link>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {cfg.label} {meta.seasons[0]}~{meta.seasons[1]} 시즌 · 선수-시즌 카드 {meta.cards.toLocaleString()}장 · 라인업 {lineupText(mode)}
        </p>

        <DraftGame key={mode} mode={mode} modeLabel={cfg.label} />

        <section className="mt-10">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">하는 법</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {steps.map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                <span className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">0{i + 1}</span>
                <h3 className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{t}</h3>
                <p className="mt-1 text-xs leading-relaxed break-keep text-neutral-500 dark:text-neutral-400">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-2 rounded-2xl bg-white p-4 text-xs leading-relaxed break-keep text-neutral-600 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10">
            <p>
              <b className="text-neutral-900 dark:text-white">기여도</b>는 그 시즌의 실제 기록으로 만든 {cfg.offLabel} 점수와 {cfg.defLabel} 점수의 합입니다.
              같은 시즌 선수들 사이에서 표준화해, 시대가 달라도 그 시즌에 얼마나 압도적이었는지로 비교합니다.
            </p>
            <p className="mt-2">
              <b className="text-neutral-900 dark:text-white">보너스</b>는 풀 라인업({lineupText(mode)}) +3, {cfg.offLabel}·{cfg.defLabel} 균형 -2~+2, 내구성 -1.5~+1.5,{" "}
              {cfg.lockdownLabel}({cfg.defLabel} 합 {meta.lockdown} 초과) +4 입니다. 찬스 6종은 게임마다 한 번씩, 돋보기는 {cfg.spyCharges}번 쓸 수 있습니다.
              순위 등록은 로그인한 회원만 됩니다.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">{cfg.label} 순위</h2>
          <Leaderboard mode={mode} today={today} all={all} />
        </section>
      </div>
    </main>
  );
}

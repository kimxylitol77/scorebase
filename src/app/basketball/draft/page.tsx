// 농구 블라인드 드래프트 — NBA·KBL 역대 선수-시즌을 이름만 보고 5명 뽑는 게임. 로그인 없이 시작.
import type { Metadata } from "next";
import Link from "next/link";
import AmbientGlow from "@/components/AmbientGlow";
import Leaderboard from "@/components/draft/Leaderboard";
import { MODE_LABEL, getPool, isDraftMode } from "@/lib/draft/pool";
import { getLeaderboard, type LeaderRow } from "@/lib/draft/service";
import type { DraftMode } from "@/lib/draft/types";
import DraftClient from "./DraftClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ mode?: string }>;
}

export const metadata: Metadata = {
  title: "농구 블라인드 드래프트 — NBA·KBL 역대 선수로 최강 5인 짜기",
  description:
    "이름과 시즌, 포지션만 보고 역대 선수 5명을 뽑아 숨겨진 기여도로 순위를 겨룹니다. NBA 1994년부터, KBL 원년부터. 회원가입 없이 바로 시작합니다.",
  alternates: { canonical: "/basketball/draft" },
};

const STEPS: [string, string][] = [
  ["판을 읽는다", "한 구단의 역대 선수 21명이 나옵니다. 보이는 건 이름·시즌·포지션뿐입니다."],
  ["한 명을 뽑는다", "뽑는 순간 판 전체의 기여도가 공개되고, 내 선택이 몇 등이었는지 나옵니다."],
  ["다섯 명을 완성한다", "5판에서 5명. 기여도 합에 보너스를 더한 점수로 반지 0~6개를 받습니다."],
];

async function safeLeaders(mode: DraftMode, period: "today" | "all"): Promise<LeaderRow[]> {
  try {
    return await getLeaderboard(mode, period);
  } catch {
    return []; // 표를 못 읽어도 게임은 열려야 한다
  }
}

export default async function DraftPage({ searchParams }: Props) {
  const sp = await searchParams;
  const mode: DraftMode = isDraftMode(sp.mode) ? sp.mode : "nba";
  const meta = getPool(mode).meta;
  const [today, all] = await Promise.all([safeLeaders(mode, "today"), safeLeaders(mode, "all")]);

  return (
    <main className="relative mx-auto max-w-6xl px-4 py-8">
      <AmbientGlow />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" aria-hidden />
          농구 게임
        </span>
        <h1 className="mt-3 text-2xl font-semibold break-keep text-neutral-900 sm:text-3xl dark:text-white">블라인드 드래프트</h1>
        <p className="mt-1.5 max-w-2xl text-sm break-keep text-neutral-500 dark:text-neutral-400">
          이름만 보고 역대 최강 5인을 짜 보세요. 기록은 뽑은 뒤에야 공개됩니다.
        </p>

        <nav className="mt-5 inline-flex rounded-full bg-neutral-100 p-1 dark:bg-white/[0.06]" aria-label="리그 선택">
          {(Object.keys(MODE_LABEL) as DraftMode[]).map((m) => (
            <Link
              key={m}
              href={m === "nba" ? "/basketball/draft" : `/basketball/draft?mode=${m}`}
              aria-current={m === mode ? "page" : undefined}
              className={`rounded-full px-5 py-1.5 text-sm font-semibold transition-all duration-300 ${
                m === mode ? "bg-white text-rose-600 shadow-sm dark:bg-white/10 dark:text-rose-400" : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {MODE_LABEL[m]}
            </Link>
          ))}
        </nav>
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {MODE_LABEL[mode]} {meta.seasons[0]}~{meta.seasons[1]} 시즌 · 선수-시즌 카드 {meta.cards.toLocaleString()}장
        </p>

        <DraftClient key={mode} mode={mode} modeLabel={MODE_LABEL[mode]} />

        <section className="mt-10">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">하는 법</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-3">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-white p-4 ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10">
                <span className="text-xs font-semibold tabular-nums text-rose-600 dark:text-rose-400">0{i + 1}</span>
                <h3 className="mt-1 text-sm font-semibold text-neutral-900 dark:text-white">{t}</h3>
                <p className="mt-1 text-xs leading-relaxed break-keep text-neutral-500 dark:text-neutral-400">{d}</p>
              </li>
            ))}
          </ol>
          <div className="mt-2 rounded-2xl bg-white p-4 text-xs leading-relaxed break-keep text-neutral-600 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10">
            <p>
              <b className="text-neutral-900 dark:text-white">기여도</b>는 득점·야투 효율·어시스트·턴오버·리바운드로 만든 공격 점수와 스틸·블록·수비 리바운드·파울로 만든 수비 점수의 합입니다.
              같은 시즌 선수들 사이에서 표준화해, 시대가 달라도 그 시즌에 얼마나 압도적이었는지로 비교합니다.
            </p>
            <p className="mt-2">
              <b className="text-neutral-900 dark:text-white">보너스</b>는 풀 라인업(가드 2·포워드 2·센터 1) +3, 공수 균형 -2~+2, 내구성 -1.5~+1.5, 철벽 수비(수비 합 {meta.lockdown} 초과) +4 입니다.
              찬스 6종은 게임마다 한 번씩, 돋보기는 세 번 쓸 수 있습니다. 순위 등록은 로그인한 회원만 됩니다.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 text-base font-semibold text-neutral-900 dark:text-white">{MODE_LABEL[mode]} 순위</h2>
          <Leaderboard mode={mode} today={today} all={all} />
        </section>
      </div>
    </main>
  );
}

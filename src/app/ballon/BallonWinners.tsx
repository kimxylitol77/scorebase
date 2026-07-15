// 역대 발롱도르 수상자 섹션 — /ballon 라이브 순위 아래 참고용 명예의 전당.
// 정적 큐레이션(ballon-winners.ts). 지수는 수상 시즌 스탯 기준으로 라이브와 동일 산식.
import Image from "next/image";
import { BALLON_WINNERS, winnerScore } from "@/lib/ballon-winners";

export default function BallonWinners() {
  if (BALLON_WINNERS.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-black tracking-tight">역대 발롱도르 수상자</h2>
      <p className="mt-1 mb-3 text-xs text-neutral-400 dark:text-neutral-500">
        수상 시즌 주요 대회 스탯 기준 지수 (라이브 순위와 동일 산식·참고용).
      </p>

      <ol className="space-y-2">
        {BALLON_WINNERS.map((w) => (
          <li
            key={w.year}
            className="rounded-2xl bg-white ring-1 ring-black/5 dark:bg-white/[0.04] dark:ring-white/10 px-3 sm:px-4 py-3"
          >
            <div className="flex items-center gap-3">
              {/* 수상 연도 */}
              <div className="w-10 shrink-0 text-center">
                <div className="text-base font-black tabular-nums leading-none">{w.year}</div>
                <div className="text-[10px] text-neutral-400 leading-tight">수상</div>
              </div>

              {/* 사진 */}
              <Image
                src={w.photoUrl}
                alt={w.nameKo}
                width={44}
                height={44}
                className="rounded-full object-cover shrink-0 bg-neutral-100 dark:bg-neutral-800 w-11 h-11"
                unoptimized
              />

              {/* 이름·소속 */}
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">
                  <span>{w.nationFlag}</span> {w.nameKo}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {w.club} · {w.season}
                  {w.note ? <span className="text-neutral-400"> · {w.note}</span> : null}
                </div>
              </div>

              {/* 지수 */}
              <div className="shrink-0 text-right">
                <div className="text-lg font-black tabular-nums leading-none">
                  {Math.round(winnerScore(w))}
                </div>
                <div className="text-[10px] text-neutral-400 leading-tight">지수</div>
              </div>
            </div>

            {/* 대회별 골·도움 */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 pl-[52px]">
              {w.comps.map((c) => (
                <span
                  key={c.label}
                  className="inline-flex items-center gap-1 rounded-md bg-neutral-100 dark:bg-white/[0.06] px-1.5 py-0.5"
                >
                  {c.label} {c.goals}골{c.assists > 0 ? ` ${c.assists}도움` : ""}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

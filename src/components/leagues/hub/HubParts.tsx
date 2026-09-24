// 빅매치 허브 공용 작은 부품 — 조별 순위 구획 제목, 데이터 없을 때 안내.

export function HubHeading({ eyebrow, title, meta }: { eyebrow: string; title: string; meta: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-600 dark:text-rose-400">{eyebrow}</p>
        <h2 id="hub-groups" className="mt-1 text-2xl font-black tracking-tight text-zinc-950 break-keep dark:text-white sm:text-3xl">
          {title}
        </h2>
      </div>
      <p className="text-sm text-zinc-500 dark:text-white/55">{meta}</p>
    </div>
  );
}

export function HubEmpty() {
  return (
    <div className="rounded-[1.75rem] bg-white p-8 text-center text-sm text-zinc-500 ring-1 ring-black/5 dark:bg-white/[0.04] dark:text-white/55 dark:ring-white/10">
      조 편성 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
    </div>
  );
}

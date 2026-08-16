// 순위 페이지 부가 섹션 공용 접이식 박스 — 지난 시즌 순위·플레이오프 브라켓·시즌 리더보드 통일 스타일.
// (NbaStandingsTable 의 "지난 시즌 최종 순위" details 와 같은 룩)

import OpenOnHash from "./OpenOnHash";

interface Props {
  /** 앵커 착지용 id — 지정하면 해시 진입 시 자동 펼침 */
  id?: string;
  title: string;
  /** 제목 옆 보조 라벨 (예: "(시즌 최종 결과)") */
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function CollapseSection({ id, title, meta, defaultOpen = false, children }: Props) {
  return (
    <details
      id={id}
      open={defaultOpen || undefined}
      className="group rounded-2xl bg-white/60 ring-1 ring-black/5 dark:bg-white/[0.02] dark:ring-white/10 scroll-mt-20"
    >
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 px-4 py-3 text-xs font-bold text-neutral-500 transition hover:text-neutral-700 dark:hover:text-neutral-300">
        <span className="text-[10px] transition group-open:rotate-90" aria-hidden>
          ▶
        </span>
        {title}
        {meta ? <span className="font-normal text-neutral-400">{meta}</span> : null}
      </summary>
      <div className="px-3 pb-4 pt-1 sm:px-4">{children}</div>
      {id ? <OpenOnHash id={id} /> : null}
    </details>
  );
}

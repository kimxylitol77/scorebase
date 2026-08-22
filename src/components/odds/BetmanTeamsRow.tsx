"use client";
// 베트맨 카드의 [홈팀][배당][원정팀] 줄 — 레이아웃을 CSS 반응형이 아니라 JS(matchMedia)로 고른다.
//
// 왜 JS 인가. 일부 윈도우 PC 환경에서 Tailwind 의 sm: 규칙이 기본 유틸을 못 덮는 실사례가
// 두 번 있었다(2026-08-16 `flex → sm:grid`, 2026-08-22 `flex-col → sm:flex-row`). 원인은 그쪽
// 환경(확장프로그램 추정)이라 원격으로 잡을 수 없다. 그래서 "넓은 화면이면 가로, 아니면 세로"를
// 브라우저가 직접 판정하게 하고, 각 모드는 **덮어쓰기가 필요 없는 기본 유틸만** 쓴다.
// 마운트 전(SSR·hydration 직후)에는 종전 반응형 클래스를 그대로 써서 첫 그림이 튀지 않게 한다.

import { useEffect, useState } from "react";

const WIDE_QUERY = "(min-width: 40rem)"; // Tailwind sm

function useWide(): boolean | null {
  const [wide, setWide] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const apply = () => setWide(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return wide;
}

const fmtOdds = (v: number | null) => (v != null && v > 0 ? v.toFixed(2) : "-");
/** 베트맨 원본에 "일본_여자" 처럼 언더스코어가 섞여 온다 — 표시할 때만 공백으로 편다. */
const teamLabel = (s: string) => s.replace(/_/g, " ");

function TeamLogo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // 외부 도메인 로고가 섞여 있어 next/image 최적화 대상이 아니다 (/scores 팀로고와 동일).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-7 w-7 shrink-0 rounded bg-white object-contain p-0.5"
      />
    );
  }
  // 이름 매칭이 모호하면 로고를 달지 않는다 — 틀린 마크보다 이니셜이 낫다.
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-400 dark:bg-neutral-800">
      {name.slice(0, 1)}
    </span>
  );
}

type Props = {
  homeLogo: string | null;
  homeName: string;
  awayLogo: string | null;
  awayName: string;
  winAllot: number | null;
  drawAllot: number | null;
  loseAllot: number | null;
};

export default function BetmanTeamsRow(p: Props) {
  const wide = useWide();
  const hasDraw = p.drawAllot != null;

  // 세 모드의 클래스. null(마운트 전)만 sm: 변형을 쓰고, 판정 뒤에는 기본 유틸만 쓴다.
  const cls =
    wide === null
      ? {
          row: "mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4",
          home: "flex min-w-0 items-center gap-2 sm:flex-1 sm:flex-row-reverse sm:justify-start",
          homeName: "truncate text-[14px] text-neutral-800 dark:text-neutral-100 sm:text-right",
          odds: "flex shrink-0 items-center justify-center gap-1.5 tabular-nums sm:gap-2.5",
          label: "mr-1 text-[10px] font-medium opacity-70 sm:hidden",
          away: "flex min-w-0 items-center gap-2 sm:flex-1",
        }
      : wide
        ? {
            // 데스크탑: 홈 우측정렬([이름][로고]) · 배당 중앙 · 원정 좌측. flex 기본 방향이 row 라 덮어쓸 게 없다.
            row: "mt-2 flex items-center gap-4",
            home: "flex min-w-0 flex-1 flex-row-reverse items-center justify-start gap-2",
            homeName: "truncate text-right text-[14px] text-neutral-800 dark:text-neutral-100",
            odds: "flex shrink-0 items-center justify-center gap-2.5 tabular-nums",
            label: "hidden",
            away: "flex min-w-0 flex-1 items-center gap-2",
          }
        : {
            // 모바일: 세로로 쌓고 팀명에 폭을 다 준다. 배당에 승/무/패 라벨을 붙여 어느 팀 것인지 밝힌다.
            row: "mt-2 flex flex-col gap-1.5",
            home: "flex min-w-0 items-center gap-2",
            homeName: "truncate text-[14px] text-neutral-800 dark:text-neutral-100",
            odds: "flex shrink-0 items-center justify-center gap-1.5 tabular-nums",
            label: "mr-1 text-[10px] font-medium opacity-70",
            away: "flex min-w-0 items-center gap-2",
          };

  return (
    <div className={cls.row}>
      <div className={cls.home}>
        <TeamLogo url={p.homeLogo} name={p.homeName} />
        <span className={cls.homeName}>{teamLabel(p.homeName)}</span>
      </div>
      <div className={cls.odds}>
        <span className="min-w-[46px] rounded-md bg-rose-50 px-2 py-1 text-center text-[14px] font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
          <span className={cls.label}>승</span>
          {fmtOdds(p.winAllot)}
        </span>
        {hasDraw && (
          <span className="min-w-[46px] rounded-md bg-neutral-100 px-2 py-1 text-center text-[14px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
            <span className={cls.label}>무</span>
            {fmtOdds(p.drawAllot)}
          </span>
        )}
        <span className="min-w-[46px] rounded-md bg-blue-50 px-2 py-1 text-center text-[14px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
          <span className={cls.label}>패</span>
          {fmtOdds(p.loseAllot)}
        </span>
      </div>
      <div className={cls.away}>
        <TeamLogo url={p.awayLogo} name={p.awayName} />
        <span className="truncate text-[14px] text-neutral-800 dark:text-neutral-100">
          {teamLabel(p.awayName)}
        </span>
      </div>
    </div>
  );
}

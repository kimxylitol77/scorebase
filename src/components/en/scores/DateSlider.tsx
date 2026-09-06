// scores__DateSlider (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
"use client";

// 일자 슬라이더 — -5일 ~ +5일 (총 11일). 오늘 강조 (cyan 그라데이션).
// 선택된 일자 버튼은 마운트 후 자동으로 가로 중앙으로 스크롤된다.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

interface Props {
  /** 선택된 일자 yyyy-mm-dd */
  selectedDate: string;
  /** 오늘 일자 yyyy-mm-dd (KST). 서버가 계산해 내려준다 —
   *  client 에서 Date.now() 를 쓰면 자정 근처에 SSR/CSR 결과가 어긋난다. */
  todayKst: string;
  /** 현재 종목 (URL 유지) */
  sport: string;
  /** 추가 쿼리 (league 등) — querystring */
  extraQuery?: string;
}

function dateQuery(d: Date): string {
  // KST 기준 yyyy-mm-dd
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return k.toISOString().slice(0, 10);
}

export default function DateSlider({
  selectedDate,
  todayKst,
  sport,
  extraQuery = "",
}: Props) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const router = useRouter();

  // 새로고침(reload)으로 들어왔는데 URL 의 날짜가 오늘이 아니면 오늘로 옮긴다.
  // 어제 켜 둔 탭(?date=어제)을 다음 날 새로고침하면 어제 경기가 그대로 보이던 것(사용자 신고 2026-09-06).
  // 날짜 칩·뒤로가기 등 사용자가 고른 이동은 reload 가 아니라 건드리지 않는다.
  useEffect(() => {
    if (selectedDate === todayKst) return;
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type !== "reload") return;
    router.replace(`/en/scores?sport=${sport}${extraQuery}`);
  }, [selectedDate, todayKst, sport, extraQuery, router]);

  useEffect(() => {
    // 선택된 일자 버튼 → 가로 중앙으로 스크롤. 페이지 세로 스크롤은 건드리지 않음.
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDate]);

  // "2026-07-29"(KST) → 그날 KST 자정의 UTC 시각. prop 만 쓰므로 렌더가 순수하다.
  const todayMidUtc = new Date(`${todayKst}T00:00:00+09:00`);

  return (
    <nav
      className="flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Date selector"
    >
      {Array.from({ length: 11 }, (_, i) => {
        const offset = i - 5; // -5 (5일 전) ~ +5 (5일 후)
        const d = new Date(todayMidUtc.getTime() + offset * 24 * 3600 * 1000);
        const ds = dateQuery(d);
        const isToday = offset === 0;
        const active = ds === selectedDate;
        const kst = new Date(d.getTime() + 9 * 3600 * 1000);
        const mm = kst.getUTCMonth() + 1;
        const dd = kst.getUTCDate();
        const weekday = d.toLocaleDateString("en-GB", {
          timeZone: "Asia/Seoul",
          weekday: "short",
        });
        const cls = `date-pill ${active ? "active" : ""} ${
          isToday && !active ? "today" : ""
        }`;
        return (
          <Link
            key={ds}
            ref={active ? activeRef : undefined}
            // 오늘 칩은 date 를 안 붙인다 — 오늘에 둔 탭이 날짜가 바뀌어도 새로고침만으로 새 오늘을 따라온다.
            href={isToday ? `/en/scores?sport=${sport}${extraQuery}` : `/en/scores?sport=${sport}&date=${ds}${extraQuery}`}
            className={cls}
          >
            <span className="text-[10px] opacity-80">
              {isToday ? "Today" : ""}
            </span>
            <span className="tabular-nums font-medium">
              {mm}/{dd}
            </span>
            <span className="text-[10px] opacity-70">{weekday}</span>
          </Link>
        );
      })}
    </nav>
  );
}

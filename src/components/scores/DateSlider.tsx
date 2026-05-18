"use client";

// 일자 슬라이더 — -5일 ~ +5일 (총 11일). 오늘 강조 (cyan 그라데이션).
// 선택된 일자 버튼은 마운트 후 자동으로 가로 중앙으로 스크롤된다.

import Link from "next/link";
import { useEffect, useRef } from "react";

interface Props {
  /** 선택된 일자 yyyy-mm-dd */
  selectedDate: string;
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
  sport,
  extraQuery = "",
}: Props) {
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    // 선택된 일자 버튼 → 가로 중앙으로 스크롤. 페이지 세로 스크롤은 건드리지 않음.
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDate]);

  const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
  const todayMidUtc = new Date(
    Date.UTC(
      nowKst.getUTCFullYear(),
      nowKst.getUTCMonth(),
      nowKst.getUTCDate(),
      -9,
    ),
  );

  return (
    <nav
      className="flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="일자 슬라이더"
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
        const weekday = d.toLocaleDateString("ko-KR", {
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
            href={`/scores?sport=${sport}&date=${ds}${extraQuery}`}
            className={cls}
          >
            <span className="text-[10px] opacity-80">
              {isToday ? "오늘" : ""}
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

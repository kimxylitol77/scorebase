// scores__SportTabs (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.

import Link from "next/link";
import { SPORTS, type SportCode } from "@/lib/sports/sport-leagues";
import { SPORT_LABEL_EN } from "@/lib/i18n/en";

interface Props {
  activeSport: SportCode;
  /** 종목별 LIVE 경기 수 (0 = dot 숨김) */
  liveCounts?: Partial<Record<SportCode, number>>;
  /** 일자 쿼리 유지 */
  date: string;
}

export default function SportTabs({ activeSport, liveCounts, date }: Props) {
  return (
    <nav
      className="flex gap-1.5 overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Sports"
    >
      {SPORTS.map((s) => {
        const live = liveCounts?.[s.code] ?? 0;
        const active = s.code === activeSport;
        return (
          <Link
            key={s.code}
            href={`/scores?sport=${s.code}&date=${date}`}
            className={`sport-tab ${active ? "active" : ""}`}
          >
            <span aria-hidden>{s.emoji}</span>
            <span>{SPORT_LABEL_EN[s.code] ?? s.label}</span>
            {live > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                {live}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

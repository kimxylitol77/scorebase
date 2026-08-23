// LeagueBadge (영어판). scripts/en-mirror 로 자동 생성 — 직접 수정하지 말 것.
import { enLeagueName } from "@/lib/i18n/en";

const BADGE_CLS =
  "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-white/[0.06] dark:text-white/70 dark:ring-white/10";

// 리그 표시 라벨 (badge 안에 보일 짧은 이름)
const LABELS: Record<string, string> = {
  EPL: "EPL",
  NBA: "NBA",
  NHL: "NHL",
  MLB: "MLB",
  KBO: "KBO",
  NPB: "NPB",
  LALIGA: "LaLiga",
  BUNDESLIGA: "Bundesliga",
  SERIE_A: "Serie A",
  LIGUE_1: "Ligue 1",
  MLS: "MLS",
  UCL: "UCL",
  UEL: "Europa",
  UECL: "Europa", // 사용자 요청 — "유로파 컨퍼런스" 가 좁은 뱃지(PiP 등)에서 팀명을 밀어냄
  CLUB_FRIENDLY: "Friendly",
  ASEAN_CHAMP: "ASEAN", // "ASEAN 챔피언십" 이 좁은 뱃지(PiP 등)에서 점수 정렬을 밀어냄
  CANADA_CHAMP: "Canadian C.", // "캐나다 챔피언십" 축약 — 위와 동일 사유
  INTL_FRIENDLY: "Intl",
  WORLD_CUP: "World Cup",
  NATIONAL: "National",
  LOL: "LCK",
  EWC: "EWC",
};

interface Props {
  league: string;
  size?: "sm" | "md";
}

export default function LeagueBadge({ league, size = "sm" }: Props) {
  const sizeCls =
    size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
  // LABELS(짧은 인기 리그 약칭) 우선 → 없으면 sport-leagues 정식 한글(152개) → raw 코드.
  // INTL_FRIENDLY/MOROCCO_BP 등이 티커에 raw 로 노출되던 문제 해소.
  const label = LABELS[league] ?? enLeagueName(league);
  return (
    <span
      className={`inline-flex items-center font-semibold tracking-wide ring-1 ring-inset rounded-md ${sizeCls} ${BADGE_CLS}`}
    >
      {label}
    </span>
  );
}

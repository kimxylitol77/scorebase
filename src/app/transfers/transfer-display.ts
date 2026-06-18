// 이적 표시 공통 — 피드(/transfers)와 선수 페이지(/transfers/[id])가 같은 규칙을 쓰도록 공유.
import { toKoreanTeamName } from "@/lib/team-names";

/** TheSports transferDesc → 한글 (이적료 없는 건의 유형 표시) */
export const DESC_KO: Record<string, string> = { Free: "자유이적", Loan: "임대", "End of loan": "임대복귀", "Loan return": "임대복귀", Retired: "은퇴", Unknown: "" };

/** TheSports 특수 "팀명" (실클럽 아님) → 한글 */
export const SPECIAL_TEAM_KO: Record<string, string> = { "Free player": "자유계약", Retired: "은퇴", Disqualification: "징계", Unknown: "미상" };

/** 이적 유형 배지 색 — type 코드로 부여 (1=임대·2=임대복귀·6=방출·7=자유계약, 4·8 은 생략) */
export const BADGE_CLS: Record<string, string> = {
  임대: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300",
  복귀: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300",
  방출: "bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-300",
  은퇴: "bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300",
  자유영입: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
  자유계약: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300",
};

/** 팀명 표시 — 특수 팀명 우선, 그다음 한글 변환, 원문, "—" */
export function koTeam(name: string | null | undefined): string {
  return SPECIAL_TEAM_KO[name || ""] || toKoreanTeamName(name || undefined) || name || "—";
}

/** 이적 유형 배지 — 특수 팀명 우선, 그다음 type 코드 (1=임대·2=임대복귀·6=방출·7=자유계약). 4·8 은 무배지. */
export function badgeOf(t: { fromTeamName: string | null; toTeamName: string | null; transferType: number | null }): string | null {
  if (t.toTeamName === "Retired") return "은퇴";
  if (t.toTeamName === "Free player") return "방출";
  if (t.fromTeamName === "Disqualification") return "복귀";
  if (t.fromTeamName === "Free player") return "자유영입";
  if (t.transferType === 1) return "임대";
  if (t.transferType === 2) return "복귀";
  if (t.transferType === 6) return "방출";
  if (t.transferType === 7) return "자유계약";
  return null;
}

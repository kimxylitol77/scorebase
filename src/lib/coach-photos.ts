// 감독 ts id → 이름·사진. collect-all-team-coaches 가 생성하는 data/coach-photos.json 소비.
// 라인업 lineup.coach_id 로 직접 lookup 한다 — Team.coach(이름 문자열)보다 정확하고 사진까지 있다.
import raw from "../../data/coach-photos.json";

interface CoachPhoto {
  name: string;
  logo: string | null;
}

const MAP = raw as Record<string, CoachPhoto>;

/** ts 감독 id → {name, logo}. 미등록이면 null. */
export function coachById(id?: string | null): CoachPhoto | null {
  if (!id) return null;
  return MAP[id] ?? null;
}

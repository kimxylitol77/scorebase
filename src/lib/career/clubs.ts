// 구단 목록 로더 — public/career-clubs.json 은 scripts/build-career-clubs.ts 가 만든다
// JSON 을 import 하지 않는 이유. 978개 리터럴을 tsc 가 추론하다 메모리를 터뜨린다.
import type { Club } from "./types";

let cache: Club[] | null = null;

/** 브라우저에서 구단 목록을 한 번만 받아온다 */
export async function loadClubs(): Promise<Club[]> {
  if (cache) return cache;
  const res = await fetch("/career-clubs.json");
  if (!res.ok) throw new Error(`구단 데이터를 불러오지 못했습니다 (${res.status})`);
  cache = (await res.json()) as Club[];
  return cache;
}

// 리그 페이지 제목·설명·색인 여부 — 실제로 있는 데이터로만 말한다(없는 "프리뷰·분석"을 약속하지 않는다).
// prisma 없음(테스트용). 사실 조회는 league-page-facts.
import type { LeagueFacts } from "./league-page-facts";

export interface LeagueSeoInput {
  name: string;
  /** "잉글랜드" 등 — 없으면 생략 */
  country?: string | null;
  /** "축구" 등 */
  sportLabel: string;
  /** 순위표를 보여주는 리그인가(야구는 /standings 전용, 친선·예선은 표 없음) */
  hasTable: boolean;
  facts: LeagueFacts;
  /** 발행된 글 수 */
  articles: number;
  now: Date;
}

/** 사이트맵에 올릴 만큼 내용이 있는 리그 — 선수 기록이 있고 최근 반년 30경기 이상. */
export function isRichLeague(f: LeagueFacts): boolean {
  return f.leaders > 0 && f.finished180 >= 30;
}

/** 경기·기록·글이 하나도 없는 빈 페이지는 색인하지 않는다. */
export function shouldNoindex(f: LeagueFacts, articles: number): boolean {
  return f.matches365 === 0 && f.leaders === 0 && articles === 0;
}

const kstMd = (iso: string) => {
  const k = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()}`;
};

/** 글이 없는 리그의 제목·설명. 글이 있는 리그는 기존 "경기 프리뷰·결과·분석" 을 유지한다(호출부 판단). */
export function leagueSeoCopy(i: LeagueSeoInput): { title: string; description: string } {
  // 경기가 한 건도 없으면 순위표도 없다 — 표를 약속하지 않는다.
  const table = i.hasTable && i.facts.matches365 > 0;
  const parts = [table ? "순위" : null, "일정", "결과", i.facts.leaders > 0 ? "선수 기록" : null].filter(Boolean) as string[];
  const title = `${i.name} ${parts.join("·")}`;
  const has = [
    table ? "순위표" : null,
    i.facts.matches365 > 0 ? "경기 일정·결과" : null,
    i.facts.leaders > 0 ? (i.sportLabel === "축구" ? "선수 득점·도움 순위" : "선수 기록 순위") : null,
  ].filter(Boolean) as string[];
  const lead = `${i.country ? `${i.country} ` : ""}${i.name}(${i.sportLabel})`;
  const next = i.facts.nextMatch && new Date(i.facts.nextMatch) > i.now ? ` 다음 경기 ${kstMd(i.facts.nextMatch)}.` : "";
  const description = has.length
    ? `${lead} ${has.join(", ")}를 한국어로 매일 자동 갱신합니다.${next} 한국시간 기준 · 스코어베이스`
    : `${lead} 경기 데이터를 수집하고 있습니다. 경기가 잡히면 일정·결과가 자동으로 채워집니다.`;
  return { title, description };
}

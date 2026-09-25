// 리그 페이지 SEO 문구·색인 판정 — 있는 데이터로만 말한다.
import test from "node:test";
import assert from "node:assert/strict";
import { isRichLeague, leagueSeoCopy, shouldNoindex } from "./league-seo-copy";
import type { LeagueFacts } from "./league-page-facts";

const f = (x: Partial<LeagueFacts>): LeagueFacts => ({ matches365: 0, finished180: 0, upcoming: 0, leaders: 0, nextMatch: null, lastMatch: null, ...x });
const now = new Date("2026-09-25T00:00:00Z");

test("제목은 있는 데이터만 — 순위표 리그 + 선수 기록", () => {
  const c = leagueSeoCopy({ name: "에크스트라클라사", country: "폴란드", sportLabel: "축구", hasTable: true, facts: f({ matches365: 300, leaders: 90, nextMatch: "2026-10-17T15:00:00Z" }), articles: 0, now });
  assert.equal(c.title, "에크스트라클라사 순위·일정·결과·선수 기록");
  assert.match(c.description, /^폴란드 에크스트라클라사\(축구\) 순위표, 경기 일정·결과, 선수 득점·도움 순위/);
  assert.match(c.description, /다음 경기 10\/18\./); // 한국시간 날짜
});

test("표 없는 대회(친선·야구)는 순위를 약속하지 않는다", () => {
  const c = leagueSeoCopy({ name: "클럽 친선", sportLabel: "축구", hasTable: false, facts: f({ matches365: 500 }), articles: 0, now });
  assert.equal(c.title, "클럽 친선 일정·결과");
  assert.doesNotMatch(c.description, /순위표/);
});

test("데이터가 없으면 수집 중 문구", () => {
  const c = leagueSeoCopy({ name: "K3리그", sportLabel: "축구", hasTable: true, facts: f({}), articles: 0, now });
  assert.match(c.description, /수집하고 있습니다/);
});

test("색인·사이트맵 판정", () => {
  assert.equal(shouldNoindex(f({}), 0), true);
  assert.equal(shouldNoindex(f({}), 3), false);
  assert.equal(shouldNoindex(f({ matches365: 1 }), 0), false);
  assert.equal(isRichLeague(f({ leaders: 20, finished180: 30 })), true);
  assert.equal(isRichLeague(f({ leaders: 0, finished180: 300 })), false);
});

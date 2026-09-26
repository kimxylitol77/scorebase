// 시장 핸디 방향 판정 — 절댓값만 저장된 기준선에서 어느 팀이 핸디를 주는지.
import test from "node:test";
import assert from "node:assert/strict";
import { homeGivesLineOdds, marketHomeHcPoint } from "./hc-direction";

const books = (...hl: number[]) => ({ books: hl.map((h) => ({ hl: h })) });
const m = (x: Partial<Parameters<typeof homeGivesLineOdds>[0]>) => ({
  oddsHcLine: 1.5, oddsBookmakers: null as unknown, oddsHome: null as number | null, oddsAway: null as number | null,
  oddsHcHome: 2.1, oddsHcAway: 1.75, ...x,
});

test("업체별 배당이 있으면 그 기준선을 쓴 업체 다수결", () => {
  assert.equal(marketHomeHcPoint(m({ oddsBookmakers: books(-1.5, -1.5, 1.5) })), -1.5);
  assert.equal(marketHomeHcPoint(m({ oddsBookmakers: books(1.5, 1.5, -2.5) })), 1.5);
});

test("업체별 배당이 없거나 비기면 승부 배당이 낮은 쪽(강팀)이 핸디를 준다", () => {
  assert.equal(marketHomeHcPoint(m({ oddsHome: 1.6, oddsAway: 2.4 })), -1.5);
  assert.equal(marketHomeHcPoint(m({ oddsHome: 2.4, oddsAway: 1.6 })), 1.5);
  assert.equal(marketHomeHcPoint(m({ oddsBookmakers: books(-1.5, 1.5), oddsHome: 2.4, oddsAway: 1.6 })), 1.5);
});

test("판정 재료가 없으면 null", () => {
  assert.equal(marketHomeHcPoint(m({})), null);
  assert.equal(marketHomeHcPoint(m({ oddsHcLine: null })), null);
  assert.equal(marketHomeHcPoint(m({ oddsHome: 1.9, oddsAway: 1.9 })), null);
});

test("홈 −line 픽 배당 — 홈이 같은 기준선으로 핸디를 줄 때만", () => {
  const homeFav = m({ oddsBookmakers: books(-1.5) });
  assert.equal(homeGivesLineOdds(homeFav, 1.5, "HOME"), 2.1);
  assert.equal(homeGivesLineOdds(homeFav, 1.5, "AWAY"), 1.75);
});

test("원정이 핸디를 주거나 기준선이 다르면 다른 내기라 null", () => {
  assert.equal(homeGivesLineOdds(m({ oddsBookmakers: books(1.5) }), 1.5, "HOME"), null);
  assert.equal(homeGivesLineOdds(m({ oddsBookmakers: books(-1.5) }), 2.5, "HOME"), null);
  assert.equal(homeGivesLineOdds(m({ oddsBookmakers: books(-1.5) }), null, "HOME"), null);
});

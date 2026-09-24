// 빅매치 허브 공용 규칙 — 빅매치 선정·같은 라운드 정렬.
import test from "node:test";
import assert from "node:assert/strict";
import { pickSpotlight, sameRoundOthers, type HubMatchLite } from "./tournament-hub";

const m = (o: Partial<HubMatchLite> & { id: number }): HubMatchLite => ({
  matchday: 1, status: "SCHEDULED", startTime: new Date("2026-09-25T18:00:00Z"), rankSum: null, rankWorst: null, ...o,
});

test("진행 중 경기가 최우선", () => {
  assert.equal(pickSpotlight([m({ id: 1, rankSum: 2 }), m({ id: 2, status: "LIVE", rankSum: 90 })])?.id, 2);
});

test("가장 이른 미진행 라운드에서 두 팀 다 강한 경기", () => {
  const r = pickSpotlight([
    m({ id: 1, matchday: 2, rankWorst: 1, rankSum: 2 }), // 늦은 라운드라 제외
    m({ id: 2, rankWorst: 40, rankSum: 70 }),
    m({ id: 3, rankWorst: 12, rankSum: 20 }),
  ]);
  assert.equal(r?.id, 3);
});

test("일방적 경기보다 둘 다 강한 경기 — 순위 합이 더 작아도 한쪽이 약하면 밀린다", () => {
  // AFCON 예선 1라운드 실측(FIFA 2026-07): 모로코(6)–가봉(84) 합 90 vs 말리(53)–카보베르데(64) 합 117.
  // 순위 합으로는 모로코–가봉이 뽑히지만 한쪽이 84위인 일방적 경기다.
  const r = pickSpotlight([m({ id: 1, rankWorst: 84, rankSum: 90 }), m({ id: 2, rankWorst: 64, rankSum: 117 })]);
  assert.equal(r?.id, 2);
});

test("약한 쪽 순위가 같으면 순위 합", () => {
  assert.equal(pickSpotlight([m({ id: 1, rankWorst: 10, rankSum: 19 }), m({ id: 2, rankWorst: 10, rankSum: 12 })])?.id, 2);
});

test("순위를 모르는 경기는 뒤로", () => {
  assert.equal(pickSpotlight([m({ id: 1 }), m({ id: 2, rankWorst: 150, rankSum: 200 })])?.id, 2);
});

test("같은 라운드 나머지 — 빅매치 제외, 둘 다 강한 경기 먼저", () => {
  const all = [m({ id: 1, rankWorst: 4 }), m({ id: 2, rankWorst: 30 }), m({ id: 3, rankWorst: 9 }), m({ id: 4, matchday: 2, rankWorst: 1 })];
  assert.deepEqual(sameRoundOthers(all, all[0]).map((x) => x.id), [3, 2]);
});

test("빈 목록은 null", () => {
  assert.equal(pickSpotlight([]), null);
});

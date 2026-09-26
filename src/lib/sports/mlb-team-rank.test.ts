// MLB 지구 순위 매칭 — 우리 DB 팀명과 statsapi 이름 대조, 지구 라벨.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mlbRankFromRecords } from "./mlb-team-rank";

const records = [
  { division: { id: 203 }, teamRecords: [
    { team: { name: "Los Angeles Dodgers" }, divisionRank: "1", wins: 98, losses: 62 },
    { team: { name: "San Diego Padres" }, divisionRank: "2", wins: 90, losses: 70 },
  ] },
  { division: { id: 201 }, teamRecords: [{ team: { name: "Tampa Bay Rays" }, divisionRank: "1", wins: 97, losses: 63 }] },
];

test("팀명으로 지구 순위·라벨을 찾는다", () => {
  assert.deepEqual(mlbRankFromRecords(records, "San Diego Padres"), { position: 2, division: "NL 서부", wins: 90, losses: 70 });
  assert.equal(mlbRankFromRecords(records, "Tampa Bay Rays")?.division, "AL 동부");
});

test("올스타·미등록 팀은 null — 정적 제목 폴백", () => {
  assert.equal(mlbRankFromRecords(records, "American All-Stars"), null);
  assert.equal(mlbRankFromRecords([{ division: { id: 999 }, teamRecords: [{ team: { name: "X" }, divisionRank: "1" }] }], "X"), null);
});

// af 시즌 게이트 기준 연도 — 레지스트리가 아는 값만 쓰고, 후보 중엔 최신을 잡는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { newestSeasonYearByLeague } from "./season-registry";

test("리그별로 가장 최신 후보 시즌을 잡는다", () => {
  const m = newestSeasonYearByLeague([
    { league: "UCL", seasonYear: 2025 },
    { league: "UCL", seasonYear: 2026 },
    { league: "UEL", seasonYear: 2026 },
  ]);
  assert.equal(m.get("UCL"), 2026);
  assert.equal(m.get("UEL"), 2026);
});

test("입력 순서가 달라도 결과가 같다 — 최소값을 잡으면 게이트가 거꾸로 돈다", () => {
  // 2026 을 먼저 보고 2025 를 나중에 봐도 2026 이어야 한다. 최소값이면 신시즌 af 캐시가
  // 지난 시즌 기준에 걸려 차단되고, 정작 막아야 할 지난 시즌 캐시가 통과한다.
  const m = newestSeasonYearByLeague([
    { league: "UCL", seasonYear: 2026 },
    { league: "UCL", seasonYear: 2025 },
  ]);
  assert.equal(m.get("UCL"), 2026);
});

test("모르는 리그는 값이 없다 — 호출부가 게이트를 걸지 않는 신호", () => {
  const m = newestSeasonYearByLeague([{ league: "UCL", seasonYear: 2026 }]);
  assert.equal(m.get("THAI_L1"), undefined);
  assert.equal(m.size, 1);
});

// 시즌 경계 커버리지 강제 — 축구 리그가 경계 없이 등록되면 지난 시즌 데이터가
// 순위·최근폼에 조용히 섞인다(2026-08 분데스리가2 실측). 여기서 컴파일 타임에 잡는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTS } from "@/lib/sports/sport-leagues";
import { SEASON_BOUNDARY, NO_SEASON_BOUNDARY, currentSeasonStart } from "./season-window";

const soccer = SPORTS.find((s) => s.code === "soccer")?.leagues ?? [];

test("축구 전 리그는 SEASON_BOUNDARY 또는 NO_SEASON_BOUNDARY 에 반드시 있다", () => {
  const missing = soccer.filter(
    (lg) => !(lg in SEASON_BOUNDARY) && !NO_SEASON_BOUNDARY.has(lg),
  );
  assert.deepEqual(
    missing,
    [],
    `시즌 경계 미등록 리그 발견 — season-window.ts 에 경계를 넣거나 ` +
      `NO_SEASON_BOUNDARY(컵·국대·단일대회)에 사유와 함께 추가할 것: ${missing.join(", ")}`,
  );
});

test("경계와 제외 목록에 동시에 들어간 리그는 없다", () => {
  const both = Object.keys(SEASON_BOUNDARY).filter((lg) => NO_SEASON_BOUNDARY.has(lg));
  assert.deepEqual(both, []);
});

test("경계값은 유효한 월/일이고 currentSeasonStart 가 미래를 주지 않는다", () => {
  const now = new Date();
  for (const [lg, b] of Object.entries(SEASON_BOUNDARY)) {
    assert.ok(b.month >= 1 && b.month <= 12, `${lg} month=${b.month}`);
    assert.ok(b.day >= 1 && b.day <= 28, `${lg} day=${b.day}`);
    const start = currentSeasonStart(lg, now);
    assert.ok(start && start.getTime() <= now.getTime(), `${lg} 시즌 시작이 미래`);
  }
});

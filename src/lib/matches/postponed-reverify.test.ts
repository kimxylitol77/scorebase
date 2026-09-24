import assert from "node:assert/strict";
import test from "node:test";
import { isAfFixtureRaw, planPostponedReverify } from "./postponed-reverify";

const NOW = new Date("2026-09-24T14:00:00Z");

test("af 가 종료면 점수와 af 킥오프로 확정 — SPL 레인저스-세인트미렌 9/9 실측", () => {
  const p = planPostponedReverify({ short: "FT", goalsHome: 1, goalsAway: 0, date: "2026-09-09T18:45:00+00:00" }, NOW);
  assert.deepEqual(p, { kind: "finish", homeScore: 1, awayScore: 0, startTime: new Date("2026-09-09T18:45:00Z") });
});

test("중단 뒤 다른 날 재개·종료된 경기는 새 날짜로 확정 — CHILE_PD 8/31→9/16 실측", () => {
  const p = planPostponedReverify({ short: "FT", goalsHome: 0, goalsAway: 1, date: "2026-09-16T21:00:00+00:00" }, NOW);
  assert.equal(p.kind, "finish");
  assert.equal(p.kind === "finish" && p.startTime.toISOString(), "2026-09-16T21:00:00.000Z");
});

test("연장·승부차기 종료도 종료로 본다", () => {
  for (const short of ["AET", "PEN"]) {
    assert.equal(planPostponedReverify({ short, goalsHome: 2, goalsAway: 3, date: "2026-07-14T15:00:00+00:00" }, NOW).kind, "finish");
  }
});

test("미래 날짜로 재편성된 미시작 경기는 그 날짜로 옮긴다 — KAZAKHSTAN_PL 8/23→10/17", () => {
  const p = planPostponedReverify({ short: "NS", goalsHome: null, goalsAway: null, date: "2026-10-17T12:00:00+00:00" }, NOW);
  assert.deepEqual(p, { kind: "reschedule", startTime: new Date("2026-10-17T12:00:00Z") });
});

test("af 도 연기·취소면 그대로 둔다", () => {
  for (const short of ["PST", "CANC", "ABD", "SUSP"]) {
    assert.equal(planPostponedReverify({ short, goalsHome: null, goalsAway: null, date: "2026-10-01T12:00:00+00:00" }, NOW).kind, "keep");
  }
});

test("판정 근거가 약하면 건드리지 않는다", () => {
  // 점수 없는 종료, 미래 시각의 종료, 지난 날짜의 미시작, 진행 중, 날짜 없음
  assert.equal(planPostponedReverify({ short: "FT", goalsHome: null, goalsAway: null, date: "2026-09-09T18:45:00+00:00" }, NOW).kind, "keep");
  assert.equal(planPostponedReverify({ short: "FT", goalsHome: 1, goalsAway: 0, date: "2026-09-30T18:45:00+00:00" }, NOW).kind, "keep");
  assert.equal(planPostponedReverify({ short: "NS", goalsHome: null, goalsAway: null, date: "2026-09-20T18:45:00+00:00" }, NOW).kind, "keep");
  assert.equal(planPostponedReverify({ short: "2H", goalsHome: 1, goalsAway: 0, date: "2026-09-24T13:00:00+00:00" }, NOW).kind, "keep");
  assert.equal(planPostponedReverify({ short: "FT", goalsHome: 1, goalsAway: 0, date: null }, NOW).kind, "keep");
});

test("af 원본 raw 인지로 출처를 확정 — ESPN 숫자 id 오조회 방지", () => {
  assert.equal(isAfFixtureRaw(JSON.stringify({ fixture: { id: 1556644 } }), "1556644"), true);
  assert.equal(isAfFixtureRaw({ fixture: { id: 1556644 } }, "1556644"), true);
  assert.equal(isAfFixtureRaw(JSON.stringify({ id: "748506", competitions: [] }), "748506"), false);
  assert.equal(isAfFixtureRaw(JSON.stringify({ fixture: { id: 1 } }), "1556644"), false);
  assert.equal(isAfFixtureRaw("not json", "1"), false);
  assert.equal(isAfFixtureRaw(null, "1"), false);
});

// 픽 준비 판정 — 야구 선발 원칙과 국제대회 예외 확인
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReadiness } from "./pick-readiness";

const base = { startTime: new Date("2026-09-27T09:30:00Z"), homeStarter: null, awayStarter: null };

test("KBO 는 선발이 없으면 보류", () => {
  assert.deepEqual(pickReadiness({ ...base, league: "KBO" }), { ready: false, reason: "선발 미확정" });
});

test("CPBL 도 선발 원칙 유지", () => {
  assert.equal(pickReadiness({ ...base, league: "CPBL" }).ready, false);
});

test("아시안게임·WBC 는 선발 소스가 없어 바로 낸다", () => {
  assert.equal(pickReadiness({ ...base, league: "ASIAN_GAMES_BB" }).ready, true);
  assert.equal(pickReadiness({ ...base, league: "WBC" }).ready, true);
});

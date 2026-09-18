// 스크레이퍼 급증 판정 — 2026-08-19~09-18 실측값으로 평소 날은 조용하고 이상한 날만 울리는지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectScraperSurge } from "./scraper-surge";

const ua = (sessions: number) => ({ ua: "Mozilla/5.0 test", sessions, topPaths: [] });
// 8/19~9/1 실측 의심 세션(14일)
const BEFORE_0902 = [44, 54, 91, 150, 69, 79, 109, 189, 270, 198, 461, 333, 193, 302];
// 9/3~9/16 실측 의심 세션(14일)
const BEFORE_0917 = [300, 292, 361, 295, 360, 280, 264, 360, 265, 301, 287, 223, 333, 360];

test("평소 날(9/16: 의심 360, 최다 UA 246)은 울리지 않는다", () => {
  assert.equal(detectScraperSurge({ suspicious: 360, topAutomated: ua(246) }, BEFORE_0917).alert, false);
});

test("평소 최대치(8/29: 의심 461, 최다 UA 348)도 울리지 않는다", () => {
  assert.equal(detectScraperSurge({ suspicious: 461, topAutomated: ua(348) }, BEFORE_0902.slice(0, 10)).alert, false);
});

test("알리바바 스크레이퍼 첫날(9/17: 의심 1,453, 최다 UA 1,026)은 두 규칙 모두로 울린다", () => {
  const r = detectScraperSurge({ suspicious: 1453, topAutomated: ua(1026) }, BEFORE_0917);
  assert.equal(r.alert, true);
  assert.equal(r.reasons.length, 2);
});

test("여러 자동화 UA 가 한꺼번에 몰린 날(9/2: 의심 777, 최다 UA 191)은 배수 규칙으로 울린다", () => {
  const r = detectScraperSurge({ suspicious: 777, topAutomated: ua(191) }, BEFORE_0902);
  assert.equal(r.alert, true);
  assert.equal(r.reasons.length, 1);
});

test("직전 기록이 7일 미만이면 배수 규칙은 쉬고 UA 규칙만 본다", () => {
  assert.equal(detectScraperSurge({ suspicious: 5000, topAutomated: ua(100) }, [10, 10, 10]).alert, false);
  assert.equal(detectScraperSurge({ suspicious: 5000, topAutomated: ua(700) }, [10, 10, 10]).alert, true);
});

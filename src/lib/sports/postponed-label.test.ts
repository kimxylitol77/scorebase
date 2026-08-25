// 연기/취소 라벨 분기 고정 — 야구만 "취소", 종목이 섞이면 "연기".
import { test } from "node:test";
import assert from "node:assert/strict";
import { postponedLabel } from "./sport-leagues";

test("야구는 취소 — 우천 등으로 그날 경기를 무른 것", () => {
  for (const lg of ["KBO", "NPB", "MLB", "LMB", "CPBL"]) {
    assert.equal(postponedLabel(lg), "취소", lg);
  }
});

test("야구 외 종목은 연기", () => {
  for (const lg of ["EPL", "NBA", "NHL", "UFC", "LOL", "VB_FRIENDLY"]) {
    assert.equal(postponedLabel(lg), "연기", lg);
  }
});

test("목록은 전부 야구일 때만 취소 — 섞이면 연기", () => {
  assert.equal(postponedLabel(["KBO", "NPB", "MLB"]), "취소");
  assert.equal(postponedLabel(["KBO", "EPL"]), "연기");
  assert.equal(postponedLabel(["EPL", "SERIE_A"]), "연기");
});

test("빈 목록·null 은 기존 표기 유지", () => {
  assert.equal(postponedLabel([]), "연기");
  assert.equal(postponedLabel(null), "연기");
  assert.equal(postponedLabel(undefined), "연기");
});

// af 조 이름 → 화면 라벨 변환. 대회명 접두 제거와 "모르면 원문 유지"가 핵심.
import test from "node:test";
import assert from "node:assert/strict";
import { afGroupLabel } from "./af-group-label";

test("대회명 접두를 떼고 리그·조만 남긴다", () => {
  assert.equal(afGroupLabel("UEFA Nations League , League A, Group 1"), "리그 A · 1조");
  assert.equal(afGroupLabel("UEFA Nations League , League D, Group 2"), "리그 D · 2조");
});

test("월드컵식 단일 조도 처리한다", () => {
  assert.equal(afGroupLabel("Group A"), "A조");
  assert.equal(afGroupLabel("Group 3"), "3조");
});

test("해석 못 하는 형식은 원문을 그대로 둔다 — 임의로 깎으면 조가 섞인다", () => {
  assert.equal(afGroupLabel("Regular Season - 1"), "Regular Season - 1");
  assert.equal(afGroupLabel("Promotion Play-offs"), "Promotion Play-offs");
});

test("서로 다른 조가 같은 라벨로 합쳐지지 않는다", () => {
  const labels = [
    "UEFA Nations League , League A, Group 1",
    "UEFA Nations League , League A, Group 2",
    "UEFA Nations League , League B, Group 1",
    "UEFA Nations League , League D, Group 2",
  ].map(afGroupLabel);
  assert.equal(new Set(labels).size, labels.length);
});

test("빈 값·공백은 빈 문자열", () => {
  assert.equal(afGroupLabel(""), "");
  assert.equal(afGroupLabel("   "), "");
});

// AFCON 2027 예선 규칙 — 개최국 조와 일반 조의 진출 구역이 다르다.
import test from "node:test";
import assert from "node:assert/strict";
import { afconGroupLetter, afconZone, AFCON_HOSTS } from "./afcon";

const base = { isHost: false, position: 1, groupHasHost: false, groupPlayed: true, bestNonHostPosition: 1 };

test("조 글자 — ts 순서 0~11 → A~L", () => {
  assert.equal(afconGroupLetter(0), "A");
  assert.equal(afconGroupLetter(3), "D");
  assert.equal(afconGroupLetter(11), "L");
});

test("공동개최국 셋", () => {
  assert.deepEqual([...AFCON_HOSTS].sort(), ["Kenya", "Tanzania", "Uganda"]);
});

test("일반 조 — 1·2위 진출, 3위는 아님", () => {
  assert.equal(afconZone({ ...base, position: 2 }), "qualify");
  assert.equal(afconZone({ ...base, position: 3 }), null);
});

test("개최국은 경기 전이라도 자동 진출 확정", () => {
  assert.equal(afconZone({ ...base, isHost: true, position: 4, groupHasHost: true, groupPlayed: false }), "host");
});

test("개최국 조 — 개최국을 뺀 최상위 1팀만 진출", () => {
  // 개최국이 1위면 2위가 비개최국 최상위
  const g = { ...base, groupHasHost: true, bestNonHostPosition: 2 };
  assert.equal(afconZone({ ...g, position: 2 }), "qualify");
  assert.equal(afconZone({ ...g, position: 3 }), null);
  // 개최국이 3위면 1위만
  const g2 = { ...base, groupHasHost: true, bestNonHostPosition: 1 };
  assert.equal(afconZone({ ...g2, position: 1 }), "qualify");
  assert.equal(afconZone({ ...g2, position: 2 }), null);
});

test("개막 전엔 개최국 말고는 칠하지 않는다", () => {
  assert.equal(afconZone({ ...base, groupPlayed: false }), null);
});

// 이달의 감독 카드 삽입 단위 테스트 — 섹션별 위치, 섹션 누락 시 끝으로, 두 번 넣지 않음
import { test } from "node:test";
import assert from "node:assert/strict";
import { insertManagerCards } from "./manager-cards-insert";

const WHO = { coachKo: "엔조 마레스카", teamKo: "맨체스터 시티", monthLabel: "2026년 9월" };
const BODY = "# 제목\n\n## 선정 이유\n\n가.\n\n## 이번 달의 전술\n\n나.\n\n## 결정적 경기\n\n다.\n\n## 키 플레이어\n\n라.\n\n## 다음 달 관전 포인트\n\n마.\n";
const kinds = (s: string) => [...s.matchAll(/kind=(\w+)/g)].map((m) => m[1]);

test("섹션 순서대로 포스터·덤벨·피자·순위 흐름·선수 카드형", () => {
  const out = insertManagerCards(BODY, 5687, WHO);
  assert.deepEqual(kinds(out), ["poster", "dumbbell", "pizza", "bump", "fut"]);
  assert.ok(out.indexOf("kind=poster") < out.indexOf("## 선정 이유"));
  assert.ok(out.indexOf("가.") < out.indexOf("kind=dumbbell") && out.indexOf("kind=dumbbell") < out.indexOf("## 이번 달의 전술"));
  assert.ok(out.indexOf("다.") < out.indexOf("kind=bump") && out.indexOf("kind=bump") < out.indexOf("## 키 플레이어"));
  assert.ok(out.indexOf("마.") < out.indexOf("kind=fut"));
  assert.ok(out.includes("id=5687"));
});

test("섹션 제목이 다르면 그 카드는 글 끝으로 간다", () => {
  const out = insertManagerCards("# 제목\n\n## 왜 이 감독인가\n\n가.\n\n## 맺음\n\n나.\n", 1, WHO);
  assert.deepEqual(kinds(out), ["poster", "dumbbell", "pizza", "bump", "fut"]);
  assert.ok(out.indexOf("나.") < out.indexOf("kind=dumbbell"));
});

test("이미 카드가 있으면 그대로 둔다", () => {
  const once = insertManagerCards(BODY, 5687, WHO);
  assert.equal(insertManagerCards(once, 5687, WHO), once);
});

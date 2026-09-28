// ESPN 자리표시자 팀 판별 테스트
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasRealEspnTeams } from "./espn-placeholder";

const ev = (a: string, b: string) => ({ competitions: [{ competitors: [{ team: { id: a } }, { team: { id: b } }] }] });

test("정상 팀 id 두 개면 통과", () => assert.equal(hasRealEspnTeams(ev("30", "5")), true));
test("음수 자리표시자 id 면 거른다", () => assert.equal(hasRealEspnTeams(ev("-2", "30")), false));
test("id 가 비면 거른다", () => assert.equal(hasRealEspnTeams(ev("", "30")), false));

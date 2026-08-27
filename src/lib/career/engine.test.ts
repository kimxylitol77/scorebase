// 커리어 엔진 검증 — 수치가 상식 범위를 벗어나지 않는지, 어떤 국적을 골라도 게임이 막히지 않는지
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  advance, makeRng, nextDecision, ovrToTier, startCareer, summarize, valueOf, youthOffers,
} from "./engine";
import { readFileSync } from "fs";
import path from "path";
import { NATIONS } from "./nations";
import type { Club, Position } from "./types";

const CLUBS: Club[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/career-clubs.json"), "utf-8"),
);

test("구단 데이터가 비어 있지 않다", () => {
  assert.ok(CLUBS.length > 500, `구단 ${CLUBS.length}개`);
  for (const c of CLUBS) {
    assert.ok(c.n && c.g && c.c, `필드 누락: ${JSON.stringify(c)}`);
    assert.ok(c.t >= 1 && c.t <= 6, `티어 범위 밖: ${c.t}`);
  }
});

test("몸값은 능력치가 오르면 함께 오른다", () => {
  for (let ovr = 46; ovr < 95; ovr++) {
    assert.ok(valueOf(ovr + 1, 25) > valueOf(ovr, 25), `ovr ${ovr} 에서 역전`);
  }
});

test("몸값은 30세를 넘기면 꺾인다", () => {
  assert.ok(valueOf(80, 33) < valueOf(80, 26), "33세가 26세보다 비싸면 안 된다");
});

test("능력치→티어 환산은 단조롭다", () => {
  // 능력치가 내려갈수록 티어 숫자는 커지기만 해야 한다 (역전 금지)
  let prev = 0;
  for (let ovr = 95; ovr >= 45; ovr--) {
    const t = ovrToTier(ovr);
    assert.ok(t >= prev, `ovr ${ovr} 에서 T${prev} → T${t} 로 역전`);
    assert.ok(t >= 1 && t <= 6, `ovr ${ovr} → T${t} 범위 밖`);
    prev = t;
  }
  assert.equal(ovrToTier(90), 1);
  assert.equal(ovrToTier(50), 6);
});

test("어떤 국적을 골라도 유스 제안이 3곳 나온다", () => {
  for (const n of NATIONS) {
    for (let seed = 1; seed <= 20; seed++) {
      const offers = youthOffers(CLUBS, n.code, makeRng(seed));
      assert.equal(offers.length, 3, `${n.label}(시드 ${seed}) 제안 ${offers.length}곳`);
      assert.equal(new Set(offers.map((o) => o.n)).size, 3, `${n.label} 제안에 중복`);
    }
  }
});

test("한국을 고르면 K리그 구단이 제안된다", () => {
  let sawKorean = false;
  for (let seed = 1; seed <= 30; seed++) {
    if (youthOffers(CLUBS, "KOR", makeRng(seed)).some((c) => c.c === "KOR")) sawKorean = true;
  }
  assert.ok(sawKorean, "한국 국적인데 한국 구단이 한 번도 안 나왔다");
});

/** 시드 하나로 은퇴까지 자동 진행 */
function playFull(seed: number, nation: string, pos: Position) {
  const rng = makeRng(seed);
  let s = startCareer(nation, pos, rng);
  let guard = 0;
  while (!s.retired && guard++ < 30) {
    const d = nextDecision(s, CLUBS, rng);
    if (d.kind === "event") continue; // 이벤트는 상태를 크게 바꾸지 않으므로 테스트에서는 건너뛴다
    const opt = d.options.find((o) => !o.retire) ?? d.options[0];
    assert.ok(opt, `시드 ${seed}: 고를 선택지가 없다`);
    s = advance(s, opt.club, rng);
  }
  assert.ok(guard < 30, `시드 ${seed}: 은퇴에 도달하지 못했다`);
  return s;
}

test("200회 완주 — 수치가 상식 범위 안이다", () => {
  const positions: Position[] = ["GK", "DF", "MF", "FW"];
  for (let seed = 1; seed <= 200; seed++) {
    const nation = NATIONS[seed % NATIONS.length].code;
    const pos = positions[seed % 4];
    const s = playFull(seed, nation, pos);
    const sum = summarize(s);

    assert.ok(s.age >= 38 && s.age <= 40, `시드 ${seed}: 은퇴 나이 ${s.age}`);
    assert.ok(sum.peakOvr >= 46 && sum.peakOvr <= 99, `시드 ${seed}: 최고 OVR ${sum.peakOvr}`);
    assert.ok(sum.apps > 100 && sum.apps < 800, `시드 ${seed}: 통산 ${sum.apps}경기`);
    assert.ok(sum.goals >= 0 && sum.goals <= sum.apps, `시드 ${seed}: 득점 ${sum.goals}/${sum.apps}`);
    assert.ok(sum.clubs >= 1, `시드 ${seed}: 소속팀 ${sum.clubs}개`);
    if (pos === "GK") assert.equal(sum.goals, 0, `시드 ${seed}: 골키퍼가 득점했다`);
  }
});

test("같은 시드는 같은 커리어를 만든다", () => {
  const a = playFull(42, "KOR", "MF");
  const b = playFull(42, "KOR", "MF");
  assert.deepEqual(summarize(a), summarize(b));
});

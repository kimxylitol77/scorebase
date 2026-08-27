// 공유 파라미터 검증 — URL 은 누구나 고칠 수 있으므로, 이상한 값이 카드에 그대로 실리면 안 된다
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildShareParams, parseShareParams, topClubOf } from "./share";
import { advance, makeRng, nextDecision, startCareer, summarize } from "./engine";
import { readFileSync } from "fs";
import path from "path";
import type { Club } from "./types";

const CLUBS: Club[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "public/career-clubs.json"), "utf-8"),
);

function finished(seed: number) {
  const rng = makeRng(seed);
  let s = startCareer("KOR", "MF", rng);
  let guard = 0;
  while (!s.retired && guard++ < 30) {
    const d = nextDecision(s, CLUBS, rng);
    if (d.kind === "event") continue;
    const opt = d.options.find((o) => !o.retire) ?? d.options[0];
    s = advance(s, opt.club, rng);
  }
  return s;
}

test("커리어를 공유 파라미터로 만들었다 되읽으면 값이 보존된다", () => {
  for (const seed of [3, 11, 47, 88]) {
    const s = finished(seed);
    const sum = summarize(s);
    const parsed = parseShareParams(buildShareParams(s, sum));
    assert.ok(parsed, `시드 ${seed}: 되읽기 실패`);
    assert.equal(parsed.apps, sum.apps);
    assert.equal(parsed.goals, sum.goals);
    assert.equal(parsed.assists, sum.assists);
    assert.equal(parsed.titles, sum.titles);
    assert.equal(parsed.peakOvr, sum.peakOvr);
    assert.equal(parsed.caps, s.caps);
    assert.equal(parsed.topClub, topClubOf(s));
    assert.equal(parsed.nation, "KOR");
    assert.equal(parsed.position, "MF");
  }
});

test("가장 높은 티어의 구단이 대표 구단으로 뽑힌다", () => {
  const s = finished(11);
  const top = topClubOf(s);
  const bestTier = Math.min(...s.history.map((h) => h.club.t));
  const named = s.history.find((h) => h.club.n === top);
  assert.ok(named, "대표 구단이 커리어에 없다");
  assert.equal(named.club.t, bestTier, "더 높은 티어 구단이 있는데 다른 팀이 뽑혔다");
});

test("망가진 국적·포지션은 거부한다", () => {
  assert.equal(parseShareParams(new URLSearchParams("n=ZZZ&p=MF")), null);
  assert.equal(parseShareParams(new URLSearchParams("n=KOR&p=XX")), null);
  assert.equal(parseShareParams(new URLSearchParams("")), null);
});

test("숫자는 범위 밖 값이 들어와도 잘려 나온다", () => {
  const sp = new URLSearchParams({
    n: "KOR", p: "FW", o: "99999", v: "-40", a: "abc", g: "1e9", s: "12.7", t: "999", c: "0", cp: "0", cl: "정상팀",
  });
  const d = parseShareParams(sp);
  assert.ok(d);
  assert.equal(d.peakOvr, 99, "능력치 상한");
  assert.equal(d.peakValue, 0, "몸값 하한");
  assert.equal(d.apps, 0, "숫자가 아니면 하한");
  assert.equal(d.goals, 9999, "득점 상한");
  assert.equal(d.assists, 13, "소수는 반올림");
  assert.equal(d.titles, 99, "우승 상한");
});

test("구단명은 길이를 자르고 제어문자를 지운다", () => {
  const long = "가".repeat(200);
  const d = parseShareParams(new URLSearchParams({ n: "KOR", p: "MF", cl: long }));
  assert.ok(d);
  assert.equal(d.topClub.length, 24, "24자로 잘려야 한다");

  const dirty = parseShareParams(
    new URLSearchParams({ n: "KOR", p: "MF", cl: "포항\u0000스틸\u001f러스" }),
  );
  assert.ok(dirty);
  assert.equal(dirty.topClub, "포항스틸러스");
});

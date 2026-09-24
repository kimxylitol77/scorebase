// 기록 줄 매칭 테스트 — 이닝 환산, 이름 관문, 경기 식별·유일성·이미 쓰인 번호 제외
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDistinctiveExact, matchByStatLine, namesLikelySame, officialIpToOuts, tsIpToOuts, type OfficialLine } from "./baseball-statline-match";
import type { PlayerStatRow } from "./thesports/baseball-stats";

test("이닝 표기 환산", () => {
  assert.equal(officialIpToOuts("5 2/3"), 17);
  assert.equal(officialIpToOuts("2/3"), 2);
  assert.equal(officialIpToOuts("6"), 18);
  assert.equal(officialIpToOuts(null), null);
  assert.equal(tsIpToOuts(5.2), 17);
  assert.equal(tsIpToOuts(0.1), 1);
  assert.equal(tsIpToOuts(7), 21);
});

test("이름 관문 — 오기·풀네임·음역차는 통과, 다른 사람은 막음", () => {
  assert.ok(namesLikelySame("권휘동", "권희동"));
  assert.ok(namesLikelySame("사뮤엘 힐리어드", "힐리어드"));
  assert.ok(namesLikelySame("야나가와 다이세이", "야나가와 타이세이"));
  assert.ok(!namesLikelySame("후지이 겐토", "안상현"));
  assert.ok(!namesLikelySame("황희성", "유로결"));
  assert.ok(!namesLikelySame(undefined, "안상현"));
  assert.ok(!namesLikelySame("안상현", "藤井 健翔"));
});

const bat = (id: string, ab: number, h: number, rbi = 0, r = 0): PlayerStatRow => ({ playerId: id, role: "batter", stats: { 614: ab, 616: h, 617: rbi, 615: r } });
const pit = (id: string, ip: number, h: number, er: number): PlayerStatRow => ({ playerId: id, role: "pitcher", stats: { 634: ip, 635: h, 636: er } });
const ob = (pid: string, team: string, opp: string, ab: number, h: number, rbi = 0, r = 0): OfficialLine => ({ pid, role: "B", team, opponent: opp, ab, h, rbi, r, hr: null, bb: null, so: null, ip: null, er: null });
const op = (pid: string, team: string, opp: string, ip: string, h: number, er: number): OfficialLine => ({ pid, role: "P", team, opponent: opp, ab: null, h, rbi: null, r: null, hr: null, bb: null, so: null, ip, er });

// 이 경기: 홈 NC vs 원정 KT. 같은 날 다른 경기(LG vs 두산) 기록도 섞여 있다.
const sides = {
  home: [bat("t1", 4, 2, 1), bat("t2", 3, 0), bat("t3", 0, 0), bat("t4", 0, 0), pit("t5", 5.2, 4, 2)],
  away: [bat("t6", 4, 1, 0, 1), bat("t7", 4, 3, 2), pit("t8", 6, 7, 3)],
};
const official = [
  ob("p1", "NC", "KT", 4, 2, 1), ob("p2", "NC", "KT", 3, 0), ob("p3", "NC", "KT", 0, 0), ob("p4", "NC", "KT", 0, 0), op("p5", "NC", "KT", "5 2/3", 4, 2),
  ob("p6", "KT", "NC", 4, 1, 0, 1), ob("p7", "KT", "NC", 4, 3, 2), op("p8", "KT", "NC", "6", 7, 3),
  ob("x1", "LG", "두산", 4, 2, 1), ob("x2", "두산", "LG", 4, 3, 2),
];

test("기록 줄이 유일한 선수만 잇고, 0타수 대주자처럼 겹치는 줄은 잇지 않는다", () => {
  const m = matchByStatLine(sides, official, new Set(), new Set());
  assert.equal(m.t1, "p1");
  assert.equal(m.t5, "p5");
  assert.equal(m.t7, "p7");
  assert.equal(m.t8, "p8");
  assert.equal(m.t3, undefined);
  assert.equal(m.t4, undefined);
});

test("이름으로 이미 이어진 선수와 그 번호는 건너뛴다", () => {
  const m = matchByStatLine(sides, official, new Set(["t1"]), new Set(["p1"]));
  assert.equal(m.t1, undefined);
  assert.equal(m.t2, "p2");
});

test("맞는 줄이 절반 미만이면 다른 경기로 보고 잇지 않는다", () => {
  const m = matchByStatLine(sides, [ob("x1", "LG", "두산", 4, 2, 1), ob("x2", "두산", "LG", 4, 3, 2)], new Set(), new Set());
  assert.deepEqual(m, {});
});

test("투수 자책점이 어긋나도 이닝·피안타·볼넷·삼진이 같으면 잇는다", () => {
  const m = matchByStatLine(
    { home: [pit("t1", 5, 8, 4), bat("t2", 4, 1), bat("t3", 3, 2, 1)], away: [bat("t4", 4, 0)] },
    [op("p1", "KT", "NC", "5", 8, 5), ob("p2", "KT", "NC", 4, 1), ob("p3", "KT", "NC", 3, 2, 1), ob("p4", "NC", "KT", 4, 0)],
    new Set(),
    new Set(),
  );
  assert.equal(m.t1, "p1");
});

test("뚜렷한 정확 일치 — 3이닝 이상 투수는 자책까지 같아야, 짧은 등판은 아니다", () => {
  assert.ok(isDistinctiveExact(pit("a", 6, 8, 3), op("p", "NC", "KT", "6", 8, 3)));
  assert.ok(!isDistinctiveExact(pit("a", 6, 8, 4), op("p", "NC", "KT", "6", 8, 3)));
  assert.ok(!isDistinctiveExact(pit("a", 0.2, 1, 0), op("p", "NC", "KT", "2/3", 1, 0)));
  assert.ok(isDistinctiveExact(bat("b", 5, 3), ob("p", "NC", "KT", 5, 3)));
  assert.ok(!isDistinctiveExact(bat("b", 3, 1), ob("p", "NC", "KT", 3, 1)));
});

// 전술 지표 계산 단위 테스트 — 파생값, 전후반 자기 검증, 모멘텀 구간, 골 좌표 정규화
import { test } from "node:test";
import assert from "node:assert/strict";
import { goalSequences, halfShifts, insightLines, momentum, teamStyle } from "./insights";

const HOME = { ball_possession: 56, passes: 468, passes_accuracy: 402, long_balls: 40, crosses: 19, key_passes: 11, shots: 16, shots_on_target: 6, shots_ibox: 12, big_chance_created: 3, big_chance_missed: 2, duels: 85, duels_won: 35, aerial_won: 13, aerial_lost: 15, tackles: 6, interceptions: 7, clearances: 26, poss_losts: 110, fouls: 14, corner_kicks: 6 };
const AWAY = { ball_possession: 44, passes: 372, passes_accuracy: 304, long_balls: 55, crosses: 16, key_passes: 13, shots: 16, shots_on_target: 8, shots_ibox: 13, tackles: 16, interceptions: 9, clearances: 21, fouls: 14, corner_kicks: 5 };

test("스타일 지표 — 비율은 코드가 계산한다", () => {
  const s = teamStyle(HOME);
  assert.equal(s.passAcc, 86); // 402/468
  assert.equal(s.longBallShare, 9); // 40/468
  assert.equal(s.inBoxShare, 75); // 12/16
  assert.equal(s.duelWinPct, 41); // 35/85
  assert.equal(s.aerialWinPct, 46); // 13/28
  assert.equal(s.defActions, 13);
  assert.equal(s.onTargetShare, 38); // 6/16
  assert.equal(teamStyle({}).passAcc, null);
});

test("전후반 변화 — 전체 값이 팀 통계와 안 맞는 코드는 버린다", () => {
  const half = {
    ft: { "25": [56, 44] as [number, number], "40": [468, 378] as [number, number], "43": [99, 99] as [number, number] },
    p1: { "25": [60, 40] as [number, number], "40": [250, 170] as [number, number], "43": [50, 50] as [number, number] },
    p2: { "25": [52, 48] as [number, number], "40": [218, 208] as [number, number], "43": [49, 49] as [number, number] },
  };
  const out = halfShifts(half, HOME, AWAY);
  assert.deepEqual(out.map((s) => s.label), ["점유율", "패스"]); // 크로스(99)는 팀 통계 19 와 달라 제외
  assert.deepEqual(out[0].p2, [52, 48]);
  assert.deepEqual(halfShifts(null, HOME, AWAY), []);
});

test("모멘텀 — 15분 창과 가장 긴 우세 구간", () => {
  const first = Array.from({ length: 45 }, (_, i) => (i < 15 ? 60 : i < 30 ? -50 : 0));
  const second = Array.from({ length: 45 }, () => -40);
  const m = momentum({ data: [first, second] })!;
  assert.equal(m.windows[0].side, "home");
  assert.equal(m.windows[1].side, "away");
  assert.equal(m.windows[2].side, "even");
  assert.equal(m.windows[5].side, "away");
  assert.equal(m.longest?.side, "away");
  assert.equal(m.longest?.from, 16); // 전반 16분부터 후반 끝까지 (0 은 끊지 않는다)
  assert.equal(m.longest?.to, 90);
  assert.equal(m.homeShare, 20); // 15 / 75
  assert.equal(momentum(null), null);
});

test("골 장면 — 공격 방향을 100 으로 통일하고 구역을 가른다", () => {
  const seq = goalSequences([
    { number: 1, time: 532, pass: [{ x: "87.4", y: "50.4", belong: 1, shooter: 1, player_id: "a" }] },
    {
      number: 2,
      time: 674,
      pass: [
        { x: "64.8", y: "6.3", belong: 2, player_id: "b" },
        { x: "40.8", y: "19.3", belong: 2, player_id: "c" },
        { x: "26.6", y: "41.3", belong: 2, assist: 1, player_id: "b" },
        { x: "8.1", y: "54.3", belong: 2, shooter: 1, player_id: "d" },
      ],
    },
  ]);
  assert.equal(seq[0].side, "home");
  assert.equal(seq[0].minute, 9);
  assert.equal(seq[0].kind, "단독 마무리");
  assert.equal(seq[0].shotZone, "박스 안 중앙");
  assert.equal(seq[1].side, "away");
  assert.equal(seq[1].steps[0].x, 35.2); // 100 - 64.8
  assert.equal(seq[1].steps[3].x, 91.9);
  assert.equal(seq[1].startZone, "자기 진영");
  assert.equal(seq[1].passes, 3);
  assert.equal(seq[1].kind, "긴 빌드업");
  assert.equal(seq[1].shotZone, "박스 안 중앙");
});

test("프롬프트 블록 — 이름 없는 선수는 비우고, 자책골을 표시한다", () => {
  const lines = insightLines(
    {
      style: { home: teamStyle(HOME), away: teamStyle(AWAY) },
      halves: [],
      momentum: null,
      goals: goalSequences([{ number: 1, time: 60, own_goal: 1, pass: [{ x: "10", y: "50", belong: 1, shooter: 1, player_id: "x" }] }]),
    },
    "맨시티",
    "선덜랜드",
    (id) => (id === "x" ? "홍길동" : null),
  );
  assert.ok(lines[0].includes("롱볼(전체 패스 중 비중): 맨시티 40회(9%) / 선덜랜드 55회(15%)"));
  assert.ok(lines[1].includes("1분 선덜랜드 (상대 자책골)"));
});

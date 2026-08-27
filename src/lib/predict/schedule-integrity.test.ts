// 일정 완전성 게이트 — 2026-08-27 운영 실측값을 회귀 테스트로 고정.
// 여기 숫자는 전부 그날 운영 DB 에서 뽑은 것이다. 임계를 손대면 여기서 먼저 깨진다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScheduleIntegrity, type IntegrityMatch } from "./schedule-integrity";

const NOW = new Date("2026-08-27T04:00:00Z");

/**
 * 합성 리그. 팀끼리 실제로 짝지어(greedy) 목표 경기수를 채운다.
 * 가상 상대를 쓰면 팀 수가 두 배로 세어져 teamCount 검증이 무의미해진다.
 */
function league(opts: {
  teams: number;
  /** 팀당 총경기(완료+예정) */
  totalPerTeam: number;
  /** 예정 경기 "개수" — remainingPerTeam = scheduledMatches*2/teams */
  scheduledMatches: number;
  lastScheduledInDays: number;
  /** 팀 0 의 총경기만 이만큼 깎아 산포를 만든다. */
  skewFirstTeamBy?: number;
}): IntegrityMatch[] {
  const { teams, totalPerTeam, scheduledMatches, lastScheduledInDays, skewFirstTeamBy = 0 } = opts;
  const need = Array.from({ length: teams }, (_, t) =>
    totalPerTeam - (t === 0 ? skewFirstTeamBy : 0),
  );
  const pairs: Array<[number, number]> = [];
  for (;;) {
    const order = need.map((n, i) => ({ n, i })).sort((a, b) => b.n - a.n);
    if (order.length < 2 || order[1].n <= 0) break;
    pairs.push([order[0].i, order[1].i]);
    need[order[0].i]--;
    need[order[1].i]--;
  }
  const past = new Date(NOW.getTime() - 7 * 86_400_000);
  const last = new Date(NOW.getTime() + lastScheduledInDays * 86_400_000);
  return pairs.map(([h, a], idx) => ({
    status: idx < scheduledMatches ? "SCHEDULED" : "FINISHED",
    startTime: idx < scheduledMatches ? last : past,
    homeTeamId: h,
    awayTeamId: a,
  }));
}

test("극단 확률이 아니면 검사하지 않는다 (시즌 초 리그 무영향)", () => {
  const ms = league({ teams: 20, totalPerTeam: 38, scheduledMatches: 370, lastScheduledInDays: 260 });
  assert.equal(checkScheduleIntegrity(ms, 0.31, NOW).trustworthy, true);
});

test("K리그1 실측 — 팀당 1.2경기 남았는데 마지막 일정이 31일 뒤면 차단", () => {
  // 12팀·팀당 26경기 균일(산포 0)이라 팀별 편차로는 못 잡는 케이스.
  const ms = league({ teams: 12, totalPerTeam: 26, scheduledMatches: 7, lastScheduledInDays: 31 });
  const r = checkScheduleIntegrity(ms, 0.999, NOW);
  assert.equal(r.trustworthy, false);
  assert.equal(r.spreadRatio, 0, "산포는 0 이어야 한다 — 검사 1 이 아니라 검사 3 이 잡아야 함");
  assert.match(r.reason ?? "", /마지막 일정이/);
});

test("MLS 실측 — 팀별 총경기가 19~23 으로 어긋나면 차단", () => {
  const ms = league({
    teams: 30, totalPerTeam: 23, scheduledMatches: 15, lastScheduledInDays: 4, skewFirstTeamBy: 4,
  });
  const r = checkScheduleIntegrity(ms, 0.999, NOW);
  assert.equal(r.trustworthy, false);
  assert.match(r.reason ?? "", /팀별 총 경기수/);
});

test("WNBA 실측 — 진짜 막바지(팀당 1.6경기·4일 뒤)의 99.9% 는 통과", () => {
  const ms = league({ teams: 15, totalPerTeam: 42, scheduledMatches: 12, lastScheduledInDays: 4 });
  assert.equal(checkScheduleIntegrity(ms, 0.999, NOW).trustworthy, true);
});

test("NPB 실측 — 잔여 22경기짜리 독주의 99.9% 는 통과", () => {
  const ms = league({ teams: 12, totalPerTeam: 138, scheduledMatches: 136, lastScheduledInDays: 33 });
  assert.equal(checkScheduleIntegrity(ms, 0.999, NOW).trustworthy, true);
});

test("LCK 실측 — 다 치른 뒤의 팀별 편차(41~48)는 결손이 아니라 포맷이라 통과", () => {
  // 잔여가 팀당 0.2 라 검사 1(산포)의 하한 미만 → 적용되지 않아야 한다.
  const ms = league({
    teams: 10, totalPerTeam: 48, scheduledMatches: 1, lastScheduledInDays: 0, skewFirstTeamBy: 7,
  });
  const r = checkScheduleIntegrity(ms, 0.999, NOW);
  assert.ok(r.spreadRatio > 0.1, "산포 자체는 임계를 넘어야 이 테스트가 의미가 있다");
  assert.equal(r.trustworthy, true);
});

test("잔여 0 이면 차단 — 시즌 종료든 일정 미등록이든 시뮬을 보여주지 않는다", () => {
  const ms = league({ teams: 12, totalPerTeam: 26, scheduledMatches: 0, lastScheduledInDays: 0 });
  const r = checkScheduleIntegrity(ms, 0.999, NOW);
  assert.equal(r.trustworthy, false);
  assert.match(r.reason ?? "", /남은 일정이 없습니다/);
});

test("컵 상대 같은 1경기짜리 오염 row 는 산포 계산에서 빠진다", () => {
  // CHAMPIONSHIP·KBO·MLB 실측: 매치에 1경기만 등장하는 team row 가 섞여 있었다.
  const ms = league({ teams: 24, totalPerTeam: 46, scheduledMatches: 528, lastScheduledInDays: 247 });
  ms.push({ status: "FINISHED", startTime: new Date(NOW.getTime() - 86_400_000), homeTeamId: 9999, awayTeamId: 0 });
  const r = checkScheduleIntegrity(ms, 0.999, NOW);
  assert.equal(r.teamCount, 24, "1경기짜리 오염 row 가 유효팀에 포함되면 안 된다");
  assert.equal(r.trustworthy, true);
});

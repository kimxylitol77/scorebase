// KBO·NPB 포스트시즌 사다리 테스트 — 2025 KBO 실제 결과 재현, 어드밴티지·상위 진출 규칙, 확정 판정, npb.jp 일정 파싱
import test from "node:test";
import assert from "node:assert/strict";
import { buildLadder, postseasonGames, seriesWinProb, type PsGameIn, type StandRow } from "./ladder-postseason";
import { isNpbPostseasonGame, parseNpbSchedule } from "./npb-schedule";

const LG = 3814, HH = 3819, SSG = 3822, SS = 3820, NC = 3813, KIA = 3821;
const row = (teamId: number, position: number, played = 144, wins = 80 - position, losses = 60 + position): StandRow =>
  ({ teamId, name: String(teamId), group: "", position, wins, draws: 0, losses, played });
const TABLE_2025 = [row(LG, 1), row(HH, 2), row(SSG, 3), row(SS, 4), row(NC, 5), row(KIA, 8)];
let n = 0;
const g = (day: string, homeId: number, hs: number, as: number, awayId: number): PsGameIn =>
  ({ id: String(++n), date: `2025-${day}T09:30:00.000Z`, homeId, awayId, homeScore: hs, awayScore: as, state: "FINAL", href: null });
const GAMES_2025 = [
  g("10-04", KIA, 9, 8, SS), // 정규시즌 마지막 날
  g("10-06", SS, 1, 4, NC), g("10-07", SS, 3, 0, NC),
  g("10-09", SSG, 2, 5, SS), g("10-11", SSG, 4, 3, SS), g("10-13", SS, 5, 3, SSG), g("10-14", SS, 5, 2, SSG),
  g("10-18", HH, 9, 8, SS), g("10-19", HH, 3, 7, SS), g("10-21", SS, 4, 5, HH), g("10-22", SS, 7, 4, HH), g("10-24", HH, 11, 2, SS),
  g("10-26", LG, 8, 2, HH), g("10-27", LG, 13, 5, HH), g("10-29", HH, 7, 3, LG), g("10-30", HH, 4, 7, LG), g("10-31", HH, 1, 4, LG),
];

test("KBO 2025 재현 — 와일드카드 1승1패는 4위 진출, 준PO 3-1, PO 한화 3-2, KS LG 4-1 우승", () => {
  const ps = postseasonGames(GAMES_2025, TABLE_2025, new Set([LG, HH, SSG, SS, NC]), 144);
  assert.equal(ps.length, 16);
  const m = buildLadder("KBO", 2025, TABLE_2025, ps, { eloOf: () => 1500 });
  const s = Object.fromEntries(m.series.map((x) => [x.key, x]));
  assert.equal(s.wc.winnerId, SS);
  assert.deepEqual([s.wc.winsTop, s.wc.winsBottom], [1, 1]);
  assert.deepEqual([s.spo.bottom.id, s.spo.winsBottom, s.spo.winsTop, s.spo.winnerId], [SS, 3, 1, SS]);
  assert.deepEqual([s.po.winsTop, s.po.winsBottom, s.po.winnerId], [3, 2, HH]);
  assert.deepEqual([s.ks.winsTop, s.ks.winsBottom], [4, 1]);
  assert.equal(m.champion?.id, LG);
  assert.equal(m.regularDone, true);
});

test("정규시즌 중에는 가을 경기 없음·시드는 예상, 확정은 남은 경기로 뒤집을 수 없을 때만", () => {
  const t = [row(LG, 1, 132, 90, 42), row(HH, 2, 132, 70, 62), row(SSG, 3, 132, 69, 63), row(SS, 4, 132, 68, 64), row(NC, 5, 132, 67, 65), row(KIA, 6, 132, 66, 66)];
  assert.equal(postseasonGames(GAMES_2025, t, new Set(), 144).length, 0);
  const m = buildLadder("KBO", 2026, t, [], { eloOf: () => 1500 });
  assert.equal(m.series[0].top.projected, true);
  assert.equal(m.seeds[""][0].clinched, true); // 90승 — 6위가 전승해도 못 따라옴
  assert.equal(m.seeds[""][4].clinched, false);
  assert.equal(m.chase[""][0].gamesBack, 1);
  assert.equal(m.series[1].bottom.placeholder, true);
});

test("시리즈 확률 — 어드밴티지·상위 진출 규칙", () => {
  // 동률 팀: 1승 안고 2선승(최대 2경기, 못 가리면 상위) → 하위는 2연승해야 함 = 25%
  assert.ok(Math.abs(seriesWinProb(0.5, 0.5, "TT", 2, 1, 2, true, 0, 0, 0) - 0.75) < 1e-9);
  // 7전 4선승 동률 = 50%
  assert.ok(Math.abs(seriesWinProb(0.5, 0.5, "TTBBBTT", 4, 0, 7, false, 0, 0, 0) - 0.5) < 1e-9);
  // 3승 0패면 확률 높음
  assert.ok(seriesWinProb(0.5, 0.5, "TTBBBTT", 4, 0, 7, false, 3, 0, 3) > 0.9);
});

test("npb.jp 일정 파싱·가을 경기 판정", () => {
  const html = `
    <tr id="date1011" class=""><th>10/11</th><td><div class="team1">DeNA</div><a href="/scores/2025/1011/db-g-01/"><div class="score1">6</div><div class="state">-</div><div class="score2">2</div></a><div class="team2">巨人</div></td><td><div class="place">横浜</div><div class="time">14:00</div></td></tr>
    <tr id="date0928" class=""><th>9/28</th><td><div class="team1">阪神</div><a href="/scores/2025/0928/t-c-25/"><div class="score1">3</div><div class="score2">1</div></a><div class="team2">広島</div></td></tr>
    <tr id="date1102" class=""><td><div class="team1">DeNA</div><a href="/scores/2024/1102/db-h-06/"><div class="cancel">中止</div></a><div class="team2">ソフトバンク</div></td></tr>
    <tr id="date1025" class=""><td><div class="team1">ソフトバンク</div><div class="score1">&nbsp;</div><div class="score2">&nbsp;</div><div class="team2">阪神</div></td><td><div class="time">18:30</div></td></tr>`;
  const gs = parseNpbSchedule(html);
  assert.equal(gs.length, 4);
  assert.deepEqual([gs[0].homeJp, gs[0].homeScore, gs[0].awayScore, gs[0].meet, gs[0].time], ["DeNA", 6, 2, 1, "14:00"]);
  assert.equal(isNpbPostseasonGame(gs[0], false), true);
  assert.equal(isNpbPostseasonGame(gs[1], true), false); // 맞대결 25번째 = 정규시즌
  assert.equal(isNpbPostseasonGame(gs[2], true), false); // 중지
  assert.equal(gs[3].path, null);
  assert.equal(isNpbPostseasonGame(gs[3], false), false); // 미개최 — 정규시즌 중엔 정규 경기
  assert.equal(isNpbPostseasonGame(gs[3], true), true);
});

test("NPB — 파이널 1위 1승 안고 3승이면 진출, 일본시리즈 1차전 개최 = 홀수 해 퍼시픽", () => {
  const t: StandRow[] = [
    { teamId: 1, name: "한신", group: "센트럴", position: 1, wins: 85, draws: 0, losses: 58, played: 143 },
    { teamId: 2, name: "DeNA", group: "센트럴", position: 2, wins: 71, draws: 0, losses: 72, played: 143 },
    { teamId: 3, name: "요미우리", group: "센트럴", position: 3, wins: 70, draws: 0, losses: 73, played: 143 },
    { teamId: 4, name: "소프트뱅크", group: "퍼시픽", position: 1, wins: 87, draws: 0, losses: 56, played: 143 },
    { teamId: 5, name: "닛폰햄", group: "퍼시픽", position: 2, wins: 83, draws: 0, losses: 60, played: 143 },
    { teamId: 6, name: "오릭스", group: "퍼시픽", position: 3, wins: 74, draws: 0, losses: 69, played: 143 },
  ];
  const d = (day: string, h: number, hs: number, as: number, a: number): PsGameIn => ({ id: day + h, date: `2025-${day}T05:00:00.000Z`, homeId: h, awayId: a, homeScore: hs, awayScore: as, state: "FINAL", href: null });
  const games = [d("10-11", 2, 6, 2, 3), d("10-12", 2, 7, 6, 3), d("10-15", 1, 2, 0, 2), d("10-16", 1, 4, 0, 2), d("10-17", 1, 5, 2, 2)];
  const m = buildLadder("NPB", 2025, t, games, { eloOf: () => 1500 });
  const s = Object.fromEntries(m.series.map((x) => [x.key, x]));
  assert.equal(s["fs-c"].winnerId, 2);
  assert.deepEqual([s["final-c"].winsTop, s["final-c"].winnerId], [3, 1]);
  assert.equal(s.js.top.id, null); // 퍼시픽 미정 → 자리표시자가 위(홀수 해 퍼시픽 개최)
  assert.equal(s.js.bottom.id, 1);
});

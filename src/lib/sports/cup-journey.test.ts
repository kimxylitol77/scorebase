// 녹아웃 컵 대회 여정 — 라운드 이름 세 자리·한글 표기·단계 순서·디펜딩 챔피언 판정.
import test from "node:test";
import assert from "node:assert/strict";
import { buildStages, championFact, currentSeasonMatches, currentStage, finalWinner, isStaleSeason, previousSeason, seasonLabel, stageKo, stageLabelFromRaw } from "./cup-journey";

test("라운드 이름 — af·ts 워커·ts 수집기 세 자리", () => {
  assert.equal(stageLabelFromRaw('{"league":{"round":"Round of 16"}}'), "Round of 16");
  assert.equal(stageLabelFromRaw('{"thesports":{"round":{"stageName":"Round 1"}}}'), "Round 1");
  assert.equal(stageLabelFromRaw('{"id":"x","round":{"stage_id":"s","round_num":0,"stageName":"Second Round Qualifying"}}'), "Second Round Qualifying");
  assert.equal(stageLabelFromRaw('{"round":{"stage_id":"s","round_num":0}}'), null);
  assert.equal(stageLabelFromRaw("깨진 json"), null);
});

test("FA컵 예선 이름은 소스 이름 그대로 옮긴다", () => {
  assert.equal(stageKo("Extra Preliminary Round"), "추가 예비라운드");
  assert.equal(stageKo("Second Preliminary Round"), "2차 예비라운드");
  assert.equal(stageKo("First Round Qualifying"), "예선 1라운드");
  assert.equal(stageKo("Third Round Proper"), "본선 3라운드");
  assert.equal(stageKo("Quarter-finals"), "8강");
  // ts 는 16강을 "1/8 finals" 라고 부른다 — "final" 이 들어갔다고 결승이 아니다
  assert.equal(stageKo("1/8 finals"), "16강");
  assert.equal(stageKo("1/4-finals"), "8강");
  assert.equal(stageKo("1/128-finals"), "예비라운드"); // af 컵 첫 라운드 — 256강이 아니다
  assert.equal(stageKo("Final"), "결승");
  assert.equal(stageKo("Group Stage"), "조별리그");
});

const at = (d: string) => new Date(`${d}T15:00:00Z`);

test("라운드는 첫 경기 날짜 순, 지금 단계는 치른 가장 늦은 라운드", () => {
  const stages = buildStages([
    { stage: "First Round Qualifying", status: "FINISHED", startTime: at("2026-09-05") },
    { stage: "Extra Preliminary Round", status: "FINISHED", startTime: at("2026-08-09") },
    { stage: "Second Round Qualifying", status: "FINISHED", startTime: at("2026-09-19") },
    { stage: "Third Round Qualifying", status: "SCHEDULED", startTime: at("2026-10-03") },
  ]);
  assert.deepEqual(stages.map((s) => s.ko), ["추가 예비라운드", "예선 1라운드", "예선 2라운드", "예선 3라운드"]);
  assert.equal(currentStage(stages)?.ko, "예선 2라운드");
});

test("시즌 라벨 — 가을 개막 컵과 달력 시즌 컵", () => {
  assert.equal(seasonLabel(at("2026-08-09"), false), "2026-27");
  assert.equal(seasonLabel(at("2027-01-10"), false), "2026-27");
  assert.equal(seasonLabel(at("2026-05-26"), false), "2026-27"); // 스웨덴컵 새 대회 1라운드
  assert.equal(seasonLabel(at("2026-03-01"), true), "2026");
  assert.equal(previousSeason("2026-27"), "2025-26");
  assert.equal(previousSeason("2026"), "2025");
});

test("직전 시즌 기록만 디펜딩 챔피언 — 오래된 기록은 연도를 붙인다", () => {
  assert.equal(championFact({ season: "2025-26", ko: "맨체스터 시티" }, "2026-27")?.label, "디펜딩 챔피언");
  const old = championFact({ season: "2020", ko: "파우메이라스" }, "2026");
  assert.equal(old?.label, "기록상 최근 우승");
  assert.equal(old?.sub, "2020 우승");
  assert.equal(championFact(null, "2026"), null);
  // 끝난 시즌을 보고 있으면 "우승"
  assert.equal(championFact({ season: "2025-26", ko: "레알 소시에다드" }, "2025-26")?.label, "우승");
});

test("수집이 끊긴 시즌 — 60일 넘게 새 경기·예정 경기가 없으면 진행 중이 아니다", () => {
  const stages = buildStages([{ stage: "Round of 64", status: "FINISHED", startTime: at("2025-08-16") }]);
  assert.equal(isStaleSeason(stages, false, at("2026-09-24")), true);
  assert.equal(isStaleSeason(stages, false, at("2025-09-10")), false);
  assert.equal(isStaleSeason(stages, true, at("2026-09-24")), false); // 결승 끝난 시즌은 끊긴 게 아니다
  const withNext = buildStages([
    { stage: "Round 3", status: "FINISHED", startTime: at("2026-06-01") },
    { stage: "Round 4", status: "SCHEDULED", startTime: at("2026-10-28") },
  ]);
  assert.equal(isStaleSeason(withNext, false, at("2026-09-24")), false);
});

test("단판 결승 결과로 우승팀 — 점수, 동점이면 승부차기", () => {
  const f = (h: number, a: number, pk: { home: number; away: number } | null = null) =>
    ({ status: "FINISHED", homeScore: h, awayScore: a, home: "A", away: "B", pk });
  assert.equal(finalWinner([f(2, 1)]), "A");
  assert.equal(finalWinner([f(1, 1, { home: 3, away: 4 })]), "B");
  assert.equal(finalWinner([f(1, 1)]), null); // 승부차기 정보 없으면 판정 보류
  assert.equal(finalWinner([f(1, 0), f(0, 2)]), null); // 홈앤어웨이 결승은 판정하지 않는다
});

test("이번 시즌 — 직전 결승 다음 경기부터 (스위스컵 2025-26 결승 + 2026-27 1라운드)", () => {
  const ms = [
    { stage: "Quarter-finals", startTime: at("2026-02-10") },
    { stage: "Semi-finals", startTime: at("2026-04-20") },
    { stage: "Final", startTime: at("2026-05-24") },
    { stage: "Round of 64", startTime: at("2026-08-15") },
    { stage: "Round of 64", startTime: at("2026-08-16") },
  ];
  assert.deepEqual(currentSeasonMatches(ms).map((m) => m.stage), ["Round of 64", "Round of 64"]);
});

test("이번 시즌 — 방금 결승이 끝났으면 그 시즌 전체, 앞 시즌 결승 이후부터", () => {
  const ms = [
    { stage: "Final", startTime: at("2025-06-01") },
    { stage: "Round of 16", startTime: at("2026-02-10") },
    { stage: "Semi-finals", startTime: at("2026-04-20") },
    { stage: "Final", startTime: at("2026-05-31") },
  ];
  assert.deepEqual(currentSeasonMatches(ms).map((m) => m.stage), ["Round of 16", "Semi-finals", "Final"]);
});

test("홈앤어웨이 결승 두 경기는 한 시즌", () => {
  const ms = [
    { stage: "Semi-finals", startTime: at("2026-09-01") },
    { stage: "Final", startTime: at("2026-11-01") },
    { stage: "Final", startTime: at("2026-11-08") },
  ];
  assert.equal(currentSeasonMatches(ms).length, 3);
});

test("결승이 수집되지 않은 시즌 — 90일 넘는 공백이 시즌 경계 (스위스컵 실측)", () => {
  const ms = [
    { stage: "Round of 16", startTime: at("2025-12-03") },
    { stage: "Quarter-finals", startTime: at("2026-02-03") }, // 겨울 휴식 62일은 경계가 아니다
    { stage: "Semi-finals", startTime: at("2026-04-19") },
    { stage: "Round of 64", startTime: at("2026-08-14") },   // 117일 공백 → 새 시즌
    { stage: "Round of 64", startTime: at("2026-08-16") },
  ];
  assert.deepEqual(currentSeasonMatches(ms).map((m) => m.stage), ["Round of 64", "Round of 64"]);
  // 새 시즌 전이면 겨울 휴식을 건너 한 시즌 그대로
  assert.equal(currentSeasonMatches(ms.slice(0, 3)).length, 3);
});

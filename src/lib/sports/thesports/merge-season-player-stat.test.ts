// ts 시즌 선수통계 (선수×팀) 행 병합 테스트 — 이적생 기록 분할·중복 등재·옛 팀 표시 방지.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSeasonPlayerStatRows, type TsSeasonPlayerStatRow } from "./merge-season-player-stat";

function row(pid: string, team: string, over: Partial<TsSeasonPlayerStatRow>): TsSeasonPlayerStatRow {
  return {
    player: { id: pid, name: pid, position: "F" },
    team: { id: team, name: team },
    matches: 0, court: 0, first: 0, goals: 0, penalty: 0, assists: 0, minutes_played: 0,
    red_cards: 0, yellow_cards: 0, shots: 0, shots_on_target: 0, rating: 0, updated_at: 0,
    ...over,
  };
}

test("이적생의 팀별 행은 한 선수로 합산되고 팀은 가장 최근 행을 따른다", () => {
  // 2026-09-25 ARGENTINA_PL 실측 형태 — Módica: 로사리오 2경기(1월) → 멘도사 22경기(9월)
  const merged = mergeSeasonPlayerStatRows([
    row("modica", "Rosario Central", { matches: 2, court: 2, goals: 1, rating: 1300, updated_at: 1769558400 }),
    row("other", "Boca", { matches: 20, court: 20, goals: 5, updated_at: 1790000000 }),
    row("modica", "Gimnasia Mendoza", { matches: 22, court: 22, goals: 8, key_passes: 10, rating: 15400, updated_at: 1790035200 }),
  ]);
  assert.equal(merged.length, 2);
  const m = merged.find((r) => r.player.id === "modica")!;
  assert.equal(m.team.name, "Gimnasia Mendoza");
  assert.equal(m.goals, 9);
  assert.equal(m.matches, 24);
  assert.equal(m.key_passes, 10); // 한쪽에만 있는 선택 필드도 유지
  assert.equal(m.rating / m.court, (1300 + 15400) / 24); // 평점 평균은 합산 기준으로 재계산된다
  assert.equal(m.updated_at, 1790035200);
});

test("같은 선수가 한 번만 남아 리더보드 중복 등재가 없다", () => {
  const merged = mergeSeasonPlayerStatRows([
    row("p1", "Tukums", { goals: 6, updated_at: 1 }),
    row("p1", "Liepaja", { goals: 5, updated_at: 2 }),
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].goals, 11);
  assert.equal(merged[0].team.name, "Liepaja");
});

test("한 팀뿐인 선수·id 없는 행은 손대지 않는다", () => {
  const solo = row("p1", "PSG", { goals: 3, updated_at: 5 });
  const noId = { ...row("", "X", { goals: 1 }), player: { id: "", name: "?", position: "" } };
  const merged = mergeSeasonPlayerStatRows([solo, noId]);
  assert.equal(merged.length, 2);
  assert.ok(merged.includes(solo));
  assert.ok(merged.includes(noId));
});

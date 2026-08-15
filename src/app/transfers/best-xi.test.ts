// Best XI 는 팀의 실제 포메이션대로 그려져야 한다 — 4-3-3 고정이던 시절 4-2-3-1 팀
// (전체 288팀 중 128팀)의 공미 자리가 사라져 브루노 페르난데스 같은 AM 이 통째로
// 탈락했다(2026-08-15 맨유 제보). 여기서 회귀를 잡는다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { slotsForFormation, pickBestXI, usedFormation, DEFAULT_FORMATION, type XIPlayer } from "./best-xi";

const p = (name: string, value: number, posCode: string): XIPlayer => ({
  id: name, name, value, posCode, photo: null,
});

// 2026-08-15 실측 맨유 스쿼드 (가치 desc — 상위 17명.
// 백3 는 CB 3명, 3-4-2-1 은 AM 2명이 필요해 그 자리까지 포함)
const MAN_UTD: XIPlayer[] = [
  p("쿠냐", 75, "W"), p("음뵈모", 75, "W"), p("셰슈코", 75, "ST"),
  p("메이누", 70, "DM"), p("요로", 50, "FB"), p("디알로", 45, "W"),
  p("마르티네스", 45, "CB"), p("산투스", 40, "DM"), p("틸레만스", 40, "DM"),
  p("래시퍼드", 40, "W"), p("브루노", 35, "AM"), p("라멘스", 35, "GK"),
  p("도르구", 35, "FB"), p("달로", 30, "FB"), p("헤븐", 30, "CB"),
  p("더리흐트", 30, "CB"), p("마운트", 25, "AM"),
];

// 라인업 캐시 실측 표기 27종 (2026-08-15, 최근 5,000 매치). 전부 슬롯이 나와야 한다.
const REAL_FORMATIONS = [
  "4-2-3-1", "4-4-2", "4-3-3", "3-4-3", "4-1-4-1", "3-4-2-1", "3-5-2", "5-4-1",
  "5-3-2", "3-4-1-2", "4-1-3-2", "3-1-4-2", "4-5-1", "4-1-2-3", "4-4-1-1",
  "4-3-1-2", "4-3-2-1", "5-2-3", "4-1-2-1-2", "4-2-1-3", "3-5-1-1", "4-2-2-2",
  "3-3-3-1", "4-2-4", "5-3-1-1", "3-1-3-1-2", "3-3-1-3",
];

test("모든 포메이션이 GK 포함 11 슬롯을 만든다", () => {
  for (const f of REAL_FORMATIONS) {
    const slots = slotsForFormation(f);
    assert.equal(slots.length, 11, `${f} 슬롯 수`);
    assert.equal(slots.filter((s) => s.accept.includes("GK")).length, 1, `${f} GK 슬롯`);
    assert.equal(new Set(slots.map((s) => s.key)).size, 11, `${f} key 중복`);
    for (const s of slots) {
      assert.ok(s.x >= 0 && s.x <= 100, `${f} ${s.label} x=${s.x}`);
      assert.ok(s.y >= 0 && s.y <= 100, `${f} ${s.label} y=${s.y}`);
      assert.ok(s.accept.length > 0, `${f} ${s.label} accept 비어있음`);
    }
  }
});

test("깨진 포메이션 문자열은 기본값으로 폴백한다", () => {
  for (const bad of [null, undefined, "", "4-4-4", "4-3", "abc", "4-3-3-3-3-3", "0-10-0"]) {
    assert.deepEqual(slotsForFormation(bad), slotsForFormation(DEFAULT_FORMATION), `${bad}`);
    assert.equal(usedFormation(bad), DEFAULT_FORMATION, `${bad} 캡션`);
  }
  assert.equal(usedFormation("4-2-3-1"), "4-2-3-1");
});

test("4-2-3-1 은 공미 슬롯이 있고 브루노(AM)가 거기 들어간다", () => {
  const slots = pickBestXI(MAN_UTD, "4-2-3-1");
  const am = slots.find((s) => s.label === "AM");
  assert.ok(am, "AM 슬롯이 없다");
  assert.equal(am.player?.name, "브루노");
  // 나머지도 상식적인 자리인지 — 윙어 2명·최전방·홀딩 2명
  assert.deepEqual(
    slots.filter((s) => s.player).map((s) => `${s.label}:${s.player!.name}`).sort(),
    ["CB:마르티네스", "CB:헤븐", "GK:라멘스", "AM:브루노", "DM:메이누", "DM:산투스",
      "LB:요로", "LW:쿠냐", "RB:도르구", "RW:음뵈모", "ST:셰슈코"].sort(),
  );
});

test("4-3-3 은 공미 슬롯이 없어 브루노가 밀린다 — 포메이션이 결과를 가른다", () => {
  const names = pickBestXI(MAN_UTD, "4-3-3").map((s) => s.player?.name);
  assert.ok(!names.includes("브루노"));
  assert.ok(names.includes("틸레만스")); // 4-3-3 중원 3칸은 DM 이 가져간다
});

test("11 슬롯이 모두 차고 같은 선수가 두 번 들어가지 않는다", () => {
  for (const f of ["4-2-3-1", "4-3-3", "4-4-2", "3-5-2", "3-4-2-1"]) {
    const filled = pickBestXI(MAN_UTD, f).filter((s) => s.player);
    assert.equal(filled.length, 11, `${f} 미충원`);
    assert.equal(new Set(filled.map((s) => s.player!.id)).size, 11, `${f} 중복 배치`);
  }
});

test("포지션 데이터가 없는 선수는 배치하지 않는다", () => {
  const slots = pickBestXI([{ id: "x", name: "무포지션", value: 999, posCode: null, photo: null }], "4-2-3-1");
  assert.equal(slots.filter((s) => s.player).length, 0);
});

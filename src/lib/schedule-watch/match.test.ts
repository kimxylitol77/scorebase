import assert from "node:assert/strict";
import test from "node:test";
import { findDbMatch, sameTeamName, sameTeamNameStrict, type AfFixtureLite, type DbRowLite } from "./match";

const T = "2026-09-13T19:00:00+00:00";
const row = (o: Partial<DbRowLite>): DbRowLite => ({
  id: 1, externalId: "ts-x", startTime: new Date(T), homeTeamId: 10, awayTeamId: 20,
  homeName: "Home", awayName: "Away", homeExt: "ts-h", awayExt: "ts-a", ...o,
});
const fx = (o: Partial<AfFixtureLite> = {}): AfFixtureLite => ({
  id: 1520871, date: T, home: { id: 144, name: "Atletico Goianiense" }, away: { id: 140, name: "Criciuma" }, ...o,
});
const NO_MAP = new Map<string, Set<number>>();

test("팀명 표기 차이는 같은 팀 — 9/24 감사 오판 사례", () => {
  assert.equal(sameTeamName("Atletico Goianiense", "Atletico Clube Goianiense"), true);
  assert.equal(sameTeamName("Cardiff MET", "UWIC Inter Cardiff"), true);
  assert.equal(sameTeamName("Lahden Reipas", "Reipas"), true);
});

test("이름 비교는 느슨하다 — 오탐은 '양팀 모두 일치' 규칙이 막는다(9/24 MLS 실측)", () => {
  // 도시명만 겹쳐도 같다고 본다. 그래서 한 팀 이름 일치만으로는 같은 경기로 보지 않는다.
  assert.equal(sameTeamName("Los Angeles FC", "Los Angeles Galaxy"), true);
  assert.equal(sameTeamName("Manchester United", "Chelsea"), false);
  const lafc = fx({ id: 1490461, home: { id: 1616, name: "Los Angeles FC" }, away: { id: 1602, name: "New York Red Bulls" } });
  const galaxy = row({ homeName: "Vancouver Whitecaps", awayName: "Los Angeles Galaxy" });
  assert.equal(findDbMatch(lafc, [galaxy], NO_MAP), null);
});

test("externalId 가 af fixture id 면 바로 같은 경기", () => {
  const r = row({ externalId: "1520871", homeName: "전혀 다른", awayName: "이름" });
  assert.equal(findDbMatch(fx(), [r], NO_MAP), r);
});

test("양팀 이름 일치면 같은 경기 — 방향이 뒤집혀도, 72시간 재편성 안이면", () => {
  const r = row({ homeName: "Criciuma", awayName: "Atletico Clube Goianiense", startTime: new Date(Date.parse(T) + 50 * 3600_000) });
  assert.equal(findDbMatch(fx(), [r], NO_MAP), r);
});

test("3시간 안에 한 팀이 af 팀 id 로 확정되면 같은 경기", () => {
  const map = new Map([["144", new Set([10])]]);
  const r = row({ homeName: "완전히 다른 표기", awayName: "Unknown" });
  assert.equal(findDbMatch(fx(), [r], map), r);
});

test("한 팀만 이름으로 비슷하고 다른 경기면 빠진 경기로 판정", () => {
  const r = row({ homeName: "Atletico Clube Goianiense", awayName: "Vila Nova", startTime: new Date(Date.parse(T) + 5 * 3600_000) });
  assert.equal(findDbMatch(fx(), [r], NO_MAP), null);
  assert.equal(findDbMatch(fx(), [], NO_MAP), null);
});

test("킥오프가 같고 한 팀 이름이 엄격히 같으면 같은 경기 — MLS FC Dallas v LAFC(af 'Los Angeles FC') 9/25 실측", () => {
  const f = fx({ id: 1490501, date: "2026-09-27T00:30:00+00:00", home: { id: 1597, name: "FC Dallas" }, away: { id: 1616, name: "Los Angeles FC" } });
  const r = row({ homeName: "FC Dallas", awayName: "LAFC", startTime: new Date("2026-09-27T00:30:00Z") });
  assert.equal(findDbMatch(f, [r], NO_MAP), r);
  // 같은 시각 다른 경기 — 도시명만 겹치는 느슨한 일치로는 붙이지 않는다
  const galaxy = row({ homeName: "Los Angeles Galaxy", awayName: "Colorado Rapids", startTime: new Date("2026-09-27T00:30:00Z") });
  assert.equal(findDbMatch(f, [galaxy], NO_MAP), null);
  assert.equal(sameTeamNameStrict("Barry Town", "Barry Town United"), true);
  assert.equal(sameTeamNameStrict("Los Angeles FC", "Los Angeles Galaxy"), false);
  assert.equal(sameTeamNameStrict("Alianza FC (PAN)", "Alianza FC"), true); // 파나마 9/25 dry-run 헛누락
});

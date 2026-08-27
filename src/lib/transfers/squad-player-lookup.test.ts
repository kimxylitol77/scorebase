// 이적 목록 → 스쿼드 ts id 폴백 고정. 케이스는 2026-08-27 PSG 실측 명단.
import { test } from "node:test";
import assert from "node:assert/strict";
import { squadTsIdByName } from "./squad-player-lookup";

const PSG = [
  { id: "dn1m1gh3lzj4moe", name: "Mika Godts" },
  { id: "4jwq2gh1x09m0ve", name: "Ferrán Torres" },
  { id: "pxwrxlh1g17ryk0", name: "Lucas Digne" },
  { id: "l965mkyh92xr1ge", name: "Lucas Beraldo" },
  { id: "y0or5jhkvzqwzv0", name: "Lucas Hernández" },
];

test("af 축약 이름을 성으로 맞춘다 — 낡은 매핑이 404 로 보내던 자리", () => {
  // ts-af-player-map 은 af 340153 을 죽은 id(l7oqdehl0yv9r51)로 보냈다.
  assert.equal(squadTsIdByName(PSG, "M. Godts"), "dn1m1gh3lzj4moe");
  assert.equal(squadTsIdByName(PSG, "L. Digne"), "pxwrxlh1g17ryk0");
});

test("표기 차이(분음부호·대소문자)는 흡수한다", () => {
  assert.equal(squadTsIdByName(PSG, "Ferran Torres"), "4jwq2gh1x09m0ve");
  assert.equal(squadTsIdByName(PSG, "FERRAN TORRES"), "4jwq2gh1x09m0ve");
});

test("성이 겹치면 링크하지 않는다 — 잘못된 선수로 보내느니 링크 없음이 낫다", () => {
  // 같은 명단의 Lucas 셋은 이름이 아니라 성으로 갈린다. 성이 겹치는 경우를 만든다.
  const dup = [...PSG, { id: "zzz", name: "Bryan Torres" }];
  assert.equal(squadTsIdByName(dup, "Ferran Torres"), null);
});

test("명단에 없으면 null — 방출 선수·유소년", () => {
  assert.equal(squadTsIdByName(PSG, "H. Diandaga"), null);
  assert.equal(squadTsIdByName(PSG, "R. Kolo Muani"), null);
});

test("너무 짧은 성은 쓰지 않는다 — 오매칭 위험", () => {
  const s = [{ id: "a", name: "Hong Gil" }];
  assert.equal(squadTsIdByName(s, "H. Gil"), null);
});

test("명단이 없거나 비면 null", () => {
  assert.equal(squadTsIdByName(undefined, "M. Godts"), null);
  assert.equal(squadTsIdByName(null, "M. Godts"), null);
  assert.equal(squadTsIdByName([], "M. Godts"), null);
});

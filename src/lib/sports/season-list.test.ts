// 워커에 내려주는 시즌 목록 조립 + 내부 API 인증 + 워커 폴백 선택.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mergeSeasonList } from "./season-list";
import { bearerOk } from "../internal-auth";

const require_ = createRequire(import.meta.url);
const { pickSeasonList } = require_("../../../lightsail-worker/standings-poller.js") as {
  pickSeasonList: (i: {
    apiSeasons?: unknown;
    diskSeasons?: unknown;
    legacySeasons?: unknown;
  }) => { seasons: Array<{ league: string; tsSeasonId: string }>; source: string };
};

test("ACTIVE 레지스트리가 저장소 JSON 을 이긴다", () => {
  const list = mergeSeasonList(
    [{ league: "EPL", providerSeasonId: "new", providerLeagueId: "comp-epl", seasonLabel: "2026-27" }],
    [
      { code: "EPL", tsId: "comp-epl", tsSeasonId: "old" },
      { code: "LALIGA", tsId: "comp-laliga", tsSeasonId: "laliga-season" },
    ],
  );
  const epl = list.find((s) => s.league === "EPL")!;
  assert.equal(epl.tsSeasonId, "new");
  assert.equal(epl.source, "registry");
  // 레지스트리에 없는 리그는 저장소 값으로 이어간다 (이행 기간 호환)
  const laliga = list.find((s) => s.league === "LALIGA")!;
  assert.equal(laliga.source, "static");
});

test("시즌 uuid 가 없는 저장소 항목은 폴링 목록에 넣지 않는다", () => {
  const list = mergeSeasonList([], [{ code: "CZECH_2", tsId: "comp-czech2" }]);
  assert.equal(list.length, 0);
});

test("대상 필터에 걸린 리그는 목록에서 빠진다", () => {
  const list = mergeSeasonList(
    [{ league: "KBO", providerSeasonId: "kbo", providerLeagueId: "c", seasonLabel: "2026" }],
    [{ code: "EPL", tsId: "comp-epl", tsSeasonId: "epl" }],
    (lg) => lg !== "KBO",
  );
  assert.deepEqual(list.map((s) => s.league), ["EPL"]);
});

test("내부 API 인증 — 토큰 미설정이면 무조건 거부(fail-closed)", () => {
  assert.equal(bearerOk("Bearer abc", undefined), false);
  assert.equal(bearerOk("Bearer abc", ""), false);
  assert.equal(bearerOk(null, "abc"), false);
  assert.equal(bearerOk("Bearer wrong", "abc"), false);
  assert.equal(bearerOk("abc", "abc"), false);
  assert.equal(bearerOk("Bearer abc", "abc"), true);
});

test("워커: 서버 응답이 비면 마지막 정상 목록으로 계속 돈다", () => {
  const disk = [{ league: "EPL", tsSeasonId: "epl-season" }];
  const r = pickSeasonList({ apiSeasons: [], diskSeasons: disk, legacySeasons: [] });
  assert.equal(r.source, "disk-cache");
  assert.deepEqual(r.seasons, disk);
});

test("워커: API timeout(=undefined 응답)에도 디스크 캐시로 폴백한다", () => {
  const r = pickSeasonList({
    apiSeasons: undefined,
    diskSeasons: [{ league: "LALIGA", tsSeasonId: "s" }],
    legacySeasons: [],
  });
  assert.equal(r.source, "disk-cache");
});

test("워커: 디스크 캐시도 없으면 동봉 매핑 파일로 폴백한다", () => {
  const r = pickSeasonList({
    apiSeasons: [],
    diskSeasons: [],
    legacySeasons: [{ league: "SERIE_A", tsSeasonId: "s" }],
  });
  assert.equal(r.source, "legacy-file");
});

test("워커: 전부 실패하면 빈 목록 + source=none — 이때는 이번 회차를 건너뛴다", () => {
  const r = pickSeasonList({ apiSeasons: [], diskSeasons: [], legacySeasons: [] });
  assert.equal(r.source, "none");
  assert.equal(r.seasons.length, 0);
});

test("워커: 깨진 항목(league·seasonId 누락)은 걸러낸다", () => {
  const r = pickSeasonList({
    apiSeasons: [{ league: "EPL" }, { tsSeasonId: "x" }, { league: "UCL", tsSeasonId: "ok" }],
  });
  assert.equal(r.source, "api");
  assert.deepEqual(r.seasons, [{ league: "UCL", tsSeasonId: "ok" }]);
});

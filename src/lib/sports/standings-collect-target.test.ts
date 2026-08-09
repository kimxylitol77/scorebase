// af 보강 대상 선정 규칙 — TheSports 1순위 원칙과 J1/J2 예외를 함께 고정한다.
//
// 여기서 검증하는 규칙은 /api/cron/standings-collect 의 판정과 같아야 한다.
// (route 는 prisma 를 import 해 단위 테스트에서 못 불러오므로 규칙만 순수 함수로 재현한다.
//  route 쪽 조건을 바꾸면 이 파일도 같이 고쳐야 한다 — 그게 이 테스트의 목적이다.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPED_STANDINGS_LEAGUES } from "./thesports/standings-helper";

type Reason = "af-primary" | "ts-season-mismatch" | "ts-cache-none" | "ts-stale" | null;

const TS_STALE_MS = 24 * 3600 * 1000;

function afTargetReason(input: {
  league: string;
  hasCache: boolean;
  seasonUsable: boolean;
  cacheAgeMs: number;
  mappingRate: number;
}): Reason {
  if (GROUPED_STANDINGS_LEAGUES.has(input.league)) return "af-primary";
  if (!input.hasCache) return "ts-cache-none";
  if (!input.seasonUsable) return "ts-season-mismatch";
  if (input.cacheAgeMs > TS_STALE_MS) return "ts-stale";
  return null; // 매핑률은 의도적으로 보지 않는다
}

const healthy = {
  league: "EPL",
  hasCache: true,
  seasonUsable: true,
  cacheAgeMs: 0,
  mappingRate: 1,
};

test("ts 가 멀쩡하면 af 를 부르지 않는다 — TheSports 1순위", () => {
  assert.equal(afTargetReason(healthy), null);
});

test("팀 매핑률이 낮아도 af 로 메우지 않는다 — ts 팀매핑으로 푸는 문제다", () => {
  // 실측: CHAMPIONSHIP 4%, UEL 6%, LIGUE_2 0% — 전부 af 대상이 아니어야 한다
  for (const rate of [0, 0.04, 0.06, 0.5, 0.94]) {
    assert.equal(afTargetReason({ ...healthy, mappingRate: rate }), null, `rate=${rate}`);
  }
});

test("ts 에 지금 쓸 수 있는 표가 없을 때만 af 를 부른다", () => {
  assert.equal(afTargetReason({ ...healthy, hasCache: false }), "ts-cache-none");
  assert.equal(afTargetReason({ ...healthy, seasonUsable: false }), "ts-season-mismatch");
  assert.equal(
    afTargetReason({ ...healthy, cacheAgeMs: 72 * 24 * 3600 * 1000 }),
    "ts-stale",
  );
});

test("그룹 순위 리그는 af 가 주 소스라 ts 가 신선해도 항상 갱신한다", () => {
  // d55ef03 회귀 방지 — J1 af 캐시가 66일 동결돼 19경기가 누락된 사고.
  // 세트가 비어 있으면 검증 대상이 없을 뿐, 규칙 자체는 멤버가 생기는 즉시 다시 물린다.
  for (const lg of GROUPED_STANDINGS_LEAGUES) {
    assert.equal(
      afTargetReason({ ...healthy, league: lg }),
      "af-primary",
      `${lg} 는 ts 가 멀쩡해도 af 를 갱신해야 한다`,
    );
  }
  // 세트 밖 리그는 ts 가 멀쩡하면 af 를 부르지 않는다 — 예외 해제된 J1 포함
  for (const lg of ["EPL", "J1_LEAGUE"].filter((l) => !GROUPED_STANDINGS_LEAGUES.has(l))) {
    assert.equal(afTargetReason({ ...healthy, league: lg }), null, `${lg} 는 af 대상이 아니다`);
  }
});

test("그룹 순위 리그 목록이 바뀌면 이 규칙도 같이 봐야 한다", () => {
  // d957798 에서 비움 — J1/J2 의 2026 이행기 그룹제(East/West)가 끝나고 단일표로 복귀.
  // 이 assert 가 깨졌다면 누군가 세트를 다시 채운 것 — standings-collect 의 af-primary
  // 규칙과 getFullStandings 의 af 우선 분기가 새 리그에 맞는지 확인하고 기대값을 갱신하라.
  assert.deepEqual([...GROUPED_STANDINGS_LEAGUES].sort(), []);
});

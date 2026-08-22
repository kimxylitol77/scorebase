// 축구 매치에서 api-football 참조 id(fixture·양 팀)를 안전하게 얻는 단일 창구.
//
// ⚠ `Match.externalId` 도 `Team.externalId` 도 af id 라는 보장이 없다. EPL 은 둘 다
// football-data 대역이다 — 매치 560544(af 는 1557370), 입스위치 349(af 57), 선덜랜드 71(af 746).
// 그 번호를 af 에 그대로 넘기면 **남의 경기·남의 팀 데이터가 실려온다.** 2026-08-22 실측:
//   /fixtures/events?fixture=560544 → 2019 독일 U19 Magdeburg vs Niendorfer (라이브 중계에 90+3분·0:3)
//   /predictions?fixture=560544     → Magdeburg U19 45/45/10 (매치 상세 예측 확률)
//   /fixtures?id=560544             → "U19 Bundesliga / Nord - 17" (라운드 라벨)
//   /teams?id=349                   → Piast Gliwice(폴란드) · /teams?id=71 → Norwich (팀 시즌 통계)
// 진짜 af 값은 af 응답을 그대로 담아둔 `Match.raw` 안에 있다. 여기서만 꺼내 쓴다.

export interface AfMatchRef {
  fixtureId: number;
  homeId: number;
  awayId: number;
}

interface AfRawShape {
  fixture?: { id?: unknown };
  teams?: { home?: { id?: unknown }; away?: { id?: unknown } };
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/**
 * af 참조 id 3종을 같은 출처(raw)에서 함께 읽는다. 하나라도 없으면 null —
 * fixture 만 맞고 팀이 어긋나면 이벤트 진영 판정이 무너지므로 쪼개서 쓰지 않는다.
 *
 * **externalId 폴백은 두지 않는다.** 최근 7일 축구 주요 리그 3000건 실측 —
 * raw 에 af fixture 가 있는 게 2966건(그중 externalId 와 불일치 59건)이고,
 * 없는 34건은 **전부 EPL 560xxx**(football-data 대역)였다. 즉 폴백이 동작하는 경우와
 * 오염되는 경우가 정확히 겹친다. af 로 수집된 매치는 raw 에 fixture 가 있으므로
 * 없으면 af 를 부르지 않는 것이 맞다.
 */
export function afMatchRef(
  match: { raw?: unknown } | null | undefined,
): AfMatchRef | null {
  if (!match) return null;
  try {
    const rv = match.raw;
    const r = (typeof rv === "string" ? JSON.parse(rv) : rv) as AfRawShape | null;
    const fixtureId = num(r?.fixture?.id);
    const homeId = num(r?.teams?.home?.id);
    const awayId = num(r?.teams?.away?.id);
    if (fixtureId != null && homeId != null && awayId != null) {
      return { fixtureId, homeId, awayId };
    }
  } catch {
    /* raw 가 af 형식이 아니면(ts 매치의 raw 는 배열) af 매치가 아니다 */
  }
  return null;
}

/** fixture id 만 필요한 호출(predictions·odds·fixtures)용 축약. */
export function afFixtureId(
  match: { raw?: unknown } | null | undefined,
): number | null {
  return afMatchRef(match)?.fixtureId ?? null;
}

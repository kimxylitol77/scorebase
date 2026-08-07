# 컨텍스트 노트 — TheSportsPlayer 영문 name 복구 (2026-08-07)

## 왜 하나

`TheSportsPlayer.name` 은 스키마상 **영문 풀네임**(`prisma/schema.prisma:823`)이다. 그런데
`apply-thesports-official-korean.ts` 와 `apply-transfers-star-names.ts` 의 `createMany` 가
`{ name: t.ko, nameKo: t.ko }` 로 넣어, 두 스크립트가 만든 신규 행은 영문 원본이 애초에 없다.

실측 (2026-08-07). FOOTBALL 41,876행 중 **3,349행**이 `name` 에 한글. 생성일은
2026-06-05(1,286) · 06-06(2,055) 두 배치에 몰려 있고, 3,343행이 `PlayerMarketValue` 를
가진 = 이적시장 화면에 노출되는 선수다. (KBO 390행도 같은 모양이나 한국 선수라 영문이
무의미해 대상에서 제외.)

**피해는 표시가 아니라 검증이다.** 화면은 `nameKo` 를 쓰므로 멀쩡하다. 대신 영문을 키로 삼는
audit 이 이 3,349명을 통째로 못 훑는다 — ko위키 langlink 대조, `name ~ '(^| )(Hj|Kj|Sj|Gj)'`
같은 어원별 오음역 스캔, ts↔af 매칭. 이번 발단이 된 "레오 퓌르 힐데"(→ 레오 푸르 옐데)도
영문이 있었으면 위키 대조에 걸렸을 건이다.

## 복구 소스 (커버리지 실측)

| 소스 | 대상 커버 | 비고 |
|---|---|---|
| `TheSportsMatchCache.lineup` | 1,093 | 출전 이력 있는 선수만. 무료·즉시 |
| `data/team-squads.json` | 162 (합집합 1,157) | 154팀 로스터 |
| TheSports `player/with_stat/list` | 나머지 2,192 | uuid 단건만. 다중 uuid 는 `code 100003` 거부 |

집 IP 가 ts whitelist 라 API 직호출 가능함을 확인했다. 700ms 페이스 고정 —
버스트는 방화벽 10분 차단(메모리 `no-burst-from-worker-ip`).

## 결정

- **소스 우선순위: squad > lineup > API.** 로스터가 최신 풀네임이고, 라인업은 축약형이 섞인다.
- **`name` 이 required String 이라 null 로 비울 수 없다.** 그래서 "한글이면 덮어쓴다"가 유일한 복구
  방향이고, 반대로 이미 영문인 행은 절대 건드리지 않는다.
- **가드**: 되찾은 값에 한글이 섞였거나(`[가-힣]`) 빈 문자열이면 skip. 오염을 다른 모양으로
  바꾸는 것보다 그대로 두는 게 낫다.
- **`nameKo` 는 이 작업에서 손대지 않는다.** 표기 교정은 별개 계층(locks > curation > 위키 > OV > DB)
  이고 섞으면 되돌리기 어렵다. 메모리 `player-name-manual-fix` 참조.
- **재오염 방지는 두 갈래.** (a) 두 `apply-*` 스크립트가 createMany 전에 라인업·스쿼드에서 영문을
  먼저 찾게 한다 — 무료라 부작용 없음. (b) 그래도 못 찾은 신규는 계속 한글로 들어오므로,
  backfill 스크립트를 주기 실행 대상으로 남긴다.
- **부가 필드(logo·position·shirtNumber)는 API 응답에 있지만 채우지 않는다.** 각각 별도
  파이프라인이 있고, 이 작업 범위 밖이다.

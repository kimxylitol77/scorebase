# 베트맨(스포츠토토) 배당 수집 — 컨텍스트 노트

## 왜

국내 프로토 승부식 배당 + **국내 투표 분포**를 확보한다. 투표 분포(승/무/패 구매 건수)는
The Odds API 에 없는 데이터라 "국내 배터 여론 vs 우리 AI 예측" 비교 콘텐츠의 재료가 된다.
노출 위치는 아직 미정 — 이번 단계는 **적재 파이프라인만** 세우고 매일 잘 들어오는지 본다.

## 소스 실측 (2026-08-14)

로그인·세션·API 키 없이 공개 JSON POST 로 나온다.

```
POST https://www.betman.co.kr/buyPsblGame/lotterySchedulesInq.do
  body {"gmId":"G101"}                    → lotterySchedulesList (회차 목록)
POST https://www.betman.co.kr/buyPsblGame/gameInfoInq.do
  body {"gmId":"G101","gmTs":260096}      → 회차 전체 경기 + 배당 + 투표분포
```

- `Content-Type: application/json; charset=UTF-8` 필수. `_sbmInfo:{debugMode:"false"}` 는
  사이트 JS 가 항상 붙이는 필드라 같이 보낸다(없어도 응답은 왔지만 원본 동작을 따른다).
- **G101 = 프로토 승부식.** G104·G001 등 다른 gmId 는 빈 응답.
- 응답 **370KB / 15초**. 가볍지 않다.

### 응답 구조

- `compSchedules` = `{ keys: [...52개], datas: [[...], ...] }` — **컬럼형**. keys 로 인덱스를 만들어 읽는다.
- `voteStatus` = `[{ GM_SEQ, W_BET_CNT, D_BET_CNT, L_BET_CNT }]` — `matchSeq ↔ GM_SEQ` 로 결합.
  실측 850행 중 502행 결합(승무패·일부 종목만 투표 집계가 있다).
- `tooltipList` = 배당 변동 이력(BCHG_*/ACHG_* = 변경 전/후). 이번 단계에서는 안 쓴다.

### 한 행의 의미 (실측)

| 필드 | 값 예 | 뜻 |
|---|---|---|
| `betId`/`betNm` | 2 / "야구 승패" | 베팅 종목 |
| `betTypId`/`betTypNm` | 5 / "일반 소수핸디캡" | 유형 |
| `handi` | 0·21·23·27 | 핸디 구분 코드 (0 = 승무패) |
| `winHandi`/`loseHandi` | +2.5 / -2.5 | 실제 핸디 라인 |
| `drawAllot` | 0.0 | 승패형은 무 배당이 0 (null 아님) |
| `gameDate` | 1786698000000 | epoch **ms** |
| `itemCode` | BS / SC | 종목 |
| `leagueCode` | BS004 | 베트맨 리그 코드 |

**한 경기가 여러 행으로 온다.** 같은 `homeName/awayName/gameDate` 에 승패·승1패·핸디캡이
각각 다른 `matchSeq` 로 잡힌다. 그래서 자연키는 경기가 아니라 `{gmTs}-{matchSeq}` 다.

**팀명이 이미 한글**이라 우리 `Team.nameKo` 와 매칭이 유리하다. 다만 이번 단계에서는
Match 연결을 하지 않는다 — 먼저 원본을 그대로 쌓고, 노출을 정할 때 매핑을 붙인다.

## 설계 결정

1. **전 종목·전 베팅유형을 다 쌓는다.** 850행/회차는 가볍고, 나중에 무엇을 노출할지
   정해지면 필터만 바꾸면 된다. 지금 걸러내면 되돌릴 때 과거 데이터가 없다.
2. **워커 → 내부 API POST → 서버 upsert.** football-market-values·football-transfers 와
   같은 구조. Vercel 에서 직접 호출하지 않는 이유는 두 가지 — 응답 370KB·15초라
   서버리스에 부담이고, Vercel 동적 IP 가 막힐 위험이 TheSports 때와 같다.
3. **발매중(SaleProgress) 회차만 수집.** 지난 회차는 배당이 안 변하므로 매일 받을 이유가 없다.
   단 결과(gameResult) 확정을 위해 직전 회차 1개는 같이 받는다.
4. **Match 연결은 나중.** 이번엔 `matchId` 컬럼만 만들어 두고 null 로 둔다.

## 함정

- `compSchedules` 는 배열의 배열이다. `keys` 순서에 의존하므로 **인덱스를 하드코딩하지 말 것.**
  베트맨이 컬럼을 추가하면 순서가 밀린다.
- `drawAllot: 0.0` 은 "무승부 없음" 이지 배당 0 이 아니다. 저장 시 0 → null 로 정규화한다.
- 응답이 크고 느려서 curl 기본 타임아웃으로는 잘린다. 워커 timeout 은 넉넉히(120s).
- betman CDN(cdn.betman.co.kr)은 간헐적으로 매우 느리다(실측 15초). 데이터 API 와는
  별개지만 재시도 여유를 둔다.

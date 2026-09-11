# 연기 경기 쌍둥이 자동 흡수 — 컨텍스트 노트

## 1. 원인은 탐지가 아니라 종속 정책
`cleanup-stale-scheduled/route.ts` 는 af 가 NS + 미래 날짜를 주면 `findCrossSourceTwin`(새 시각 ±150분, 반대 prefix)으로 쌍둥이를 찾는다. Middlesbrough(#1229619→#10881649)도 여기서 잡혔다. `absorbIntoTwin` 이 OddsSnapshot 외 종속을 전부 "사람 판단"으로 거부해 `dupConflict` 로만 보고됐다.

## 2. 테이블별 규칙 (둘 다 미시작 경기라는 전제)
| 테이블 | FK 삭제 | 규칙 | 근거 |
|---|---|---|---|
| Article PREVIEW | SET NULL | PUBLISHED 면 REJECTED, 옛 행에 남김 | `rejectPreviewsForPostponed` 와 같은 규칙. 쌍둥이로 옮기면 `articles:{none:PREVIEW}` 조건 때문에 새 프리뷰 생성이 막힌다 |
| Article 그 외 | SET NULL | 차단 | RECAP·ANALYSIS 는 미시작 경기에 없어야 정상 — 있으면 전제가 틀린 것 |
| MemberBotPick | 없음 | 이전, 쌍둥이에 (botId, market) 있으면 삭제 | 고유키 [botId, matchId, market] |
| MatchVote | 없음 | 이전, 쌍둥이에 (userId, market) 또는 (sessionId, market) 있으면 삭제 | 9/10 시장 확장 후 고유키에 market 포함. 수동 스크립트 mergeGroup 은 market 을 안 봐서 틀림 |
| UserMatchFollow | 없음 | 이전, 같은 userId 있으면 삭제 | 고유키 [userId, matchId] |
| Post · PlayerEvent | SET NULL · 없음 | 이전 | 고유키 없음 |
| PushMatchAlert · TelegramAlertLog | 없음 | **삭제** | 발송 기록을 옮기면 새 날짜 킥오프에 "이미 보냄"으로 판단해 알림이 안 나간다 |
| TheSportsMatchCache | CASCADE | 쌍둥이에 없으면 이전 | 라이브 push 소유권 (mergeGroup 과 동일) |
| BetmanOdds | 없음 | 쌍둥이에 매핑 없으면 이전, 있으면 null | 매핑은 베트맨 빌더가 다시 붙인다 |
| OddsSnapshot | CASCADE | 쌍둥이에 없으면 이전, 있으면 버림 | 기존 규칙 유지(두 소스 시계열 섞으면 차트 지그재그) |
| OddsBookSnapshot · AiPrediction · PredictionContextSnapshot · PredictionPostmortem · LiveCommentary · TsBaseballOddsHistory | CASCADE | 버림 | 쌍둥이 쪽 기록이 기준, mergeGroup 도 손대지 않음 |
| MatchStats · BookClosingOdds | RESTRICT · 없음 | 차단 | 종료 후에만 생긴다 |
| 규칙에 없는 테이블 | — | 차단 | 새 테이블이 조용히 새지 않게 기존 안전장치 유지 |

## 3. 실행 순서
트랜잭션 안에서 삭제 → 이전 → 프리뷰 REJECT → 옛 행 삭제. 삭제를 먼저 해야 이전 시 고유키 충돌이 없다. 종속 건수 조회는 트랜잭션 밖(9/11 UFC 삭제 때 트랜잭션 안 조회가 5초 제한에 걸려 롤백된 함정), 트랜잭션은 timeout 30초.

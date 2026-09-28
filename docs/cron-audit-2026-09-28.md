# 배치 전수 점검 기록 — 2026-09-28

알림 3건(MLB 선발 미실행·일정 백필 400·랭킹 스냅샷 실패)에서 시작해 자동 작업 97개를 전수로 본 기록.
결정과 근거 위주. 상세 수치는 커밋 메시지에 있다.

## 어떻게 찾았나

| 방법 | 잡은 것 |
|---|---|
| CronRun 기록 (기한 초과·연속 0건) | fetch-transactions 60시간 미실행 |
| Vercel 로그의 504 | 60초 제한에 잘린 배치 7종, mlb-starters 9/27 누락의 실제 원인 |
| Vercel 로그의 500 | ts-baseball-mapping 메모리 부족 |
| DB 흔적 (테이블별 최근 시각·일별 건수) | baseball-weekly NPB·MLB 누락, 하이라이트 연결 0건, 옛 선발 20경기 |
| 운영 함수 안에서 자기 호출 | refresh-live-baseball 403, 랭킹 스냅샷 방화벽 검문 |

로그와 DB 흔적을 같이 봐야 한다. 시간 초과는 기록이 안 남아 CronRun 만으로는 "미실행"과 구분이 안 된다.

## 고친 것

| 배치 | 원인 | 조치 |
|---|---|---|
| player-rank-snapshot | Vercel 방화벽 봇 검문 (9/23~) | UA 에 vercel-cron |
| refresh-live-baseball | 화면 전용 API 보호에 Bearer 없이 호출 (9/17~, 11일) | Bearer + www 정규화, 0건이면 ok:false |
| baseball-season-backfill | ESPN 날짜 범위 조회 400 | 날짜별 조회 폴백 |
| fetch-transactions | 60초 초과 (NHL 프리시즌 번역량) | maxDuration 300 |
| api-football·baseball-weekly·analysis·odds·mlb-starters 외 3종 | 60~120초 초과 | maxDuration 300, 기록·감시 등록 |
| baseball-weekly | KBO 한 편에 60초를 다 써 NPB 4주·MLB 11주 누락 | 위와 같음. 이번 주 NPB·MLB 재발행 |
| analysis | 월드컵 종료 뒤에도 매주 월드컵 글 발행 | 앞뒤 45일 안에 경기가 있을 때만 |
| youtube-highlights | 데이터센터 IP 에서 유튜브 시청 페이지가 봇 확인 페이지 → 전부 "재생 불가" (9월 초~) | 필드가 없으면 oEmbed 로 판정. 23건 복구 |
| baseball-starters | 재편성 경기가 옛 선발 보유 (20경기) | 경기 3일 이상 전 값은 비움 |
| score-analysis | 푸시 픽이 5분마다 재채점 (5건) | 점수 확정 + 판정 없음이면 무효 종결 |
| af-odds | af 의 200 위장 오류를 0건으로 읽음 | apiSportsError 로 감지 |
| ts-baseball-mapping | 호출당 1.6GB (detailLive 통째 조회) → OOM, 같은 인스턴스 경로까지 500 | raw SQL 로 _swap 만 |

## 일부러 안 고친 것 (결정 필요)

- **analysis 의 60시간 가드.** type=ANALYSIS 전체를 봐서, 매일 나오는 kbo-featured-hitters·화요일 weekly-review 때문에
  빅5·KBO 분석 글은 늘 건너뛴다. 가드를 좁히면 발행량이 늘어난다 — 색인·품질 정책이라 사용자 결정.
- **evaluate 미채점 146건.** predHome 은 있는데 predWinner 가 없고 팀 이전 경기가 5건 미만(승격팀 시즌 초)이라
  표본 게이트에 걸린다. 저장 확률로 채점하면 공개 적중률 수치가 바뀐다 — 사용자 결정.
- **tactical·manager-month.** Vercel 발 실행 흔적이 0. env 게이트가 꺼져 있으면 ok:true 로 끝난다. 의도인지 확인 필요.
- **transfer-daily·transfer-xi.** 9/19~20 이후 산출 0. 이적시장 마감에 따른 것으로 보이나 cron 은 매일 돈다.
  blog-weekly 처럼 겨울까지 해제할지 결정 필요.
- **mma.** 매일 300초 초과. 코드가 "시간이 다 되면 다음 날 이어서"로 설계돼 있어 그대로 둠.
- **preview.** 300초 초과는 알려진 처리량 문제 (preview-throughput-weekend-backlog).

## 교훈

- **ok:true 를 무조건 돌려주는 배치는 막혀도 모른다.** 성공 건수로 ok 를 정하고 count 를 기록할 것.
- **시간 초과는 catch 를 안 탄다.** 함수가 강제 종료되므로 실패 기록을 남길 수 없다. 기한 감시(maxAgeH)로만 잡힌다.
- **"없음"과 "판정 불가"를 구분할 것.** 유튜브 필드 없음 = 재생 불가로 읽어 한 달간 0건이었다.
- **집 IP 에서 되면 운영에서도 된다고 보지 말 것.** 방화벽 통과 규칙에 집 IP 가 있고, 유튜브·ESPN 은 데이터센터 IP 를 다르게 대한다.
- **검증 반복문의 종료 조건을 확인할 것.** 이번에 종료 조건을 잘못 써서 baseball-starters 를 15번 호출했다.
  글 중복은 없었지만(slug 멱등), 발행·알림이 걸린 배치였다면 사고다. 운영 배치는 한 번 호출하고 결과를 DB 로 확인한다.

## 사용자 결정 반영 (2026-09-28 저녁)

- **analysis 가드를 이 시리즈로 좁힘.** 60h 가드가 `slug contains "-analysis-"` 만 본다.
  실측으로 보니 글이 안 나온 주원인은 가드보다 **60초 제한**이었다(WORLD_CUP·MLS 두 편 쓰고 잘림).
  가드는 목요일 회차에서 빅5(화요일 weekly-review)와 KBO·MLB·NPB(매일·매주 글)를 막고 있었다.
- 제한 300초 안에 끝나도록 **시간 예산 230초**를 두고, **오래 못 쓴 리그부터** 돈다.
  한 회차에 5~6편, 시즌 중인 리그 18개가 약 3주에 한 번씩 돌아온다. 주 2편 → 주 5~6편.
- 수동 실행은 하지 않았다. 다음 목요일 11:00 KST 회차부터 적용된다.
- **transfer-briefs(AI 이적 브리핑)도 같은 날 해제** (최근 3회 연속 0건).
- **transfer-daily·transfer-xi cron 해제.** vercel.json 에서 빼고 감시 등록도 주석 처리. 겨울 이적시장 때 되살리는 법은
  `src/lib/cron-registry.ts` 주석에 있다. 라우트와 잡 코드는 그대로 뒀다.
- 남은 결정: evaluate 미채점 146건, tactical·manager-month env 게이트.

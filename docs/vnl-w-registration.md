# 여자 발리볼 네이션스리그(VNL_W) 등록 — 작업 노트

## 배경
사용자 지적. "네이션스리그 (여) 세계"가 진행 중인데 scorebase에 없음. 기존 배구는 VNL(남)/AVC_NATIONS_W/EGL_W 3개만 등록. 여자 VNL은 리그 자체가 미등록.

## 확정 사실
- 여자 VNL utid(시즌 불변) = `yl5ergdh3wpr8k0`, season_id = `zp5rzdhppydq82w`
- 확정 근거. standings API(`/v1/volleyball/season/table/detail?uuid=zp5rzdhppydq82w`)의 세트 W-L을 위키 순위표와 1:1 매칭 → 18팀 전부 유일하게 일치. team/list 조회로 gender=2·national=1 재확인.
- 시간+매치업 대조는 웹 검색 스니펫 일정이 부정확해 오사카 풀 외에는 틀림. 세트 매칭이 정답이었음(Italy 3위·Dominican 15위 = 상식 부합).
- Vultr에 배구 워커 3개 이미 가동 중(collector/poller/odds-poller). lightsail-worker/ 코드는 로컬 사본, 실제 운영은 Vultr. 여자 VNL이 안 뜬 이유는 서버 다운이 아니라 collector `UTID_TO_LEAGUE`에 utid 미등록.

## 18팀 매핑 (tsId → 국가, 순위)
| tsId | 영문 | 한글 | 순위 |
|---|---|---|---|
| p4jwq23h3l4r0ve | USA Women | 미국 | 1 |
| yl5ergdh9zyr8k0 | Brazil Women | 브라질 | 2 |
| l965mkdh6k9r1ge | Italy Women | 이탈리아 | 3 |
| 8y39mpwh266qojx | Netherlands Women | 네덜란드 | 4 |
| jednm9vh319qyox | Canada Women | 캐나다 | 5 |
| 4zp5rzdhlg0q82w | Turkey Women | 튀르키예 | 6 |
| vl7oqddh51xq510 | Japan Women | 일본 | 7 |
| j1l4rjdhw95r7vx | Poland Women | 폴란드 | 8 |
| gpxwrxdhkv4myk0 | China Women | 중국 | 9 |
| z318q67h5lkro9j | Czech Republic Women | 체코 | 10 |
| p4jwq23h3nwr0ve | Germany Women | 독일 | 11 |
| l965mkdh6kyr1ge | Belgium Women | 벨기에 | 12 |
| jednm9vh3w2qyox | Serbia Women | 세르비아 | 13 |
| kdj2rydhz29r1zp | Thailand Women | 태국 | 14 |
| p4jwq23h332r0ve | Dominican Republic Women | 도미니카공화국 | 15 |
| 4zp5rzdhl50q82w | Ukraine Women | 우크라이나 | 16 |
| l965mkdh6yyr1ge | France Women | 프랑스 | 17 |
| 9k82redh7gpqepz | Bulgaria Women | 불가리아 | 18 |

입력 JSON. `scratchpad/vnl-w-teams.json`

## 체크리스트
- [ ] team-names.ts VNL_W scope 18개 한글명 추가
- [ ] sport-leagues.ts VNL_W 추가 (VOLLEYBALL_LEAGUES·SPORTS.volleyball.leagues·한글명·인기도)
- [ ] volleyball-collector.js UTID_TO_LEAGUE `yl5ergdh3wpr8k0`→VNL_W
- [ ] standings-poller.js VOLLEYBALL 배열 VNL_W season 추가
- [ ] seed 스크립트 mapping 병합형 수정 (기존 56팀 보존)
- [ ] seed 실행 → DB Team/TeamSourceId 18 + 매핑 JSON 74팀 [DB 쓰기·승인]
- [ ] tsc 통과
- [ ] Vultr collector+mapping scp + 워커 재시작 [배포·승인]
- [ ] backfill 실행 → 파이널 라운드 경기 등록 확인
- [ ] /scores 배구에 여자 VNL 노출 검증

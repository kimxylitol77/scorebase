# 축구 라인업 UI 개선 (fotmob 수준)

사용자 요청 2026-08-05. 참고 = fotmob 매치 라인업 화면.

## 현황 (실측)

`src/components/scores/soccer/SoccerLineupSvg.tsx` (436줄) — 선발 11명만 그린다.
사진 + 등번호 + 한글이름 + 평점 + 부상 배지가 전부.

⚠️ 이 파일은 메모리 `pitch-component-unification` 에서 **공용 Pitch 미적용 예외**로 등록돼 있다
(line-spread 좌표 계산이 복잡). 공용화하지 말고 이 파일 안에서 확장한다.

## 데이터 (있음 — 신규 수집 불필요)

`TheSportsMatchCache.lineup` = `{ lineup:{home,away}, coach_id, confirmed, *_formation, injury }`
- 벤치 = `first !== 1` (사진·등번호·포지션 포함, 실측 7~12명)
- `detailLive.incidents` = 골·카드·교체 전부
  - type 3 옐로 · 4 레드 (`tsIncidentsToCards` 재사용)
  - type 9 교체 (`in_player_id`/`out_player_id`/`in_player_name`/`out_player_name`)
  - 골 = `home_score`/`away_score` 필드 보유 (`tsIncidentsToGoals` 재사용) · 17 자책 · 8 PK
  - `position` 1=home / 2=away, `time` = 분

## 체크리스트

- [x] 피치 위 선수 배지 — 교체 아웃(`63' ←`) · 카드 · 골 아이콘
- [x] 교체 명단(벤치) 섹션 — 좌우 분할, 사진·번호·포지션·투입 시각·카드
- [x] 감독 표시 — 수집부터 만들어 해결 (2026-08-05 후속)

## 감독 수집 (후속)

처음엔 "데이터 없음" 으로 뺐으나 사용자 요청으로 수집부터 만들었다.

- 기존 `data/team-coaches.json` 은 **8리그 193팀**뿐 — 라인업 `coach_id` 매칭률을 재보니
  최근 60경기 115건 중 **8건(7%)**. 하위 리그가 통째로 빠진다.
- `scripts/collect-all-team-coaches.ts` 신설 — 같은 `coach/list` 를 리그 필터 없이 받아
  `TeamSourceId(thesports)` 로 우리 Team 에 매칭, `Team.coach` 에 저장(스키마 변경 0).
- ts 가 전임 감독도 함께 내려주므로 `team_id` 별 `updated_at` 최신 1명만 남긴다.
- 한글명은 `src/lib/coach-names.ts` — `team-coaches.json` 의 `nameKo` 를 사전으로 재사용하고
  없으면 원문. 수천 명을 LLM 으로 번역할 이유가 없고 원문이라도 "감독 없음" 보다 낫다.
- [x] 한글 이름 적용 (기존 `nameById` + `toKoreanPlayerName` 재사용)
- [x] 데이터 없는 경기(벤치·incidents 부재)에서 깨지지 않는지
- [x] tsc + 로컬 실렌더(라이브·종료 각 1건)
- [ ] 커밋·push

## 결과 (2026-08-05)

- 피치: 교체 아웃(`↓75'`) · 카드(좌상단 세로 막대) · 득점(이름 옆 점, 자책은 붉게)
- 교체명단: 좌우 분할, 투입 선수를 위로 정렬, 사진·번호·포지션·`↑분`·카드
- **모바일은 1열**. 2열이면 이름 칸이 45px 로 좁아져 한글이 잘린다(실측 31px 부족) → 1열에서 201px 확보, 잘림 0
- 실측 검증(UCL 스파르타 vs 리옹): 교체 7 · 경고 2 · 득점 3 이 incidents 원본과 일치, 배지 잘림 0, 가로 넘침 0
- incidents 없는 경기(USA_USL_CH POSTPONED)에서 에러 없이 기존 렌더 유지

## fotmob 격차 4종 (2026-08-05 2차)

- 감독 사진 — `coach/list` 의 `logo` 를 `data/coach-photos.json`(감독 ts id 키)으로 떨궈
  `lineup.coach_id` 로 직접 lookup. Team.coach 는 이름 폴백.
- 득점 표시 — 이름 칩의 점 → ⚽ 글리프(2골 ⚽2, 자책골 색반전 + title). 교체명단에도 동일 마크.
- 어시스트 — 골 incident 의 `assist1_id`/`assist2_id` → 이름 칩에 노란 `A` 칩.
- 선수 클릭 → `/transfers/{tsId}`. **TheSportsPlayer 등록 선수만** 링크(미등록 6/45 는 404 방지).
  호출부의 nameKo 조회에서 필터만 빼 등록 집합을 같이 얻는다(추가 쿼리 0).

검증(UCL 스파르타-리옹): 득점 3·자책 1·어시스트 2·링크 39개(등록 39명과 일치), 링크 1건 실접속 200.

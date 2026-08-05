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
- [~] 감독 표시 — **보류**. `Team.coach` 필드는 있으나 4,581개 팀 **전부 비어 있고**(EPL·LALIGA·SERIE_A 0/23·0/23·0/20), ts `coach_id` 를 이름으로 바꿀 경로가 없다. 감독 수집 파이프라인이 선행돼야 한다.
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

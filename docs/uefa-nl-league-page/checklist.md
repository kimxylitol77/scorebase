# 체크리스트 — UEFA 네이션스리그 페이지

## 1. af 조별 순위 소스
- [ ] af standings 를 그룹 보존해 가져오는 함수 (리그 하드코딩 없음)
- [ ] ts 표 0개 + DB 종료 0건일 때만 af 로 폴백 (기존 ts 우선순위 유지)
- [ ] 조 라벨 한글화 ("League A, Group 1" → "리그 A · 1조")
- [ ] af team id → our Team row 매핑 (없으면 링크 없이 이름만)
- [ ] 검증: /standings/UEFA_NL 14개 조 섹션 실렌더

## 2. 탭 등록
- [ ] CUP_LEAGUES 에 UEFA_NL (조별리그 있는 컵)
- [ ] NO_TABLE_LEAGUES 에 넣지 않음 (순위 탭 필요)
- [ ] PREDICTION_LEAGUE_SET 확인
- [ ] 리그 메타(설명·영문명·국기) 등록
- [ ] 검증: /leagues/UEFA_NL 탭 6종 노출

## 3. Team row · 한글명
- [ ] backfill:cup-teams 로 UEFA_NL 팀 매핑
- [ ] 국가명 한글 사전 적용 확인
- [ ] 검증: 순위표·일정 팀명 100% 한글

## 4. 일정 확장
- [ ] collect 로 11월·내년 3월 일정 적재
- [ ] 검증: 일정 탭 경기 수 60 → 증가

## 5. 역사 · 통계
- [ ] league-champions.json 에 네이션스리그 역대 우승
- [ ] leagueLeader 수집 대상인지 확인
- [ ] 검증: 두 탭 빈 화면 아님

## 6. 마감
- [ ] tsc 통과
- [ ] npm test 통과
- [ ] 프로덕션 빌드 성공
- [ ] 실렌더 확인 (데스크톱·모바일)
- [ ] 커밋 분할 + push

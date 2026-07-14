# 발롱도르 지수 계산기 (/ballon) — 체크리스트

## 데이터 조립 (src/lib/ballon.ts)
- [ ] BALLON_LEAGUE_COEF 리그 계수 상수 (빅5=1.0, UCL=1.2, WC=1.3, 하위리그 0.5~0.7)
- [ ] prisma.leagueLeader 직접 조회 (원본 af externalId 병합 키 유지, loadLeagueLeaderboard 미사용)
- [ ] af id 로 선수 병합 (케인 = 분데스 + WC 합산), leagues[] 누적
- [ ] 평점: afPlayerToTs → PlayerMatchLog 시즌 평균 rating 배치 조회
- [ ] 팀성적: 리그별 getFullStandings → teamName 매칭 → rankPct(0~1)
- [ ] href: af→ts 변환해 /transfers/[tsId] (실패 시 null)
- [ ] 후보별 사전계산: baseGoal/baseAssist/wcGoal/wcAssist/ratingPts/teamPts

## 페이지 (src/app/ballon/page.tsx)
- [ ] 서버 컴포넌트 + metadata export (title/description/canonical)
- [ ] buildBallonCandidates() 호출 → 상위 N 클라 컴포넌트에 전달

## 클라이언트 (src/app/ballon/BallonCalculator.tsx)
- [ ] 'use client', 가중치 슬라이더 5종(골/도움/평점/팀성적/월드컵)
- [ ] useMemo 로 score 계산·정렬 실시간 재정렬
- [ ] 랭킹 카드: 순위·사진·한글명·팀·리그 국기·골/도움/평점·지수, 선수 링크
- [ ] 공식·한계 안내 문구 (스탯 기반 근사, 공격수 편향)

## 검증
- [x] 실데이터 TOP: 케인/음바페/홀란드/야말/메시/뎀벨레 — 담론과 일치 확인
- [x] tsc --noEmit 통과
- [x] 브라우저 미리보기: 슬라이더 재정렬(창조력 중시→올리스 ▲3 1위)·프리셋·움직임화살표·사진·af→ts 링크·모바일 반응형 모두 정상, 콘솔 에러 0
- [ ] 네비/홈 진입점 연결 (미정 — 배치 위치 사용자 결정 대기)
- [ ] 배포 (사용자 승인 대기)

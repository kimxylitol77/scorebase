# 분석가 팔로우 + 새 픽 텔레그램 알림 — 체크리스트

목표. 재방문 루프의 핵심 = "잘 맞추는 분석가 팔로우 → 새 픽 알림 → 재방문".
캐시아웃 팔로우 랭킹 벤치마크, 단 주 랭킹은 적중률(Wilson) 유지·팔로워 수는 보조 지표.

- [x] 1. prisma 스키마 — UserAnalystFollow 모델 + User 양방향 relation
- [x] 2. DB 적용 — CREATE TABLE SQL 직접 실행 (prisma db push 금지, 신규 테이블이라 락 리스크 없음)
- [x] 3. 서버 액션 — toggleAnalystFollowAction (로그인 필수, 자기 자신 팔로우 금지, upsert/delete 토글)
- [x] 4. FollowButton 컴포넌트 — form + 서버 액션 (클라 JS 불필요)
- [x] 5. 버튼 배치 — /experts/[userId] 프로필 + /analysis/[id] 작성자 영역
- [x] 6. /experts 목록 행에 팔로워 수 표시 (0이면 숨김 — 초기 빈약해 보임 방지)
- [x] 7. 디스패처 확장 — FOLLOW_PICK: 최근 40분 픽 글 → 팔로워 텔레그램 발송, TelegramAlertLog(post:{id}) 중복 방지
- [x] 8. tsc + 로컬 검증 — 프로필/상세 버튼 렌더, 비로그인 클릭=/login?from= 리다이렉트, /experts 팔로워 0 숨김
- [x] 9. 커밋 + push + 프로덕션 검증

## 후속
- [ ] 실제 팔로우→알림 E2E — 배포 후 운영자 계정으로 분석팀 팔로우 → 다음 픽 글에서 텔레그램 수신 확인
- [x] /experts 팔로우 랭킹 탭 — ?tab=follow, 팔로워 수 내림차순(getFollowRanking), 빈 상태 안내
- [x] 팔로잉 피드 — /analysis?feed=following, 분석 보드 한정 칩. 비로그인=로그인 유도,
      팔로우 0=랭킹 유도, 종목 필터와 조합 가능. canonical 은 /analysis 유지(개인화 뷰)

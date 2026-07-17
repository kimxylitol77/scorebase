# 분석가 팔로우 — 컨텍스트 노트

작업 중 내린 결정과 근거. 계속 덧붙임.

## 2026-07-17 설계 결정

- **방향 결정 배경.** /analysis 가 현재 전부 봇 글. "봇을 사람처럼 늘리기"는 기각 —
  이 게시판의 차별점(실결과 자동 채점 = 검증된 기록)을 위장 발각 리스크로 바꾸는 것.
  대신 캐시아웃(cashout.org/ranking/follow) 스타일 팔로우 루프 채택. 봇 패널의 진짜
  적중 기록이 이미 있어 팔로우 대상 콜드스타트 문제 없음.
- **팔로워 수 랭킹은 주 랭킹으로 쓰지 않음.** 초기 팔로워 0~수 명이라 social proof 역효과.
  주 랭킹 = 기존 Wilson 적중률 유지, 팔로워 수는 보조 표시(0이면 숨김).
- **모델명 UserAnalystFollow.** UserTeamFollow(팀 팔로우, 텔레그램 킥오프 알림)와 동일
  패턴 복제. User.id 가 String cuid 라 id 들 전부 String.
- **DB 적용 = CREATE TABLE SQL 직접 실행.** prisma db push 는 프로덕션 hang 이력
  (pg_dump 락 콘보이). 신규 테이블 CREATE 는 기존 테이블 락을 안 잡아 안전.
- **알림 = 기존 디스패처(dispatch-telegram-alerts.ts, cron */5) 확장.** 글 생성 인라인
  훅이 아닌 이유 — 봇 글은 웹 서버 액션이 아니라 잡/직접 insert 로 생성될 수 있어
  인라인 훅이 안 탐. 디스패처가 최근 N분 픽 글을 스캔하는 방식이 생성 경로와 무관.
- **중복 방지 = TelegramAlertLog 재사용.** matchId 컬럼(String)에 `post:{postId}` 를
  넣어 경기 id 와 충돌 회피. kind = "FOLLOW_PICK".
- **버튼은 form + 서버 액션.** 클라이언트 JS 없이 동작. /experts 목록 행은 전체가
  Link 라 중첩 인터랙션 불가 → 버튼은 프로필과 글 상세에만, 목록엔 팔로워 수만.
- **자기 자신 팔로우 금지.** 액션에서 가드.

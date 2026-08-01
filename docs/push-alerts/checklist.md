# 웹 푸시 킥오프 알림 (비회원 재방문 장치) 체크리스트

목표. 별표(즐겨찾기)한 예정 경기의 킥오프 직전, 회원가입 없이 브라우저 푸시 알림. 재방문율 5~13% 를 끌어올리는 1번째 축적 장치.

- [x] 기존 인프라 조사 — manifest 있음(src/app/manifest.ts), SW 없음, 별표=localStorage(scorebase:fav-matches)+fav-changed 이벤트, 회원 텔레그램 알림 크론(*/2) 별도
- [x] web-push 패키지 설치 + VAPID 키 생성 (.env.local)
- [x] Prisma 모델 — PushSubscription + PushMatchAlert → db push (additive, 저위험)
- [x] public/push-sw.js — push 표시 + 클릭 시 경기 상세 이동
- [x] POST/DELETE /api/push/subscribe — 구독 upsert + 별표 경기 동기화(서버에서 SCHEDULED·미래만 필터)
- [x] 클라이언트 — PushAlertToggle(벨) FavoriteMatches 헤더 + fav-changed 시 자동 재동기화
- [x] /api/cron/push-alerts (*/10) + dispatch-push-alerts 잡 — 킥오프 15분 창, 410 Gone 구독 삭제
- [x] vercel.json 크론 + CRON_REGISTRY 등록 (필수 — 메모리 cron-execution-monitor)
- [x] tsc·lint + 로컬 E2E — 구독 API·서버 필터·조기발송 가드·FCM 실도달(410) 확인. 브라우저 실권한 수신은 preview 판 알림 차단으로 불가 — 배포 후 사용자 폰에서 확인
- [x] 커밋. Vercel env 2개(NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)는 사용자 등록 필요 — 보고

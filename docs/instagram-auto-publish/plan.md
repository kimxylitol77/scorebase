# 인스타그램 릴스 자동 게시

사용자 지시(09-29): "인스타도 자동으로 올라가게 해줘". 대상 계정 = @scorebase1 (스레드와 같은 인스타 계정).

- 방식: Instagram API with Instagram Login (graph.instagram.com) — 페이스북 페이지 연결 불필요. 필요 권한 instagram_business_basic + instagram_business_content_publish, 프로페셔널 계정 필수. 24시간 100건 한도.
- 영상은 공개 URL 로만 넘길 수 있음(인스타 로그인 방식은 resumable 업로드 미지원) → Vercel Blob 에 임시 업로드 → 게시 후 삭제.
- 스크립트: scripts/shorts/instagram-publish.mts (게시), instagram-token-set.mts (토큰 숨김 입력·검증·저장). 토큰 = ~/scorebase-shorts/.ig-token.json(600), 7일마다 자동 갱신(60일 만료).
- 연결: ~/scorebase-shorts/scripts/daily-shorts.sh 4.5단계 — 토큰 파일 있을 때만 실행, 실패 시 텔레그램 알림(영상은 이미 텔레그램에 있으니 수동 대체).

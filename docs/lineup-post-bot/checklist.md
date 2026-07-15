# 확정 라인업 봇 — 체크리스트

- [x] src/jobs/generate-lineup-post.ts — 감지·보드 조립·본문·발행 (dry-run 지원)
- [x] TS x/y → 전술판 versus 좌표 변환 (away 프레임: GK y>50 자가판별 flip — 월드컵 실데이터로 실증)
- [x] pid 게이트 — TheSportsPlayer 존재 여부로 pid vs 커스텀 이름 분기 (+본문 nameKo 폴백)
- [x] 중복 가드 — Post.matchId + "[라인업]" prefix
- [x] src/app/api/cron/lineup-post/route.ts (신설 전 경로 충돌 확인 완료 — 없음)
- [x] vercel.json cron 등록 (*/10)
- [x] package.json job:lineup-post 스크립트
- [x] dry-run — 월드컵 준결승(프랑스 vs 스페인)으로 제목·본문·보드 코드 생성 확인
- [x] OG 이미지 눈 검증 — 두 팀 겹침 없음, GK 각자 골문, 사진·한글명 정상
- [x] tsc 0 에러
- [ ] 커밋·push·배포
- [ ] 배포 후 cron 첫 실행 확인 (다음 주요리그 경기 시)

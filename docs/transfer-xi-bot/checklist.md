# 이적시장 예상 XI 봇 — 체크리스트

- [ ] src/jobs/generate-transfer-xi.ts — 포커스 선정·웹 XI·매칭·배치·본문·발행
- [ ] 배치 엔진: detail 포지션 → 라인 버킷 → 풀피치 좌표 + 포메이션 역산
- [ ] 게이트: 이름 매칭 9/11, GK 정확히 1명, 세부 포지션 8/11
- [ ] 중복 가드: fake13 오늘 lineupCode 글 + 같은 팀 7일
- [ ] cron route /api/cron/transfer-xi (신설 전 경로 충돌 확인)
- [ ] vercel.json (0 1 * * * = 10:00 KST) + package.json job:transfer-xi
- [ ] dry-run: 배치 결과·본문·게이트 확인
- [ ] OG 이미지 눈 검증
- [ ] tsc 0 에러 → 커밋·push

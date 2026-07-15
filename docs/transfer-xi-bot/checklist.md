# 이적시장 예상 XI 봇 — 체크리스트

- [x] src/jobs/generate-transfer-xi.ts — 포커스 선정·웹 XI·매칭·배치·본문·발행
- [x] 배치 엔진: detail 포지션 → 라인 버킷 → 풀피치 좌표 + 포메이션 역산
- [x] 게이트: 이름 매칭 9/11, GK 정확히 1명, 세부 포지션 8/11
- [x] 중복 가드: fake13 오늘 lineupCode 글 + 같은 팀 7일
- [x] cron route /api/cron/transfer-xi (신설 전 경로 충돌 확인)
- [x] vercel.json (0 1 * * * = 10:00 KST) + package.json job:transfer-xi
- [x] dry-run: 배치 결과·본문·게이트 확인
- [x] OG 이미지 눈 검증
- [x] tsc 0 에러 → 커밋·push

검증 메모: 맨유 dry-run 매칭 11/11·detail 11/11, 4-2-2-2 역산, OG 눈검증 통과(좌우 포함). XI 검색·본문 모두 sonnet(하이쿠는 JSON 미출력·인용 조각 실측). 본문 후처리 cleanBody 로 인용 개행·잘림 방어.

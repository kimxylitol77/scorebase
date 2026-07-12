# Team.nameKo 파이프라인 체크리스트 (2026-07-12)

목표. 팀 한글명을 선수와 같은 구조로 — TheSports 공식 한국어명(type=4)을 Team.nameKo 에 데일리 적재,
표시 우선순위는 team-names.ts 사전(사람 큐레이션) > Team.nameKo(공식) > 영문.

- [ ] 1. prod DB `ALTER TABLE "Team" ADD COLUMN "nameKo" TEXT;` → **사용자가 Neon SQL 로 직접** (auto mode 가 prod DDL 차단, 정당)
- [x] 2. prisma/schema.prisma Team 에 nameKo String? 추가 → prisma generate + tsc 통과
- [x] 3. scripts/fetch-thesports-language-team.sh 신규 → Vultr 실행 완료, 29,838건 수집 (83 페이지, 수 분)
- [ ] 4. scripts/apply-thesports-team-nameko.ts dry-run → --apply (컬럼 생성 후 — dry-run 도 nameKo select 라 ALTER 선행 필수)
- [x] 5. /scores 통합 — nameKo select + teamDisplayKo 체인 → 커밋 7d728dd, **push 는 ALTER 후** (컬럼 없이 배포되면 P2022 로 /scores 500)
- [x] 6. 맥미니 daily-official-korean.sh 수리 — WORKER 를 Vultr 로 + 팀 단계 추가, 배포·문법검사 완료
- [ ] 7. 맥미니 → Vultr ssh 키 등록 → **사용자 승인 필요** (auto mode 가 authorized_keys 추가 차단)
- [x] 8. tsc 통과 + 시맨틱 커밋 2개 (파이프라인 a9c6634 push 완료 / 표시 7d728dd 보류)
- [x] 9-a. 선수 3일 백로그 치유 — type=5 수동 fetch(148,439건) + apply 완료 (교체 645·신규 3·라인업 648, 2026-07-12 15시)
- [ ] 9-b. 검증 — 팀 apply dry-run→적용, /scores 마이너 리그 팀 한글 표시 확인, 봇 무인 e2e (ALTER + ssh 키 후)

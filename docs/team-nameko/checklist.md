# Team.nameKo 파이프라인 체크리스트 (2026-07-12)

목표. 팀 한글명을 선수와 같은 구조로 — TheSports 공식 한국어명(type=4)을 Team.nameKo 에 데일리 적재,
표시 우선순위는 team-names.ts 사전(사람 큐레이션) > Team.nameKo(공식) > 영문.

- [x] 1. prod DB `ALTER TABLE "Team" ADD COLUMN "nameKo" TEXT;` → 사용자가 Neon SQL 로 직접 실행, 컬럼 확인 완료 (auto mode prod DDL 차단은 정당)
- [x] 2. prisma/schema.prisma Team 에 nameKo String? 추가 → prisma generate + tsc 통과
- [x] 3. scripts/fetch-thesports-language-team.sh 신규 → Vultr 실행 완료, 29,838건 수집 (83 페이지, 수 분)
- [x] 4. scripts/apply-thesports-team-nameko.ts dry-run(신규 1,822·매핑 2,005) → --apply 적용 완료=1822
- [x] 5. /scores 통합 — nameKo select + teamDisplayKo 체인 → 커밋 7d728dd 배포 완료
  - ⚠️ 교훈. 보류해둔 이 커밋이 병렬 세션 push(cc45fb8)에 휩쓸려 ALTER 전에 배포됨 — 15:48~16:05 경 /scores 5xx 구간 가능성.
    순서 의존 커밋은 로컬 main 보류가 아니라 브랜치 격리. (메모리 feedback_held_commit_parallel_push 등재)
- [x] 6. 맥미니 daily-official-korean.sh 수리 — WORKER 를 Vultr 로 + 팀 단계 추가, 배포·문법검사 완료
- [x] 7. 맥미니 → Vultr ssh 키 등록 (사용자 직접) → BatchMode ssh OK 검증
- [x] 8. tsc 통과 + 시맨틱 커밋 (파이프라인 a9c6634 / 표시 7d728dd / 문서 54b21ad) push 완료
- [x] 9-a. 선수 3일 백로그 치유 — type=5 수동 fetch(148,439건) + apply 완료 (교체 645·신규 3·라인업 648, 2026-07-12 15시)
- [x] 9-b. 프로덕션 검증 — /scores?date=2026-07-19 에 "로스 안데스"·"산 텔모" 한글 렌더 확인
- [x] 9-c. 봇 무인 e2e — daily-official-korean.sh 수동 1회 "✓ 종료" (선수 148,439 fetch·팀 29,838 fetch 후 양쪽 업데이트 0 = 멱등 확인, 2026-07-12)

전 항목 완료. 내일 03:30 무인 실행이 정상 사이클 1회차.

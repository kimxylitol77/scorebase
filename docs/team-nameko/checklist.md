# Team.nameKo 파이프라인 체크리스트 (2026-07-12)

목표. 팀 한글명을 선수와 같은 구조로 — TheSports 공식 한국어명(type=4)을 Team.nameKo 에 데일리 적재,
표시 우선순위는 team-names.ts 사전(사람 큐레이션) > Team.nameKo(공식) > 영문.

- [ ] 1. prod DB `ALTER TABLE "Team" ADD COLUMN "nameKo" TEXT;` → 검증: 컬럼 존재 확인 쿼리
- [ ] 2. prisma/schema.prisma Team 에 nameKo String? 추가 → 검증: prisma generate 통과
- [ ] 3. scripts/fetch-thesports-language-team.sh 신규 (type=4 → /tmp/lang-team-ko.jsonl) → 검증: Vultr 에서 실행, 수집 건수 확인
- [ ] 4. scripts/apply-thesports-team-nameko.ts 신규 (jsonl → TeamSourceId/ts- 매핑 → nameKo) → 검증: dry-run 수치 확인 후 --apply
- [ ] 5. /scores 통합 — homeTeam/awayTeam select 에 nameKo + 표시 체인 → 검증: ARG_PRIMERA_NACIONAL 등 마이너 팀 한글 표시
- [ ] 6. 맥미니 daily-official-korean.sh 수리 — WORKER 를 Lightsail(삭제됨) → Vultr 로, 팀 단계 추가 → 검증: 수동 1회 실행 성공
- [ ] 7. 맥미니 → Vultr ssh 키 등록 (현재 Permission denied) → 검증: BatchMode ssh OK
- [ ] 8. tsc/빌드 통과 + 커밋/푸시 (시맨틱 분리. DB 스키마 / 파이프라인 / 표시 통합)

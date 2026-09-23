# 체크리스트
- [ ] 산식 모듈 lineup-impact.ts — wOBA·PA(slot)·xR·Δ·수축, 단위 테스트(리그 평균 라인업 → xR = lgR/G, 한 명 교체 시 Δ 부호)
- [ ] 박스스코어 파서 — MlbBoxBatter 시즌 성분(pa·ab·h·2b·3b·hr·bb·ibb·hbp·sf) + 벤치 타자 목록(가산 필드)
- [ ] 리그 상수 fetch(teams/stats hitting) unstable_cache 1일 + 실패 시 고정값 폴백(4.48 / .312)
- [ ] LineupImpactCard — 게이지 2 + 워터폴 9×2 + 필 세그먼트 + 표본 게이트 라벨, 라이트/다크
- [ ] page.tsx MatchInsight 탭 "라인업 임팩트" (양 팀 9명 확정 시 enabled)
- [ ] 로컬 실렌더 검증: 확정 라인업 경기 1·미확정 경기 1(탭 비활성)·종료 경기 1
- [ ] tsc·테스트 통과 → 커밋 → main push → 운영 확인 → 메모리
- [ ] (보류) 2단계 WOWY 원형: 출전/결장 경기 팀 R/G — gameLog 18콜 캐시 설계 후
- [ ] (후속) KBO 이식

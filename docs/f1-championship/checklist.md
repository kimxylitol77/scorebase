# F1 챔피언십 페이지 체크리스트 (Phase 1)

방향: ESPN core standings 로 드라이버·컨스트럭터 순위. 한국 드라이버가 없어 골프식 앵글 불가 →
테니스처럼 **한글명 + 팀 컬러 가독성**이 차별점.

- [x] scripts/build-f1-driver-names.ts — 시즌 드라이버 위키 ko → 미확보분 Haiku (22/22)
- [x] data/f1-driver-names.json 산출
- [x] src/lib/sports/espn-f1.ts — standings fetch(30분 캐시) + 팀명·팀컬러 매핑(11개 고정)
- [x] /rankings/f1 — 드라이버·컨스트럭터 탭, 포인트·우승·격차·DNF·차번호
- [x] /scores F1 탭 → 챔피언십 배너
- [x] weekly-static-refresh ⑯ 편입 (시즌 중 드라이버 교체 대비)
- [x] tsc → 배포 → production 검증 (드라이버·컨스트럭터 탭 실측 완료)

비범위: 드라이버 개인 상세 페이지(ESPN 에 세부 통계 없음), 레이스별 결과 아카이브(/scores F1 탭에 세션 결과 존재)

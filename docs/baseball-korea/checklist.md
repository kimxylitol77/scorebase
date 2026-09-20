# 야구 해외파 한국 선수 허브 (/baseball/korea) — 체크리스트 (2026-09-20)

요청: "야구도 https://www.scorebase.kr/soccer/korea 해외파 이것도 만들어줘"

## 계획
축구 해외파 허브와 같은 구성(주요 선수 카드 · 전체 표 · 소속팀 다음/최근 경기)을 MLB·마이너리그 한국 선수로 만든다. 명단은 MLB Stats API 의 출생국(Republic of Korea)으로 자동 스캔(메이저 sport 1 + 마이너 11·12·13·14·16), 성적은 런타임 캐시 fetch. NPB 는 국적 소스가 없어 이번엔 제외.

## 실측 (2026-09-20)
- 메이저 7명(배지환·고우석·김하성·김혜성·이정후·송성문·Refsnyder) + 마이너 8명(조원빈·엄형찬·장현석·심준석·문서준·김성준·이현승·Jayden Kim). Refsnyder 는 서울 출생 미국 국적이라 제외.
- 마이너 성적은 hydrate stats 에 sportId 를 줘야 온다. 같은 시즌 여러 레벨을 뛴 선수는 레벨별 split.
- 최근 경기는 people/{id}/stats?stats=gameLog 로 옴(메이저·마이너 모두 sportId 지정).

## 작업
- [x] scripts/build-baseball-korea.ts → data/baseball-korea.json (명단·레벨·팀·포지션·나이·한글명, 제외 목록)
- [x] src/lib/sports/baseball-korea.ts — 시즌 성적(레벨별)·최근 5경기 런타임 fetch, unstable_cache 3h
- [x] /baseball/korea 페이지 — 히어로·주요 선수(메이저) 카드·전체 표(메이저→마이너)·소속팀 다음/최근 경기(MLB 만)·메타·JSON-LD
- [x] 진입: /baseball 허브 카드, 축구 해외파 페이지에서 야구 해외파 상호 링크
- [x] mac-mini weekly-static-refresh.sh 에 명단 재빌드 추가
- [x] tsc·eslint, dev 실렌더(14명, 다음 경기 6·최근 경기 18행), 커밋 be8fecc·배포·프로덕션 200 확인
- [ ] 메모리

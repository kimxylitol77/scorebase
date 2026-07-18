# 감독 전술 연구 — 컨텍스트 노트

> 결정과 근거. 계속 덧붙임.

## 2026-07-18 초기 결정

- **DB 라인업이 아니라 af 백필 + data/ JSON 인 이유.** DB 라인업은 19/380(5월분만, ts 좌표 수집이 늦게 시작). af 히스토리는 시즌 전체 formation·coach·XI·grid 제공 실측(Arsenal vs Forest 1378999, 11/11 grid). data/ 커밋 파일은 샷맵과 동일 패턴 — 프로덕션 DB 무접촉, 트라이얼/쿼터 무관 영구.
- **Match.externalId ≠ af fixture id.** EPL 380경기 전부 numeric 이지만 af 체계 아님(537817=에스토니아 리그였음). 매핑은 날짜+팀명으로. af 콜은 season fixtures 1콜 + lineups 380콜.
- **Article 타입 = TACTICAL 재사용.** 배지("전술")·slug 패턴·DRAFT 404 아키텍처 재사용. 신규 타입은 화이트리스트·sitemap 전 계통 수정 필요해 과함. 감독 글은 matchId=null, slug 로 구분.
- **위젯 데이터 = Article.tacticalContext 컬럼 (신설).** content 안 JSON 임베드는 발췌·RSS 누수 위험. 컬럼 추가는 prisma db push 금지 관례 → 사용자가 Neon 에서 한 줄 ALTER 실행. `ALTER TABLE "Article" ADD COLUMN "tacticalContext" TEXT;`
- **본문 생성 모델 = sonnet 고정.** transfer-xi 실증 — haiku 는 웹서치 후 JSON/본문 품질 붕괴. generateWithWebSearch(claude.ts:166) 재사용.
- **첫 배치 = 최종 순위 상위 4팀.** 검수 부담 고려. 스크립트는 20팀 전부 지원(--team 플래그).
- **평균 포지션 좌표 = af grid 시즌 평균 (설계 변경).** 당초 detail 좌표 계획이었으나 백필로 경기별 grid 를 확보 → 주 포메이션 경기의 실배치 평균이 더 정직. detail 은 transfer-xi 전용 유지.

## 2026-07-18 구현 중 실측·결정

- **af grid 방향 실측.** row 1=GK, col 1=왼쪽(칼라피오리 2:1, 팀버 2:4 — 아스널 3경기 교차 확인). flip 불필요.
- **af rateLimit.** 키가 Vultr 수집기와 공유 — 300ms 페이싱은 즉시 429. 2초 페이싱 + 65초 백오프 5회로 380경기 무손실.
- **선발 횟수 이원화.** 좌표·XI 멤버십=주 포메이션 경기 한정(형태 섞임 방지), 표시 선발 수=시즌 전체(주 포메이션만 세면 라야 24회처럼 왜곡 — 실제 37회).
- **현재 시점 파일 ≠ 시즌 시점 함정.** team-coaches/team-squads 는 이번 여름 이적 반영본 — 시즌 후 떠난 인물(펩, 베르나르두 실바)이 없다. 폴백=player-names RAW 사전에 축약형("B. Silva")·감독명 추가 + 성 유일/이니셜 변별 매칭. 시즌 결산 글은 이 한계 전제.
- **generateWithMinLength 가 model 옵션을 드랍하던 버그** 수정(genOpts 복사 누락) — sonnet 고정이 무효였음. 기존 호출자는 model 미사용이라 무영향.
- **월간 잡 라인업 소스 = af 런타임 수집(af-lineup-fetch.ts).** Vercel 런타임은 data/ 쓰기 불가 + 새 시즌은 백필 파일 없음 → 그 달 30~40경기를 in-memory 수집(maxDuration 300).
- **검수 경로.** DRAFT 는 공개 404 — admin/review/[id] 에 대시보드 미리보기 추가로 위젯 포함 검수 가능.
- **배포 순서 (필수).** ① 사용자 Neon: `ALTER TABLE "Article" ADD COLUMN "tacticalContext" TEXT;` ② push 배포. 역순이면 Article 전체 조회가 P2022 로 죽는다(article page 는 include 사용).

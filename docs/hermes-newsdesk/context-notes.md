# 헤르메스 뉴스데스크 — 컨텍스트 노트

## 2026-09-13 결정

- **"뉴스 수집 봇" 대신 "글감 편집장"으로 간다.** 사용자는 처음에 스포츠 뉴스를 가져오는 봇을 제안했으나,
  실측 결과 수집은 이미 충분(14일 4,688건)하고 병목은 재료·발행 게이트였다.
  새 수집 봇은 기존 파이프라인과 중복이고 검증 게이트(출시 당일 철회 사고 후 도입)를 우회한다.
  사용자가 세 후보(글감 편집장·소스 스카우트·품질 검수) 중 글감 편집장을 선택.
- **헤르메스 권한은 읽기 전용.** DB 쓰기·git·배포 없음. 발행은 사용자 승인 후 Claude Code 가 한다.
  근거 — 1인 운영자 prod 안전 원칙(`feedback_sleep_delegation`), 무료 모델 품질 미검증.
- **재료는 에이전트가 아니라 cron `--script` 가 만든다.** 에이전트에게 terminal 도구를 주면
  `~/scorebase/.env.local` 을 읽을 수 있다. 스크립트가 쿼리해서 stdout 으로 넘기면 에이전트는
  DB 자격증명에 닿지 않고, terminal 도구를 꺼도 된다.
- **v1 은 제안서만.** 초안(v2)은 2주 품질 확인 뒤.

## 2026-09-13 실측

- 14일 발행: 축구 61 / 야구·농구·하키 0. 축구 카테고리 TRANSFER 27 · MATCH 11 · CLUB 10 · 기타 13.
- 스킵/리젝 상위: "재료 부족 (60~100자 < 500)" 다수, "검증 불합격(근거 없는 사실)" 13, **"재작성 JSON 파싱 실패" 13** — 별도 버그 후보 (이번 범위 밖).
- 36h 분류 커버리지: 전 항목 note(score) 있음, storyKey 는 약 21%(93/445)만.
- storyKey 클러스터 상위는 실제 큰 이슈 (arsenal-sunderland 6건/3매체, tottenham-everton 3/2,
  mark-stone-vegas-golden-knights 3/2, chris-kreider-canadiens 2/2).
- 노이즈 — NBA.com 굿즈·포스터(score 0), premierleague.com 통계·일정 페이지(score 0~1),
  NFL 기사가 soccer 로 분류된 사례(The Athletic). → 재료 스크립트에서 score·기사 수로 거른다.
- `Team` 은 `name`(영문) + `nameKo` + `league` 보유 → 영문 제목과 매칭 가능.

## 헤르메스 구조 메모

- 프로필 홈 `~/.hermes/profiles/<id>/` — config·.env·SOUL.md·skills·cron·scripts 가 프로필별.
- 명령에 `-p <profile>` 전역 플래그. cron `--script` 는 프로필 홈 `scripts/` 안의 파일만 허용(경로 탈출 차단).
- cron `--continuity` — 직전 실행 결과를 다음 프롬프트에 주입 → 같은 글감 반복 제안 방지에 사용.
- `--deliver local | telegram | bot-chat[:profile]`.
- 헤르메스는 현재 노트북에서만 돈다. 노트북 꺼짐 = cron 미실행. 맥미니 이관은 v3.
- 웹 검색 toolset 은 켜져 있으나 Firecrawl·Tavily 키 없음 — v1 은 웹 검색에 의존하지 않는다.

## 함정 (다음 세션 주의)

- scorebase 맥미니에 동명 봇 `hermes-telegram-bot.js`(토큰 `HERMES_TELEGRAM_TOKEN`)가 있다.
  헤르메스 에이전트와 별개. **그 토큰을 헤르메스 게이트웨이에 재사용하면 폴링 충돌로 기존 봇이 멈춘다.**
- scorebase 워킹트리에 다른 세션의 미추적 파일이 많다. 커밋은 이 폴더·새 스크립트만 경로 지정 add.

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

## 2026-09-13 구축 중 실측

- **`Team.eloRating` 은 전 리그 기본값 1500** (EPL·KBO·LALIGA·MLB·NBA·NHL 비기본값 0건). 실제 Elo 는 예측 코드가
  런타임에 계산한다. 재료에 실었더니 전 팀 "Elo 1위"로 나와 편집장이 틀린 사실을 쓸 뻔했다 → 제외.
  순위·Elo 가 필요하면 발행 단계에서 Claude Code 가 예측 로직으로 뽑는다.
- **cron 은 `platform="cron"` 별도 toolset.** `tools disable` 기본값은 cli 라 cron 실행에는 적용 안 된다.
  `--platform cron` 으로 한 번 더 꺼야 한다. 확인은 프로필 config.yaml 의 `platform_toolsets.cron`.
- 처음엔 `file` 도구를 안 껐다 → 켜져 있으면 에이전트가 `~/scorebase/.env.local` 을 읽을 수 있다. 끔.
- `hermes tools --summary` 는 대화형 터미널 필요. 비대화형 확인은 `tools list` + config.yaml.
- cron `--script` 는 프로필 홈 `scripts/` 기준 파일명만 준다 (`material.sh`).
- 래퍼는 `env -i` 깨끗한 환경에서 검증 — PATH 에 `/usr/local/bin`(node) 포함 필요.
- **이 맥 시간대는 Asia/Ho_Chi_Minh(+07).** cron `0 9 * * *` = KST 11시. 재료 스크립트 날짜 표기는 KST 고정.
- **게이트웨이가 꺼져 있으면 cron 이 발화하지 않는다.** 프로필마다 게이트웨이가 따로 있고
  (`gateway list` → default·newsdesk 둘 다 not running), `gateway migrate --multiplex` 로 default 하나가
  모든 프로필을 서비스하게 묶을 수 있다 (중복 봇 토큰이 있으면 preflight 가 막음).
- 노트북 네트워크가 느린 시간대(구글 3.7초)에 Neon `Can't reach database server` 일시 실패 2회.
  DNS·5432 TCP·운영 /news 200 모두 정상이었고 재시도 1회에 성공 — 코드 문제 아님.
  cron 에서 반복되면 재료 스크립트에 재시도를 넣는다 (지금은 넣지 않음).

## 첫 제안서 (2026-09-13 수동 실행, muse-spark-1.3 free)

- 글감 3 — 아스날 5연승(선덜랜드전), 토트넘·에버튼 0-0 기록 대조, 골든나이츠 마크 스톤 연장.
  제외 5 — 팀 데이터 없음 2, 한국 검색 수요 약함 2, 단일 매체 1. 이유가 모두 SOUL.md 기준과 일치.
- 재료 대조 불일치 0건. 토트넘 "리그 무승·무득점"도 대회명으로 컵 5-1 승을 구분해 맞게 읽음.
- 헤드라인의 계약 금액·발언은 "원문 확인 필요"로 스스로 표시함.
- 서식 문제 1 — URL·검색어 칸 끝에 마침표를 붙여 링크가 깨질 수 있음 → SOUL.md 규칙 추가.

## 2026-09-13 가동

- 사용자 결정 — 게이트웨이는 **하나로 통합**(default 멀티플렉서), 실행 시각은 **KST 09시**(`0 7 * * *`, 맥이 +07).
- `gateway migrate --multiplex --dry-run` 은 "옮길 게이트웨이 없음"만 출력하고 설정을 켜지 않는다.
  직접 `hermes config set gateway.multiplex_profiles true`. 이때 "recognized key 아님" 경고가 뜨지만
  `hermes_cli/gateway.py`(4441줄)·`web_server_cron.py` 가 `gateway.multiplex_profiles` 를 읽는다 → 무시해도 됨.
- 설치 후 로그 `Cron scheduler will tick 2 profile(s) under multiplex: ['default', 'newsdesk']`,
  `No messaging platforms enabled` → 텔레그램 연동 전이라 정상. 오류 0.
- cron `deliver local` 결과는 `~/.hermes/profiles/newsdesk/cron/output/<job_id>/<시각>.md` (프롬프트·재료·응답 전부 포함).
- cron 실행은 34초 (수동 -z 81초). 스케줄러가 앞에 `[SILENT]` 규칙 안내를 자동으로 붙인다.

## cron 첫 제안서 (2026-09-13 12:24, 스케줄러 경로)

- 글감 3 — 아스날 5연승, 토트넘·에버튼 대조, 맨유 원정 앞둔 맨시티 4연승. 제외 5.
- **재료 근거 없는 표현 1건** — 아스날 제목의 "선두". 재료엔 순위가 없고 헤드라인은 "perfect title defence" 뿐.
  수치(연승·무득점·무패·일정)는 전부 일치. → SOUL.md 에 "제목안도 순위·기록 표현은 재료에 값이 있을 때만" 규칙 추가.
- 관찰 — 맨시티 글감은 사실상 **경기 프리뷰**다. 사이트는 EPL PREVIEW 를 이미 자동 생성(noindex)하므로
  겹칠 수 있다. 프리뷰형 글감을 제외할지는 사용자 판단 대기 (SOUL.md 에 아직 반영 안 함).
- 관찰 — 단일 매체(sources=1) 이슈를 NHL 2매체 이슈보다 앞에 뒀다. 이유는 "더비 직전 검색 수요". 기준 3(매체 수)보다
  기준 2(한국 검색 수요)를 우선한 것이라 SOUL.md 순서와는 맞는다.

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

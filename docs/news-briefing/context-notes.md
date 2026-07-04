# 해외 축구 브리핑 — 컨텍스트 노트

> 작업 중 내린 결정과 근거. 다음 세션은 이 파일부터 읽을 것.

## 2026-07-04 초기 설계

- **법적 전제**: 출처 표기해도 무단 전문 번역은 2차적저작물작성권 침해 (대법원 번역 요약물
  유죄 판례, 한국저작권위원회 FAQ 확인). manutd.com 약관도 personal, non-commercial 한정.
  → 방식은 "사실 재구성 + 1문장 이내 인용 + 출처 링크" 로 고정. 이 가드레일을 프롬프트에서
  빼면 안 됨.
- **과거 철회 교훈** (transfer-rumors, 810bbf4): 헤드라인만 보고 haiku 단독 분류 → 오분류
  품질 사고로 출시 당일 철회. 재시도 조건 = 본문 포함 · 상위 모델 · 2단계 검증. 이번 설계는
  세 조건 모두 반영 (본문 fetch, sonnet-5 재작성, 별도 검증 호출로 발행 게이트).
- **게시판 구조**: 이 작업 직전 main 에서 자유게시판이 /analysis 로 통합됨 (64a1e17,
  ?board=free). 브리핑은 세 번째 보드 `?board=briefing`, Post.category="BRIEFING".
  워크트리가 main 보다 97커밋 뒤처져 있어서 origin/main 으로 reset 함 (로컬 유일 커밋
  d4b530b 은 main 4c94c37 과 중복인 일일 데이터 갱신이라 폐기).
- **모델**: 재작성·검증 = claude-sonnet-5 (BRIEFING_MODEL env 로 교체 가능).
  주의 — sonnet-5 는 temperature 등 sampling 파라미터에 400 을 던짐. claude.ts 의
  generate() 에 model 옵션을 추가하면서 "model 지정 시 temperature 미전송" 규칙 적용.
  thinking 은 미전송 시 adaptive 로 자동 동작 → maxTokens 여유(2000) 필요.
- **분류 = haiku 유지**: 뉴스가치 스코어링·클러스터링은 헤드라인+요약으로 충분하고 호출량이
  많아 비용 절감. 품질 게이트는 sonnet 검증 단계가 담당.
- **봇 계정**: "스코어베이스 국제부" (briefing@scorebase.internal, badge=OFFICIAL).
  manager-bot 의 ensureManager 패턴 복제하되 hashPassword(server-only 체인) 대신
  로그인 불가 더미 문자열 사용 — CLI(tsx) 실행 호환 목적.
- **Google News 링크**: news.google.com/rss 의 article URL 은 리다이렉트 래퍼.
  fetch 후 실제 URL 로 풀리면 본문 추출, 안 풀리면 헤드라인+description 만으로 진행하고
  검증 단계가 "사실 부족" 시 REJECTED 처리. Athletic 은 페이월이라 항상 요약 기반.
- **dedup**: NewsBriefing.id = sha1(sourceUrl). RSS 에서 본 모든 항목을 SEEN 으로 기록해
  재분류 방지. 60일 지난 비발행 행은 런마다 정리.
- **발행 캡**: 런당 3건, 일일 12건 (KST 기준 PUBLISHED 카운트). 폭주 방지 + 비용 상한.
- **숨김 경로**: 텔레그램 알림에 /api/admin/briefing-hide?id=..&s=ADMIN_SECRET GET 링크.
  Post 는 delete (댓글 cascade), NewsBriefing 은 HIDDEN 마킹 — 같은 URL 재발행 방지.

## 2026-07-04 구현 중 실측

- **검증 게이트 실효 확인**: DRY 1차 런에서 sonnet 재작성이 헤드라인만으로 '출처 임의 명시',
  '환율 환산 추가', '없는 세부사실 단정'을 저질렀고 검증 단계가 전부 차단함. 프롬프트에
  "빈약한 재료 = 2~3문장 절제" 규칙(7번)과 "매체명은 제공된 소스명만"(8번) 추가 후 통과율 정상화.
- **Google News URL 복원 불가 확정**: 2024+ 신형 인코딩(AU_yqL)이라 base64 에 원 URL 이
  없음. batchexecute 내부 API 우회는 불안정해서 채택 안 함 — gnews 항목은 헤드라인·요약
  기반 짧은 브리핑으로 감. BBC·Sky(direct)만 본문 fetch.
- **haiku 분류 점수 런간 변동 큼** (같은 항목 6→3 등). keep 불리언 무시하고 score>=5 게이트
  + storyKey 48h 재발행 방지로 보완. 발행 임계 조정은 MIN_SCORE 상수.
- **탭로이드 유입 경로**: 기자 검색 피드(로마노·온스타인)는 중계 매체가 제각각 —
  TABLOID_RE 블록리스트로 데일리메일·더선·CaughtOffside 류 차단. 신규 찌라시 발견 시 여기 추가.
- **verify 프롬프트에 소스명 필수**: 원문 자료에 소스명을 안 넣으면 브리핑의 정당한 출처
  표기를 '날조'로 오판해 리젝함.

## 2026-07-04 운영 첫날 보정 (post 648 사후)

- **실명 없는 이적 낚시 헤드라인 차단** (94b576a): 로마노 중계 매체의 "5000만 유로 자원"
  류 낚시 헤드라인 + 구글뉴스 본문 fetch 불가 조합 → "이름 미확인" 브리핑이 발행됨
  (648·640·646, 전부 숨김 처리). 분류 rubric "실명 없는 이적 기사 = score ≤4" +
  검증 기준 6번(TRANSFER 인데 실명 없으면 불합격) 이중 차단. 'here we go' 표기는
  '히위고'로 통일.
- **ADMIN_SECRET 로컬 ≠ Vercel**: .env.local 값으로 prod 숨김 링크 호출하면 401.
  텔레그램 알림 링크는 prod env 로 생성되므로 정상. 로컬에서 수동 숨김이 필요하면
  DB 직접(post delete + briefing HIDDEN)이 빠름. .env.local 동기화는 사용자 결정 대기.
- **Neon 일시 블립 → Vercel 빌드 실패 가능**: 정적 생성 페이지(/value-bets 등)가
  빌드 타임에 DB 를 호출해서, DB 블립 타이밍의 빌드는 실패한다. 배포가 안 뜨면
  GitHub deployments API 로 상태 확인 후 빈 커밋으로 재트리거.

## 함정 (다음 세션 주의)

- vercel.json cron 추가 시 CRON_REGISTRY 등록 필수 (cron-execution-monitor 메모리).
- Post.category 는 String — enum 아님. 목록 쿼리는 category 인덱스 필수.
- 브리핑 보드에서는 글쓰기 버튼·종목 탭·적중률 설명 숨김 (봇 전용 보드).
- Sky Sports RSS 는 12040(뉴스 전체)이 아니라 축구 전용 피드 확인 후 사용.

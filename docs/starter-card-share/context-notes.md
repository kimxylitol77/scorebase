# 선발 매치업 카드 개별 공유 — 컨텍스트 노트

## 요청 해석 (2026-07-29)

`/predictions/starters` 의 카드는 "선수 1명" 이 아니라 **선발 투수 맞대결(경기 1건) 카드**다.
따라서 "선수카드 하나하나 공유" = **카드(=경기) 단위 공유**로 구현한다.

## 결정

1. **단일 카드 페이지를 새로 만든다** (`/predictions/starters/[matchId]`).
   - 이유. 목록 페이지에 `?m=` 쿼리를 쓰면 searchParams 접근으로 페이지가 dynamic 이 되어
     기존 `revalidate = 600` ISR 이 깨진다(메모리 `site-performance-isr`).
   - 단일 페이지는 카드마다 og:image 를 그 카드로 줄 수 있어 카톡·스레드 미리보기가 정확하다.
   - 오늘·내일 한정 임시 페이지라 `robots: noindex` — 얇은 페이지 색인 방지.

2. **공유 버튼은 기존 `ShareCardButton` 재사용**. 새 공유 컴포넌트를 만들지 않았다.
   Web Share → 실패 시 링크 복사, 카드 이미지는 새 탭. 게시판 링크만 옆에 `<Link>` 로 추가.

3. **카드 전체가 `<Link>` 였던 구조를 분리**. 앵커 안에 버튼/앵커를 중첩할 수 없어
   `div(카드) > Link(본문) + 액션 행` 으로 바꿨다. hover 효과는 `group` 으로 이전.

4. **게시판 첨부는 서버에서 조립** (`/community/new?starter={id}`).
   `/lab` 봇 공유(`?bot=`)와 동일 패턴 — 클라이언트가 본문을 만들어 보내면 위조 가능하고
   경기 재선택과 어긋난다. matchId 로 DB 재조회해 제목·본문을 만든다.

5. **OG 이미지의 선수 사진은 data URI 로 인라인**. satori 가 외부 URL 을 직접 못 가져오는
   케이스가 있어 `/api/og/team-of-day-mvp` 의 `toDataUri` 패턴을 그대로 따랐다.
   실패 시 이니셜 원형 fallback (페이지의 `PitcherAvatar` 와 동일한 시각 규칙).

## 데이터 출처

- `Match.homeStarter/awayStarter` JSON — baseball-starters·mlb-starters cron 이 채움.
- 사진 — KBO 네이버 CDN(`kboPhotoUrl`), MLB 공식(`mlbHeadshotUrl`), NPB 는 JSON 의 `photoUrl`.
- AI 승률 — `Match.predHome/predAway` (선발 능력치 반영 모델).

## 함정

- 선발 미정(hs/as 가 null)인 경기가 흔하다. 이름·지표 모두 없을 수 있어 전부 optional 처리.
- OG 라우트는 `runtime = "nodejs"` 필수 (prisma 사용).

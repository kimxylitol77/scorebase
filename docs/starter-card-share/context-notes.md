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

## 선수 사진 잘림 (2026-07-29 수정)

MLB 헤드샷은 213×320 세로 사진이라 원형에 `cover` 로 꽉 채우면 위아래가 잘린다.
가운데 정렬이면 모자가, 위 정렬이면 턱이 잘려 어느 쪽으로도 머리 전체가 안 들어온다
(원형 창 213px < 머리 높이 약 240px).

→ **`contain` + 아래 기준 정렬**로 통일. 사진을 원 지름보다 작게 넣어 머리 전체를 담고,
남는 좌우는 사진 배경(흰·연회색)과 비슷한 `slate-200`(#e2e8f0) 으로 채운다.
카드(`PitcherAvatar`)와 OG 이미지 양쪽 같은 규칙. KBO(94×118)·NPB 처럼 덜 긴 사진도 그대로 통한다.

satori 참고. `objectPosition` 은 먹지만 `overflow:hidden` 은 borderRadius 를 따라 자르지 않아
(자식이 사각형으로 남는다) 원형 마스크는 `img` 자체의 borderRadius 로 해야 한다.

## 투수 개인 카드 (2026-07-29 추가)

- 라우트는 매치업 카드 아래에 `/{home|away}` 를 붙인 형태. 별도 선수 DB 없이
  같은 `Match.homeStarter/awayStarter` JSON 을 쓰므로 수집 파이프라인 변경이 없다.
- `side` 는 home/away 만 허용하고, 선발 미정(이름 없음)이면 404. 얇은 카드 페이지가
  빈 상태로 색인되는 걸 막는다.
- 게시판 프리필은 `?starter={id}&side={side}`. 범용 공유(spath)로 들어와도 경로에서
  `(\d+)/(home|away)` 를 뽑아 같은 프리필이 나온다.
- 목록 카드 진입 (사용자 요청으로 2차 변경). 액션 칩을 늘리는 대신 **카드 안 클릭 영역을 나눴다**.
  - 투수 블록(사진·이름·팀) → 그 투수 개인 카드. "개인 카드 ›" 캡션을 항상 노출(모바일에서도 보이게).
  - 상태 뱃지는 링크 아님, AI 승률 + 지표 블록 → 기존대로 경기 상세(/live).
  - 앵커 중첩 금지라 카드 전체를 감싸던 `<Link>` 를 지표 블록만 감싸도록 쪼갰다.
    카드 아무 데나 눌러도 경기 상세로 가던 동작이 바뀐 것이라, 목록 상단 설명에 한 줄로 안내한다.

## 함정

- 선발 미정(hs/as 가 null)인 경기가 흔하다. 이름·지표 모두 없을 수 있어 전부 optional 처리.
- OG 라우트는 `runtime = "nodejs"` 필수 (prisma 사용).

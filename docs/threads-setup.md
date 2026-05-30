# Threads 자동 포스팅 — 토큰 셋업 가이드

scorebase 콘텐츠(오늘의 경기 카드 · 신규 블로그)를 Instagram **Threads** 에 자동 발행하기 위한
1회성 토큰 발급 절차입니다. 브라우저/Meta 콘솔 작업은 직접 해야 하고, 발급한 값 2개만
워커 `.env` 에 넣으면 이후는 전부 자동(토큰 60일 만료도 워커가 자동 갱신)입니다.

> **결과물 2개**: `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`(long-lived)
> 교환 과정에서 `THREADS_APP_SECRET` 도 잠깐 쓰지만 워커엔 저장하지 않습니다.

---

## 0. 사전 — 전용 Threads 계정 준비 (권장)

자동 글이 개인 피드에 섞이지 않도록 **scorebase 전용 Threads 계정**을 만들어 두는 걸 권장합니다.
(Threads 계정은 같은 이름의 Instagram 계정과 연결됩니다.)

---

## A. Meta 개발자 앱 생성 (Threads use case)

1. https://developers.facebook.com/apps → **앱 만들기**
2. 사용 사례에서 **"Access the Threads API"(Threads use case)** 선택
3. 앱 이름 입력 후 생성 → 대시보드의 **앱 ID** / **앱 시크릿 코드**(App Secret) 확인
   - 앱 시크릿은 D단계 토큰 교환에 잠깐 쓰입니다. 노출 주의.

## B. Threads 계정 연결 + 권한

1. 앱 대시보드 → **Threads** 제품 → **Settings/Use cases**
2. 권한(스코프) 2개 추가:
   - `threads_basic` — 모든 엔드포인트 필수
   - `threads_content_publish` — 글 발행 필수
3. **Threads testers** 또는 계정 연결에서 위 0번의 전용 계정을 추가/연결하고,
   그 계정으로 Threads 앱에서 초대 수락.

## C. Short-lived 토큰 발급 (1시간짜리)

가장 간단한 방법은 앱 대시보드에서 직접 생성하는 것입니다.

- 앱 대시보드 → Threads → **"Generate access token"**(계정 선택 후 권한 동의)
- 발급된 토큰을 복사 → 아래 `SHORT` 로 사용. (유효 1시간이라 D단계를 바로 진행)

> Graph API Explorer(https://developers.facebook.com/tools/explorer/)에서
> 앱·`threads_basic`·`threads_content_publish` 선택 후 토큰을 생성해도 됩니다.

## D. Long-lived 토큰으로 교환 (60일)

터미널에서 (값 3개 치환):

```bash
SHORT="여기에_short_lived_토큰"
APP_SECRET="여기에_앱_시크릿"

curl -s "https://graph.threads.net/access_token\
?grant_type=th_exchange_token\
&client_secret=$APP_SECRET\
&access_token=$SHORT"
```

응답의 `access_token` 이 **long-lived(60일)** 토큰 → 이게 `THREADS_ACCESS_TOKEN`.

```json
{ "access_token": "THAAB...", "token_type": "bearer", "expires_in": 5183944 }
```

## E. 내 Threads user id 확인

```bash
LONG="여기에_long_lived_토큰"

curl -s "https://graph.threads.net/v1.0/me?fields=id,username&access_token=$LONG"
```

응답의 `id` 가 `THREADS_USER_ID`.

```json
{ "id": "17841400000000000", "username": "scorebase" }
```

---

## F. 워커에 입력 + 테스트

Mac mini 워커 디렉토리(`~/dev/scorebase/mac-mini-worker`)의 `.env` 에:

```bash
THREADS_USER_ID=17841400000000000
THREADS_ACCESS_TOKEN=THAAB...   # D단계 long-lived 토큰
```

1) **dry-run** (실제 발행 없이 caption/이미지 URL 만 확인):

```bash
cd ~/dev/scorebase/mac-mini-worker
THREADS_DRY_RUN=1 node threads-auto-poster.js
```

2) 출력이 정상이면 **실발행 1건** 테스트:

```bash
node threads-auto-poster.js   # 한 사이클 돌며 큐에 있는 항목 발행 → Ctrl+C
```

Threads 앱에서 글 1개 확인 → 같은 항목은 재실행해도 다시 안 올라옵니다(중복 방지).

## G. 자동 운영 등록 (launchd)

```bash
cd ~/dev/scorebase/mac-mini-worker/launchd
bash install.sh          # threads-auto-poster 포함 8 봇 등록
tail -f /tmp/threads-auto-poster.log
```

---

## 동작 요약 / 운영 메모

| 항목 | 동작 |
|---|---|
| **토큰 갱신** | 워커가 하루 1회 자동 refresh. 갱신값은 `threads-token.json` 에 저장(.env 값은 최초 부트스트랩용). 60일 안에 한 번이라도 돌면 무한 연장. |
| **발행 주기** | 30분마다 큐 조회. 올릴 게 없으면 조용히 패스. |
| **오늘의 경기** | 매일 KST 08:00 이후 그날 1회. 시각 변경은 **Vercel 환경변수** `THREADS_DAILY_HOUR`(0~23). |
| **블로그** | 최근 48시간 내 발행된 새 글 자동 공유(한 사이클 최대 2건). |
| **중복 방지** | 발행 이력을 DB(`ThreadsPost`)에 기록 → 같은 콘텐츠 재발행 차단. |
| **rate limit** | Threads 250 포스트/24h. 본 워커는 하루 수 건이라 여유. |

## 트러블슈팅

- **`(#10) ... permission`** → B단계 권한(`threads_content_publish`) 미승인 또는 계정 미연결.
- **이미지가 안 붙음** → `image_url` 이 외부에서 열려야 함. `https://www.scorebase.kr/api/og/daily?d=YYYY-MM-DD` 를 브라우저로 직접 열어 확인.
- **토큰 만료** → 60일 넘게 워커가 안 돌면 만료. D단계부터 재발급 후 `.env` 갱신 + `threads-token.json` 삭제.
- **로그** → `tail -f /tmp/threads-auto-poster.log`

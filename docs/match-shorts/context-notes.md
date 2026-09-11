# 컨텍스트 노트 — match-shorts

- 09-11 탐색 결과(Explore 에이전트 + 실측): RECAP cron 은 73a88ad(05-23)에서 제거됨. CLAUDE.md 의 "07:00 RECAP" 표기는 stale.
- TheStatsAPI 경로: `/football/competitions/{comp}/seasons`(is_current), `/football/matches?competition_id&season_id&date_from&date_to`, `/football/matches/{id}` (`xg_available`, `live`), `/football/matches/{id}/shotmap`. 26/27 시즌 id: LaLiga sn_8407970, Bundesliga sn_0835912 (나머지는 seasons 로 조회).
- 429 대응은 build-match-shotmaps.ts 의 api() 재시도 패턴 재사용.
- 샷 좌표계: x 0~105(공격 방향 기준 골라인까지 거리로 보임, 9=근거리), y 0~68. SoccerShotMap.tsx 의 shotX() 변환 로직을 그대로 옮긴다.
- 맥미니 node 는 /opt/homebrew/bin/node (plist 는 /usr/local/bin/node 심링크 사용).
- 유튜브 토큰은 MacBook .env.local 에만 있음 → 맥미니 .env 에 사용자가 복사해야 함(내가 읽지 않는다).
- 09-11 빌더 실측: toKoreanPlayerName 은 사전에 없으면 원문을 그대로 반환(빈 문자열 아님) → 한글 포함 여부로 판정해야 함. 미매핑은 haiku 1콜 일괄 음역(탭 구분 출력, 15/15 성공).
- 인사이트 게이트: 브리핑 숫자만 허용하면 "1골 차" 의 1 까지 막힘 → 스코어 차·골 수·0~3·xG 차를 허용 집합에 추가. 문장 길이 48자는 haiku 에 빡빡 → 64자.
- 맥미니 쇼츠 프로젝트 경로는 ~/dev/scorebase-shorts (MacBook 은 ~/scorebase-shorts) → 봇이 SHORTS_DIR 로 빌더에 전달. scorebase-shorts 는 git 이 아니라 rsync 로 배포(--exclude node_modules out .git).
- 맥미니에 ffmpeg 9.0.1(brew)·Remotion 4.0.482·chrome-headless-shell 설치 완료. 필요 env 4종(THESTATSAPI_KEY·GSC_OAUTH_*·YOUTUBE_REFRESH_TOKEN)은 MacBook process.env → ssh stdin 으로 복사(값 미노출), .env.local.bak-20260911 백업.
- bot-registry 에 mac-mini-match-shorts(5분) 등록 → Vercel heartbeat-check 가 이 봇을 기대하므로 launchd 설치 전까지 "누락" 알림 가능.
- 09-11 21:32 KST launchd 가동. 맥미니엔 /usr/local/bin/node 없음(EX_CONFIG 78) → plist 는 /opt/homebrew/bin/node. 첫 E2E 는 Neon 순간 연결 실패 2회 → DB 호출 3회 재시도 추가 후 통과(빌드+렌더 37초).
- 결정(내가 내림, 사용자 미확인): 렌더 호스트=맥미니, 발행=FT 직후 비공개 업로드+텔레그램(검수 후 MATCH_SHORTS_PRIVACY=public), 히트맵 v1 제외, 상한 리그당 1편/일.

# 컨텍스트 노트
- 09-28 TTS 비교: Hana(여) 6.7초, Julian(남) 8.3초 — Julian 은 "라이브스코어/스코어베이스"를 영어식(Live Score/ScoreBase)으로 읽음 → Hana 채택.
- OpenAI Whisper 크레딧 소진 → 로컬 faster-whisper(scratchpad/fw-venv, small int8) 로 단어 타이밍.
- 이전 가이드 영상(SiteGuide.tsx, 08-16) 숫자는 낡았으므로 전부 재측정.
- 실측(09-28): DB 대회 232·경기 68,186·이적 132,885·몸값 15,342 / 성적표 페이지 채점 39,568·선두 스코어베이스 58.4%(3896/6676)·GPT-5.6·Kimi K3 58.1% / 고확신 71.6%(8,998픽, 더블찬스 73.7·승부 73.7·핸디캡 70.3·오버언더 70.0) / 선수스탯 규정 220명 / 빅딜 1위 엔소 페르난데스 €145M.
- /predictions 는 "AI별 픽 목록"이 아니라 시즌 예측(Elo+Monte Carlo 5,000회) 페이지 → AI끼리 비교 화면은 경기 상세(/live/{league}/{id})의 "AI 예측 대결"로 대본 교정.
- 캡처 = 헤드리스 크롬 --force-dark-mode, 1440×2400 @1.5x. 12개 동시 실행하면 대부분 실패 → 3개씩. 크롬이 스크린샷 후 안 죽어서 파일 생기면 kill.
- TTS 함정: seed_audio 동시 10건 안팎에서 429 → 5~6건씩. 63번은 끝에 영어 헛소리 2초가 붙어 나옴, 21·44번 앞부분 뭉개짐 → faster-whisper 대조로 발견해 재생성. 영문 약어·숫자는 say 필드에서 한글 읽기로 치환(에이아이·지피티·오십팔 점 사 퍼센트).
- 자막 하이라이트 = whisper 단어 시각을 "읽는 길이 가중치"(한글1·숫자1.4·%3·소수점1·영문0.9) 누적 비율로 자막 단어에 매핑. 글자 수만 쓰면 58.4% 같은 숫자에서 어긋남.
- 재생성: python3 data/site-map-guide.script.py → (TTS) → data/site-map-guide.build.py → remotion render SiteMapGuide.

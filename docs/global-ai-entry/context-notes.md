# 글로벌 AI 챗 진입점 — 컨텍스트 노트 (2026-09-13)

Dimers Dimebot 벤치마크 2번. 사용자 승인("승인 진행해") 후 착수.

- **챗봇은 이미 교차 경기 질의를 처리한다.** 전역 Chatbot 의 tools 에 get_top_picks·get_today_matches·get_xg_matchups·get_league_leaders 등이 있어 "오늘 고확신 픽 뭐야?"·"KBO 오버 값 경기" 류가 됨. 빠진 건 헤더 진입점뿐.
- 열림 상태가 컴포넌트 내부라 밖에서 열 길이 없었다 → `lib/open-chat-event.ts` 의 window 이벤트 `scorebase:open-chat` 하나. 전역 `Chatbot.tsx`(사용자 영역 — 리스너 9줄 + 프리셋 1줄만, 승인 범위)와 경기 전용 `live/MatchChat.tsx`(경기 상세에선 전역이 비켜 있음) 둘 다 듣는다.
- 헤더: `components/AskAiButton.tsx`(client). 데스크톱은 검색 아이콘 왼쪽 아이콘+라벨(xl 이상만 라벨), 모바일 메뉴는 라이브 스코어 아래 보라 버튼(메뉴 닫고 연다). 헤더 자체는 서버 컴포넌트라 버튼만 분리.
- 예시 칩은 챗봇에 이미 있던 SUGGESTIONS 를 그대로 쓰고 "오늘 고확신 픽 뭐야?"를 맨 앞에 추가. 별도 칩 UI 를 헤더에 만들지 않음(중복).
- lint `set-state-in-effect` 오류는 MatchChat 기존 코드(main 81행)라 이번 변경과 무관.
- **2026-09-13 오후 — 헤더 우측 버튼 철회.** 헤더는 이미 꽉 차 있어 버튼이 얹히자 우측 묶음이 메뉴 위로 올라탔다(관리자 1280px 211px·비로그인 1280px 약 90px 겹침 실측). 로그인 배지+ADMIN 만으로도 6xl 안에 안 들어가던 상태(92px)라 함께 손봄: 데스크톱 진입점은 「AI 분석실」 드롭다운 첫 항목(`nav-config` `action:"open-chat"` → `NavDropdown` 이 버튼으로 렌더), 모바일 메뉴 버튼은 유지, 헤더 폭 7xl, 데스크톱 메뉴는 xl(1280) 부터·넓은 간격은 2xl 부터. `AskAiButton` 은 모바일 전용으로 축소.

# 하키 경기 페이지 게임센터 개편 (2026-09-30)

사용자: "다른 하키 전문 웹사이트 보고 우리도 디자인좀 하자 ui 너무 안이뻐".
벤치마크: ESPN gamecast(Stars of the Game·Scoring Summary·Team Stats), NHL.com gamecenter(Three Stars 사진 카드·골 카드·팀 색 막대).

만들 것 — TheSports detailLive 가 있는 하키 경기(LIVE/종료)에 `HockeyGameCenter` 한 묶음:
1. 오늘의 3스타 — 자체 평점 상위 3명, 사진·포지션·골/도움·평점
2. 득점 요약 — 1P·2P·3P·OT 구획, 골 카드(사진·득점자·도움·시각·스코어 칩·팀 로고)
3. 팀 기록 비교 — 팀 색 막대(유효슛·페이스오프·히트·블록·페널티 시간·턴오버·가로채기)
4. 선수 기록 — 팀 탭(로고) + 공격수/수비수/골리 구획

배치: 점수판·피리어드 표 바로 아래(SportLiveDetail 슬롯). 하단의 옛 골 타임라인·박스스코어는 이리로 옮기고,
ESPN 팀 STATS(PP% 0.0 만 뜨던 것)·양 팀 주요 선수(영문 라벨)는 게임센터가 있을 때 숨긴다.

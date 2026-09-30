# 컨텍스트 노트
- 2026-09-30 사용자가 3안 중 2번(SNS 임베드) 선택. 1번(회원 업로드)·3번(자체 영수증 카드)은 보류.
- 스크립트(embed.js·widgets.js) 대신 iframe 직결. script-src 를 넓히지 않으려는 선택. 대가는 높이 자동 맞춤을 postMessage 로 직접 받아야 한다는 것.
- 저장은 새 테이블. 기존 테이블 ALTER 가 아니라 CREATE 라 락 위험이 작지만 prod-ddl-lock-incident 규칙대로 lock_timeout 을 건다.
- 사설 토토 홍보 글은 등록 금지. 관리자 화면에 안내문을 둔다(합법 스포츠토토·프로토 투표권만).
- 높이 알림 형식 실측(2026-09-30). 인스타그램 = JSON 문자열 {type:"MEASURE",details:{height}}, X = {"twttr.embed":{method:"twttr.private.resize",params:[{height}]}}, Threads = 숫자 문자열("176")만.
- 세 플랫폼 모두 curl 로 받으면 X-Frame-Options: DENY 가 붙지만 브라우저 iframe 요청(Sec-Fetch-Dest: iframe)에는 안 붙는다. curl 결과로 "임베드 불가" 판정하지 말 것.
- 숨겨진 탭(화면에 안 그려지는 상태)에서는 높이 알림이 안 온다. 테스트는 스크린샷으로 페인트를 일으킨 뒤 읽어야 한다.
- 페이지는 noindex. 본문이 전부 외부 iframe 이라 색인 가치가 없고 얇은 페이지로 잡힐 수 있다.
- X 글 번호는 5자리 이상만 허용(파서). 없는 글·비공개 글은 플랫폼이 "사용할 수 없음" 카드를 그린다.

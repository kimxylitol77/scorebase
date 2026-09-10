# 컨텍스트 노트
## 2026-09-10 시작
- MatchVote 는 DDL 파일이 repo 에 없다(과거 ad-hoc). 이번 ALTER 는 prisma/sql 에 남긴다. 현재 727행·회원 26명.
- 유니크 교체는 DROP INDEX → CREATE UNIQUE INDEX 순서. Prisma 복합 유니크 입력명이 `matchId_userId_market` 로 바뀌므로 upsert where 도 같이 바뀐다.
- 핸디캡 라인 부호 규약은 markets.ts handicapCorrect 그대로(line 양수, HOME=홈 −line). 화면 라벨은 "홈 −1.5 / 원정 +1.5".
- OddsSnapshot 에 hc/ou 배당이 없어 CLV·수익 시뮬은 1X2 표만 계속 집계한다(다른 시장 pickOdds 는 저장은 하되 CLV null).

## 구현·검증 (같은 날)
- DDL 은 배포 전에 먼저 실행했다. 옛 코드의 upsert 는 SELECT 후 INSERT/UPDATE 라 (matchId,userId) 유니크가 사라져도 중복을 만들지 않고, 새 코드는 `market` 컬럼이 있어야 돌아가므로 이 순서가 안전하다. 727행 전부 market='1X2' 로 자동 분류됨.
- **useClientValue 함정 재발**: localStorage 픽 3개를 객체로 돌려주자 "getSnapshot should be cached" 무한 루프로 /picks 전체가 에러 바운더리에 걸렸다(scores-ux-tier3 메모리와 같은 원인). 문자열 하나로 합쳐 읽고 split 하는 방식으로 해결. getSnapshot 은 원시값만.
- dev 서버를 preview_start 로 띄우면 홈("/")부터 열려 커넥션 풀을 다 먹는다 → /picks 첫 렌더가 풀 타임아웃으로 500. 몇 초 뒤 재시도로 정상. 검증 뒤 즉시 서버 종료.
- API 실측(NPB 13045): HANDICAP away(line 1.5, 배당 2.40)·OU over→under 변경(line 7, 1.94)·1X2 home 각각 독립 upsert, HANDICAP 에 draw 는 400. 라인은 시장 배당선(oddsHcLine 1.5·oddsTotalLine 7) 우선 적용됨. 테스트 행 삭제.
- 채점 잡 1회 실행: 종료 4경기·투표 4건 채점·CLV 4. 푸시(라인 정확 일치)는 correct null 로 남는다 — 매 실행 다시 스캔되므로 늘어나면 `take: 300` 창을 갉아먹는다. 후속: 푸시 표시 컬럼 또는 채점 시각 컬럼.
- 랭킹은 전 시장 합산 그대로(3표 게이트도 그대로). 아바타는 resolveAvatar(1등급 = 루키 기본 프사)·등급은 displayGrade 로 experts 와 같은 규칙.

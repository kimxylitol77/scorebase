# Team.nameKo 컨텍스트 노트

작업 중 내린 결정과 근거. 다음 세션이 다시 도출하지 않도록 기록.

## 2026-07-12 설계 결정

- **잠금 파일 없음 (선수와 다름).** 선수는 DB nameKo 가 정본이라 봇 덮어쓰기를 막는 잠금(player-ko-locks.json)이 필요했다.
  팀은 team-names.ts 사전이 표시 단계에서 항상 이기므로 잠금이 불필요. 규칙 하나로 정리.
  "팀 표기 교정은 무조건 team-names.ts 에" — DB nameKo 는 TheSports 공식의 미러일 뿐(봇이 매일 덮어씀, 멱등).
- **표시 우선순위.** 사전 hit > Team.nameKo > mmaFighter.nameKo(UFC) > 영문 원본.
  사전이 이기는 이유. 사람이 큐레이션한 축약형(토트넘)이 공식 풀네임보다 UI 에 맞고, repo 에 있어 리뷰/롤백 가능.
- **위키는 파이프라인에 안 넣음.** 메이저 리그는 사전이 이미 커버(사람 큐레이션 = 사실상 위키 표준 반영).
  위키는 신규 표기 검수할 때 참고 기준으로만. 실측에서 TheSports 표기 편차 확인됨(볼튼↔볼턴, 알비언↔앨비언).
- **ts id → Team 매핑 두 경로.** TeamSourceId(source='thesports', externalId=raw id) 2242건 +
  Team.externalId='ts-<id>' 직행 183건(마이너 리그, 딱 영문 노출 구간). apply 스크립트가 둘 다 처리.
- **팀명 정규화는 선수와 다름.** 선수 normalize 는 라틴 문자 전부 거부하지만 팀명은 "SC 브레겐츠", "FC 바커" 처럼
  라틴 접두가 정상. 한글 포함 여부만 요구.
- **범위 = 축구만.** language/list 는 /v1/football/ 하위. 야구/농구 팀은 사전이 이미 커버.
- **맥미니 봇 고장 발견.** daily-official-korean.sh 의 WORKER=15.164.60.238 은 7/10 삭제된 Lightsail.
  7/10(Neon 순단)·7/11·7/12(ssh timeout) 3일 연속 실패 중. Vultr(root@64.176.230.240)로 교체하면서 팀 단계 추가.
  Vultr env 는 /home/ubuntu/.env (fetch 스크립트가 소싱하는 경로 그대로 존재, 수정 불필요).
  맥미니→Vultr ssh 키 미등록 상태라 맥미니 pubkey 를 Vultr authorized_keys 에 추가 필요.
- **/scores 통합 지점.** page.tsx 의 homeNameKo/awayNameKo 조립부(기존 mmaFighter?.nameKo 체인 자리).
  나머지 toKoreanTeamName 호출 466곳은 안 건드림 — Team row 가 없는 곳이 대부분이고, 사전 miss 시 영문 그대로라는
  기존 동작이 유지되므로 회귀 없음. 다른 표면(순위표 등)은 후속에서 같은 체인 적용.

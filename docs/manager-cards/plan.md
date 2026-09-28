# 감독 기록 그림 카드

## 왜
이달의 감독·감독 전술 글에 그림이 부족하다. 몇 경기 몇 승, 리그 순위 같은 감독 기록을 한눈에 보는 카드가 필요하다(사용자 요청 2026-09-28).

## 무엇
`/api/og/manager-card?id=<글 번호>&kind=hero|ring|form|rivals|fut|pizza|bump|dumbbell|poster&theme=club|dark|light` — 1080×1350 PNG.
수치는 글에 저장된 집계(`Article.tacticalContext`)와 같은 DB 경기에서 읽어 본문과 어긋나지 않게 한다.

## 참고한 방식 (깃허브)
- vercel/satori — 이미 주간 리뷰 카드에 쓰는 엔진. 공개 갤러리(discussion #173)의 인물 히어로 구성.
- anuraghazra/github-readme-stats — 원형 등급 링 + 기록 목록, 테마 팔레트를 값으로 분리.
- andrewRowlinson/mplsoccer — 비교 막대·기준선 표기, 갤러리의 pizza plot·bumpy chart.
- harshkrishna17/Football-Data-Visualizations — dumbbell chart(기대 대비 실제), bump chart.
- FUT 카드 생성기류(Alizadekh/Fut-Card-Generator 등) — 방패 모양·종합 점수·능력치 6칸 구성.
- wei/socialify — 사선 무늬 배경(포스터형).
- jaredv24/golf-stat-cards — next/og 로 스탯 카드를 서버 렌더하는 같은 구조의 선례.

## 단계
1. 데이터 로더 → 검증: 9월 맨시티 값이 글 본문과 일치
2. 카드 4종 × 테마 3종 → 검증: 로컬 렌더 PNG 육안
3. 샘플 PNG 보관(`docs/manager-cards/samples/`) → 사용자 선택
4. (선택 후) 글 본문 삽입·이미지 색인 배선

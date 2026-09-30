# SNS 인증샷 임베드 (/community/proof)

## 무엇을 왜
- 사용자가 "종이 토토 구매 영수증 사진"을 사이트에 보여 주고 싶어 한다.
- 남의 사진을 복사해 싣는 건 저작권·바코드 노출 문제로 하지 않는다.
- 대신 인스타그램·X·Threads 공개 글을 공식 임베드(iframe)로 붙인다. 사진은 원 플랫폼이 서빙하고 우리는 주소만 저장한다.

## 구성
1. `SnsEmbed` 테이블 — 운영자가 고른 글 주소·메모·숨김 여부.
2. `src/lib/sns-embed.ts` — 주소 → 플랫폼·임베드 주소 파서(허용 3종만).
3. `src/components/community/SnsEmbedFrame.tsx` — iframe + 높이 자동 맞춤(postMessage).
4. `/community/proof` — 공개 모음 페이지. BoardTabs 에 "인증샷" 탭.
5. `/admin/sns-embeds` — 주소 붙여 넣어 등록·숨김·삭제.
6. CSP `frame-src` 에 3개 플랫폼 임베드 출처 추가. 외부 스크립트는 넣지 않는다.

## 검증
1. 파서 단위 테스트 통과.
2. 로컬에서 3개 플랫폼 글이 실제로 그려지는지 브라우저 확인.
3. tsc 통과.

# 컨텍스트 노트
- 09-29 Supabase 프로젝트 도메인 NXDOMAIN(삭제/정지) → 공개 URL 용도로 못 씀.
- 사이트 /api/file/[id] 는 Vercel 함수 응답 4.5MB 한도 → 게시판처럼 720p 4MB 압축본만 가능, 릴스 화질 부족 → Vercel Blob 선택.
- Vultr 워커엔 웹서버 없음(HTTP 미응답).
- Blob 은 REST 직접 호출(x-api-version 7) — @vercel/blob 의존성 추가 안 함(로컬 repo 가 origin 과 갈라져 lockfile 변경 회피).

"use client";
// 외부 사이트 iframe 임베드(bmtv24 등 스코어보드.kr 프레임)에서 로그인·가입 링크를 새 탭으로 연다.
// 구글 OAuth(accounts.google.com)는 X-Frame-Options 로 iframe 로드를 거부해, 프레임 안에서
// 가입 버튼을 누르면 화면이 그대로 멈춘다 → 본 도메인(www.scorebase.kr) 새 창에서 가입시킨다.
import { useEffect } from "react";

// 프레임 안에서 가로챌 경로 — 로그인·가입 진입점과 구글 OAuth 시작 라우트.
const AUTH_PATHS = ["/login", "/signup", "/api/auth/google"];

// 세션 쿠키·구글 redirect_uri 가 등록된 본 도메인. 한글 도메인에서 눌러도 여기로 보낸다.
const MAIN_ORIGIN = "https://www.scorebase.kr";

export default function EmbedAuthLinks() {
  useEffect(() => {
    let framed: boolean;
    try {
      framed = window.self !== window.top;
    } catch {
      framed = true; // cross-origin 이라 top 접근이 거부됐다 = 프레임 안
    }
    if (!framed) return;

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank") return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const hit = AUTH_PATHS.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`));
      if (!hit) return;

      const win = window.open(`${MAIN_ORIGIN}${url.pathname}${url.search}`, "_blank", "noopener");
      if (!win) return; // 팝업이 차단되면 기존 동작(프레임 내 이동)을 그대로 둔다
      e.preventDefault();
      e.stopPropagation(); // capture 단계 — next/link 의 클라 라우팅까지 차단
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

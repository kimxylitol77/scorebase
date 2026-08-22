"use client";
// 반응형(sm:/md:/lg:) 유틸이 실제로 먹는지 브라우저에서 자가 검사하고, 안 먹으면 그 자리에서 고치는 전역 가드.
//
// 왜. 일부 윈도우 PC 환경에서 Tailwind 의 `sm:flex-row` 같은 브레이크포인트 규칙이 같은 속성의
// 기본 유틸(`flex-col`)을 못 덮어 레이아웃이 세로로 쌓이는 사고가 두 번 났다(2026-08-16 grid,
// 08-22 flex-row, 둘 다 /odds?sport=betman). 운영 CSS 는 스펙상 정상이고 원인은 그쪽 환경(확장
// 프로그램 추정)이라 개발 환경에서 재현이 안 된다 — 그래서 늘 사용자 눈으로 발견됐다. 이 가드는
// 페이지마다 손대는 대신, 깨진 그 환경에서 직접 재고 직접 고친다.
//
// 동작.
// 1. 탐침: 숨은 요소에 `flex flex-col sm:flex-row` / `flex sm:grid` / `hidden sm:block` 등을 붙이고
//    현재 폭에서 매칭되는 브레이크포인트의 규칙이 실제 computed style 에 반영됐는지 본다.
// 2. 하나라도 틀리면 "복구": 같은 출처 스타일시트에서 반응형 변형(.sm\:…·.md\:…·.lg\:…·.xl\:…·
//    .2xl\:…·.max-*) 규칙을 전부 읽어 `!important` 를 붙인 **레이어 밖** <style> 로 다시 주입한다.
//    Tailwind 4 유틸은 @layer 안에 있어 외부 주입 스타일에 항상 지는데, 레이어 밖 + !important 는
//    그보다 세다. 열거가 아니라 실제 규칙을 복사하므로 임의값(grid-cols-[…])도 그대로 따라온다.
// 3. 세션당 1회 /api/track/error 에 layout 비콘 — 어느 환경에서 얼마나 나는지 운영진이 본다.
//
// 정상 환경에서는 탐침 한 번(수 ms)으로 끝나고 아무것도 주입하지 않는다.
import { useEffect } from "react";

const BREAKPOINTS: Array<[string, string]> = [
  ["sm", "(min-width: 40rem)"],
  ["md", "(min-width: 48rem)"],
  ["lg", "(min-width: 64rem)"],
];

// [클래스들, 검사 속성, 기대값] — 기본 유틸을 브레이크포인트 유틸이 덮어야만 맞는 조합.
const PROBES = (bp: string): Array<[string, string, string]> => [
  [`flex flex-col ${bp}:flex-row`, "flexDirection", "row"],
  [`flex ${bp}:grid`, "display", "grid"],
  [`hidden ${bp}:block`, "display", "block"],
  [`block ${bp}:hidden`, "display", "none"],
];

const RESPONSIVE_SELECTOR = /\.(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl)\\:/;
const STYLE_ID = "sb-responsive-repair";

function probe(): string[] {
  const failed: string[] = [];
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;";
  document.body.appendChild(host);
  try {
    for (const [bp, query] of BREAKPOINTS) {
      if (!window.matchMedia(query).matches) continue;
      for (const [cls, prop, want] of PROBES(bp)) {
        const el = document.createElement("div");
        el.className = cls;
        host.appendChild(el);
        const got = (getComputedStyle(el) as unknown as Record<string, string>)[prop];
        if (got !== want) failed.push(`${cls}→${prop}=${got}`);
      }
    }
  } finally {
    host.remove();
  }
  return failed;
}

/** 스타일시트 트리를 걷어 반응형 규칙을 (미디어 조건, 셀렉터, 선언) 으로 뽑는다. */
function collectResponsiveRules(): string {
  const out: string[] = [];
  const walk = (rules: CSSRuleList, media: string[]) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSMediaRule) {
        walk(r.cssRules, [...media, r.conditionText]);
      } else if (typeof CSSLayerBlockRule !== "undefined" && r instanceof CSSLayerBlockRule) {
        walk(r.cssRules, media);
      } else if (r instanceof CSSSupportsRule) {
        walk(r.cssRules, media);
      } else if (r instanceof CSSStyleRule && RESPONSIVE_SELECTOR.test(r.selectorText)) {
        const decls: string[] = [];
        for (let i = 0; i < r.style.length; i++) {
          const p = r.style[i]!;
          decls.push(`${p}:${r.style.getPropertyValue(p)} !important`);
        }
        if (!decls.length) continue;
        let css = `${r.selectorText}{${decls.join(";")}}`;
        for (let i = media.length - 1; i >= 0; i--) css = `@media ${media[i]}{${css}}`;
        out.push(css);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    // 우리 빌드 CSS(/_next/…)만. 확장프로그램이 끼워 넣은 <style> 이나 외부 시트까지 복사하면
    // 간섭 규칙에 !important 를 붙여 주는 꼴이 된다(테스트에서 실제로 그렇게 됐다).
    if (!sheet.href || !sheet.href.startsWith(location.origin + "/_next/")) continue;
    try {
      walk(sheet.cssRules, []);
    } catch {
      // 읽기 실패는 건너뛴다
    }
  }
  return out.join("\n");
}

export default function ResponsiveGuard() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      try {
        if (navigator.webdriver || /HeadlessChrome|bot|spider|crawl/i.test(navigator.userAgent)) return;
        const failed = probe();
        if (!failed.length) return;
        if (!document.getElementById(STYLE_ID)) {
          const css = collectResponsiveRules();
          if (css) {
            const st = document.createElement("style");
            st.id = STYLE_ID;
            st.textContent = css;
            document.head.appendChild(st);
          }
          // 복구 뒤 재탐침 — 비콘에 "고쳐졌는지"까지 싣는다.
          const after = probe();
          if (!sessionStorage.getItem("responsive-guard-sent")) {
            sessionStorage.setItem("responsive-guard-sent", "1");
            fetch("/api/track/error", {
              method: "POST",
              keepalive: true,
              body: JSON.stringify({
                kind: "layout",
                path: location.pathname + location.search,
                message: `responsive-dropout ${failed.join(", ")} · repaired=${after.length === 0} · ${innerWidth}px · ${navigator.userAgent.slice(0, 160)}`,
              }),
            }).catch(() => {});
          }
        }
      } catch {
        // 가드가 화면을 깨면 안 된다
      }
    };
    // 스타일시트가 전부 적용된 뒤 측정. 창 크기 변경 시 다른 브레이크포인트도 재검사.
    timer = setTimeout(run, 800);
    const onResize = () => {
      clearTimeout(timer);
      timer = setTimeout(run, 300);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return null;
}

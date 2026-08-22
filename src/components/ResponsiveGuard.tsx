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
// 3. 그래도 안 고쳐지면(간섭이 자기 스타일을 맨 뒤에 다시 붙이거나 user-origin 이라 author 보다 센 경우)
//    **인라인 !important** 로 간다.
//    깨진 브레이크포인트 클래스를 가진 요소를 찾아 `el.style.setProperty(prop, val, "important")`.
//    인라인 important 는 어떤 author 규칙보다 세다. 동적으로 생기는 요소는 MutationObserver 로 따라가고,
//    창이 좁아져 브레이크포인트가 풀리면 되돌린다. 같은 속성의 더 큰 브레이크포인트 클래스가 있으면 건너뛴다.
// 4. 세션당 1회 /api/track/error 에 layout 비콘 — 어느 환경에서 얼마나 나는지·어느 단계에서 고쳐졌는지.
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

// 인라인 강제용 — computed 속성명 → CSS 속성명, 같은 속성군 클래스 접두(더 큰 브레이크포인트 충돌 검사용)
const PROP_META: Record<string, { css: string; family: string[] }> = {
  flexDirection: { css: "flex-direction", family: ["flex-row", "flex-col", "flex-row-reverse", "flex-col-reverse"] },
  display: { css: "display", family: ["block", "hidden", "flex", "grid", "inline", "inline-block", "inline-flex", "contents", "table"] },
};

type Enforce = { bp: string; query: string; token: string; prop: string; css: string; value: string };
const active: Enforce[] = [];
let observer: MutationObserver | null = null;

/** 깨진 탐침 → 강제 항목. 탐침 클래스 중 ':' 가 든 토큰이 브레이크포인트 유틸이다. */
function toEnforce(failed: string[]): Enforce[] {
  const out: Enforce[] = [];
  for (const f of failed) {
    const cls = f.split("→")[0]!;
    const token = cls.split(" ").find((t) => t.includes(":"));
    if (!token) continue;
    const bp = token.split(":")[0]!;
    const query = BREAKPOINTS.find(([b]) => b === bp)?.[1];
    if (!query) continue;
    for (const [pc, prop, want] of PROBES(bp)) {
      if (pc !== cls) continue;
      const meta = PROP_META[prop];
      if (meta && !out.some((e) => e.token === token)) out.push({ bp, query, token, prop, css: meta.css, value: want });
    }
  }
  return out;
}

/** 활성 강제 항목을 현재 DOM·현재 폭에 적용(또는 해제). */
function applyEnforce() {
  for (const e of active) {
    const on = window.matchMedia(e.query).matches;
    const meta = PROP_META[e.prop]!;
    const higher = BREAKPOINTS.filter(([b, q]) => b !== e.bp && BREAKPOINTS.findIndex(([x]) => x === b) > BREAKPOINTS.findIndex(([x]) => x === e.bp) && window.matchMedia(q).matches).map(([b]) => b);
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(`[class~="${e.token}"]`))) {
      const tokens = el.className.split(/\s+/);
      // 더 큰 브레이크포인트에서 같은 속성을 다시 바꾸는 클래스가 있으면 그쪽이 맞다 — 건드리지 않는다
      const overridden = higher.some((hb) => tokens.some((t) => t.startsWith(hb + ":") && meta.family.includes(t.slice(hb.length + 1))));
      if (on && !overridden) {
        if (el.style.getPropertyValue(e.css) !== e.value) el.style.setProperty(e.css, e.value, "important");
        el.setAttribute("data-sb-enforced", "1");
      } else if (el.hasAttribute("data-sb-enforced")) {
        el.style.removeProperty(e.css);
        el.removeAttribute("data-sb-enforced");
      }
    }
  }
}

/** 원인 추적용 진단 한 줄 — 인라인(일반/important)이 먹는지 + 우리 것 아닌 스타일시트 목록. */
function diagnose(bp: string): string {
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;";
  document.body.appendChild(host);
  try {
    const a = document.createElement("div");
    a.className = `flex flex-col ${bp}:flex-row`;
    a.style.flexDirection = "row";
    host.appendChild(a);
    const b = document.createElement("div");
    b.className = `flex flex-col ${bp}:flex-row`;
    b.style.setProperty("flex-direction", "row", "important");
    host.appendChild(b);
    const inl = `inline=${getComputedStyle(a).flexDirection}/imp=${getComputedStyle(b).flexDirection}`;
    const sheets = Array.from(document.styleSheets)
      .filter((sh) => !(sh.href && sh.href.startsWith(location.origin + "/_next/")))
      .map((sh) => {
        const n = sh.ownerNode as Element | null;
        const id = n ? `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${n.getAttribute("data-precedence") ? "[next]" : ""}` : "?";
        return (sh.href ? sh.href.replace(/^https?:\/\//, "").slice(0, 40) : id) + (n?.textContent ? `(${n.textContent.length})` : "");
      });
    return `${inl} · sheets=[${sheets.join("|").slice(0, 200)}] · adopted=${document.adoptedStyleSheets?.length ?? 0}`;
  } finally {
    host.remove();
  }
}

const RESPONSIVE_SELECTOR = /\.(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|max-2xl)\\:/;
const STYLE_ID = "sb-responsive-repair";

/** 우리 /_next CSS 에 실제로 존재하는 셀렉터 집합 — Tailwind 는 쓰인 클래스만 생성하므로,
 *  없는 클래스를 탐침하면 "깨짐"으로 오탐한다(2026-08-22 코드에 없는 md 변형을 탐침해 오탐 3건 실측). */
let knownSelectors: Set<string> | null = null;
function collectKnownSelectors(): Set<string> {
  if (knownSelectors) return knownSelectors;
  const set = new Set<string>();
  const walk = (rules: CSSRuleList) => {
    for (const r of Array.from(rules)) {
      if (r instanceof CSSStyleRule) set.add(r.selectorText);
      else if ("cssRules" in r) walk((r as CSSGroupingRule).cssRules);
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    if (!sheet.href || !sheet.href.startsWith(location.origin + "/_next/")) continue;
    try {
      walk(sheet.cssRules);
    } catch {
      // 읽기 실패는 건너뛴다
    }
  }
  knownSelectors = set;
  return set;
}
const tokenExists = (token: string) => collectKnownSelectors().has("." + token.replace(":", "\\:"));

function probe(): string[] {
  const failed: string[] = [];
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;";
  document.body.appendChild(host);
  try {
    for (const [bp, query] of BREAKPOINTS) {
      if (!window.matchMedia(query).matches) continue;
      for (const [cls, prop, want] of PROBES(bp)) {
        const token = cls.split(" ").find((t) => t.includes(":"))!;
        if (!tokenExists(token)) continue; // CSS 에 없는 클래스는 검사 대상이 아니다
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
    let verifyTimer: ReturnType<typeof setTimeout> | undefined;
    const escalate = (failed: string[]) => {
      for (const e of toEnforce(failed)) if (!active.some((x) => x.token === e.token)) active.push(e);
      applyEnforce();
      if (!observer) {
        let t: ReturnType<typeof setTimeout> | undefined;
        observer = new MutationObserver(() => {
          clearTimeout(t);
          t = setTimeout(applyEnforce, 100);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
      }
    };
    const beacon = (failed: string[], after: string[], stage: string) => {
      if (sessionStorage.getItem("responsive-guard-sent")) return;
      sessionStorage.setItem("responsive-guard-sent", "1");
      const bp = after[0]?.split(" ").find((x) => x.includes(":"))?.split(":")[0] ?? "sm";
      fetch("/api/track/error", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify({
          kind: "layout",
          path: location.pathname + location.search,
          message: `responsive-dropout ${failed.join(", ")} · stage=${stage} cssRepaired=${after.length === 0} · ${innerWidth}px · ${navigator.userAgent.slice(0, 120)} · ${after.length ? diagnose(bp) : ""}`,
        }),
      }).catch(() => {});
    };
    const run = () => {
      try {
        if (navigator.webdriver || /HeadlessChrome|bot|spider|crawl/i.test(navigator.userAgent)) return;
        const failed = probe();
        if (!failed.length) {
          if (active.length) applyEnforce(); // 복구 모드에서 폭이 바뀐 경우 강제 항목 갱신
          return;
        }
        if (document.getElementById(STYLE_ID)) {
          // CSS 단계는 이미 했는데 또 실패 — 바로 인라인 단계
          escalate(failed);
          return;
        }
        const css = collectResponsiveRules();
        if (css) {
          const st = document.createElement("style");
          st.id = STYLE_ID;
          st.textContent = css;
          document.head.appendChild(st);
        }
        // 재검증은 잠시 뒤에 — 간섭이 우리 스타일 뒤에 자기 것을 다시 붙이는 경우를 잡기 위해.
        clearTimeout(verifyTimer);
        verifyTimer = setTimeout(() => {
          try {
            const after = probe();
            if (after.length) escalate(after);
            beacon(failed, after, after.length ? "inline" : "css");
          } catch {
            // 가드가 화면을 깨면 안 된다
          }
        }, 500);
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
      clearTimeout(verifyTimer);
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
      observer = null;
    };
  }, []);
  return null;
}

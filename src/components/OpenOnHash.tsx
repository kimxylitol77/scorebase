"use client";
// URL 해시가 지정 id 와 일치하면 접힌 <details> 를 자동으로 펼치는 헬퍼 (앵커 착지 대응).

import { useEffect } from "react";

export default function OpenOnHash({ id }: { id: string }) {
  useEffect(() => {
    const open = () => {
      if (window.location.hash !== `#${id}`) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, [id]);
  return null;
}

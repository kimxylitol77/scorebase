"use client";
// /en 구간에서 html lang 을 en 으로 보정 — root layout 은 lang="ko" 하드코딩(ISR 유지 위해 headers() 미사용).
import { useEffect } from "react";

export default function HtmlLangEn() {
  useEffect(() => {
    const prev = document.documentElement.lang;
    document.documentElement.lang = "en";
    return () => {
      document.documentElement.lang = prev || "ko";
    };
  }, []);
  return null;
}

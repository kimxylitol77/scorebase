"use client";
// SNS 공식 임베드 iframe — 인스타그램·X·Threads 가 postMessage 로 알려 주는 높이에 맞춰 늘린다(외부 스크립트 없이).
import { useEffect, useRef, useState } from "react";
import type { SnsPlatform } from "@/lib/sns-embed";

// 높이 알림이 오기 전(또는 안 오는 플랫폼)에 쓸 기본 높이
const FALLBACK: Record<SnsPlatform, number> = { instagram: 620, x: 520, threads: 560 };

function heightOf(data: unknown): number | null {
  let d = data;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      return null;
    }
  }
  // Threads: 높이 숫자만 보낸다 ("176")
  if (typeof d === "number") return d;
  if (!d || typeof d !== "object") return null;
  const o = d as Record<string, unknown>;
  // 인스타그램: {type:"MEASURE", details:{height}}
  const details = o.details as { height?: unknown } | undefined;
  if (o.type === "MEASURE" && typeof details?.height === "number") return details.height;
  // X: {"twttr.embed": {method:"twttr.private.resize", params:[{height}]}}
  const tw = o["twttr.embed"] as { method?: string; params?: Array<{ height?: unknown }> } | undefined;
  if (tw?.method === "twttr.private.resize" && typeof tw.params?.[0]?.height === "number") return tw.params[0].height;
  return null;
}

export default function SnsEmbedFrame({ platform, embedUrl, title }: { platform: SnsPlatform; embedUrl: string; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(FALLBACK[platform]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow) return;
      const h = heightOf(e.data);
      if (h && h > 100 && h < 3000) setHeight(Math.ceil(h));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={ref}
      src={embedUrl}
      title={title}
      loading="lazy"
      scrolling="no"
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="block w-full border-0 bg-white"
      style={{ height }}
    />
  );
}

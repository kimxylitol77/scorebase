"use client";
// 히트맵 공용 핏치 — 가중 좌표(0~100)를 KDE 커널→블러→컬러 램프로 렌더.
// 시즌 10x10 집계(가중치=카운트)와 경기별 원시 터치(가중치 1) 둘 다 이걸로 그린다.

import { useEffect, useRef } from "react";

export interface HeatPoint {
  x: number; // 0~100, 공격 방향 오른쪽
  y: number; // 0~100
  w?: number; // 밀도 가중치 (기본 1)
}

const PITCH = { x: 32, y: 24, width: 616, height: 392 };

export default function HeatPitch({ points, ariaLabel = "활동 히트맵" }: { points: HeatPoint[]; ariaLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = 680, height = 440;
    canvas.width = width;
    canvas.height = height;

    const density = document.createElement("canvas");
    density.width = width;
    density.height = height;
    const dctx = density.getContext("2d");
    const ctx = canvas.getContext("2d");
    if (!dctx || !ctx) return;
    ctx.clearRect(0, 0, width, height);
    if (points.length === 0) return;

    // 차가운 구역은 잔디가 그대로 보이고, 열은 좁고 또렷한 핫스팟으로만.
    const maxW = Math.max(...points.map((p) => p.w ?? 1), 1);
    dctx.globalCompositeOperation = "lighter";
    dctx.save();
    dctx.beginPath();
    dctx.rect(PITCH.x, PITCH.y, PITCH.width, PITCH.height);
    dctx.clip();

    for (const p of points) {
      const strength = Math.pow((p.w ?? 1) / maxW, 1.35);
      if (strength < 0.04) continue; // 산발 노이즈 — 잔디 유지
      const cx = PITCH.x + (p.x / 100) * PITCH.width;
      const cy = PITCH.y + (p.y / 100) * PITCH.height;
      const radius = 34 + strength * 16;
      const gradient = dctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, `rgba(255,255,255,${0.3 + strength * 0.52})`);
      gradient.addColorStop(0.55, `rgba(255,255,255,${0.12 + strength * 0.2})`);
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      dctx.fillStyle = gradient;
      dctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }
    dctx.restore();

    // 블러 패스 — 격자 주기성·개별 점 자국을 유기적 그라데이션으로 뭉갠다
    const blurred = document.createElement("canvas");
    blurred.width = width;
    blurred.height = height;
    const bctx = blurred.getContext("2d");
    if (!bctx) return;
    bctx.filter = "blur(22px)";
    bctx.drawImage(density, 0, 0);

    const source = bctx.getImageData(0, 0, width, height);
    const output = ctx.createImageData(width, height);
    let peak = 1;
    for (let i = 3; i < source.data.length; i += 4) peak = Math.max(peak, source.data[i]);

    const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const colorAt = (value: number): number[] => {
      if (value < 0.3) return mix([168, 224, 60], [252, 220, 48], value / 0.3);
      if (value < 0.62) return mix([252, 220, 48], [252, 130, 28], (value - 0.3) / 0.32);
      return mix([252, 130, 28], [226, 38, 40], (value - 0.62) / 0.38);
    };

    const THRESHOLD = 0.28;
    for (let i = 0; i < source.data.length; i += 4) {
      const normalized = source.data[i + 3] / peak;
      if (normalized < THRESHOLD) continue;
      const t = (normalized - THRESHOLD) / (1 - THRESHOLD);
      const [r, g, b] = colorAt(t);
      output.data[i] = r;
      output.data[i + 1] = g;
      output.data[i + 2] = b;
      // 가장자리에서 중심까지 연속 그라데이션 — 경계는 길게 페더링(t^0.9), 코어만 최대 불투명
      output.data[i + 3] = Math.round(Math.min(0.88, Math.pow(t, 0.9) * 0.92) * 255);
    }
    ctx.putImageData(output, 0, 0);
  }, [points]);

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#173d22] ring-1 ring-black/20">
      <svg viewBox="0 0 680 440" role="img" aria-label={`${ariaLabel} (공격 방향 오른쪽)`} className="block h-auto w-full">
        <defs>
          {/* 어두운 투톤 잔디 + 가장자리 비네트 — 열이 유일한 발광원이 되게 한다 */}
          <radialGradient id="pitch-vignette" cx="0.5" cy="0.5" r="0.72">
            <stop offset="60%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,.28)" />
          </radialGradient>
        </defs>
        <rect width="680" height="440" fill="#1c4a2a" />
        {Array.from({ length: 12 }).map((_, i) => (
          <rect key={i} x={(680 / 12) * i} y="0" width={680 / 12} height="440" fill={i % 2 === 0 ? "rgba(255,255,255,.032)" : "transparent"} />
        ))}
        <rect width="680" height="440" fill="url(#pitch-vignette)" />
      </svg>

      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />

      <svg viewBox="0 0 680 440" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
        <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2">
          <rect x={PITCH.x} y={PITCH.y} width={PITCH.width} height={PITCH.height} />
          <line x1="340" y1={PITCH.y} x2="340" y2={PITCH.y + PITCH.height} />
          <circle cx="340" cy="220" r="50" />
          <circle cx="340" cy="220" r="2.5" fill="rgba(255,255,255,.55)" stroke="none" />
          <rect x={PITCH.x} y="124" width="92" height="192" />
          <rect x={PITCH.x} y="168" width="34" height="104" />
          <rect x="556" y="124" width="92" height="192" />
          <rect x="614" y="168" width="34" height="104" />
          <path d="M124 168 A50 50 0 0 1 124 272" />
          <path d="M556 168 A50 50 0 0 0 556 272" />
        </g>
        {/* 공격 방향 화살표 — 텍스트 없이 화살표 하나 (FotMob 관례) */}
        <path
          d="M560 46h84l-14-11m14 11-14 11"
          fill="none"
          stroke="rgba(255,255,255,.85)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* 브랜드 워터마크 — 오른쪽 아래, 로고 마크(4막대) + 워드마크 */}
        <g transform="translate(541 420.5) scale(0.42)" fill="rgba(255,255,255,.38)">
          <rect x="3" y="20" width="5" height="9" rx="1.5" />
          <rect x="11" y="14" width="5" height="15" rx="1.5" />
          <rect x="19" y="8" width="5" height="21" rx="1.5" />
          <rect x="27" y="3" width="5" height="26" rx="1.5" />
        </g>
        <text
          x="646"
          y="433"
          textAnchor="end"
          fontFamily="system-ui, sans-serif"
          fontSize="11"
          fontWeight="800"
          letterSpacing="2.5"
          fill="rgba(255,255,255,.3)"
        >
          SCOREBASE
        </text>
      </svg>
    </div>
  );
}

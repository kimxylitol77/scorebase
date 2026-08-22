// 경기 상세 "방송 오버레이" 박스 — OBS 브라우저 소스 URL 생성·복사 + 미리보기. 옵션은 쿼리로 바로 반영.
"use client";

import { useMemo, useState } from "react";

interface Props {
  league: string;
  id: string;
  siteUrl: string;
}

export default function ScoreboardEmbedBox({ league, id, siteUrl }: Props) {
  const [bg, setBg] = useState<"transparent" | "dark" | "light">("transparent");
  const [size, setSize] = useState(1);
  const [clock, setClock] = useState(true);
  const [names, setNames] = useState<"short" | "full">("short");
  const [badge, setBadge] = useState(false);
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    const q = new URLSearchParams({ league, id, bg, size: String(size), clock: clock ? "1" : "0", names });
    if (badge) q.set("league_badge", "1");
    return `${siteUrl}/embed/scoreboard?${q.toString()}`;
  }, [league, id, bg, size, clock, names, badge, siteUrl]);
  const iframeCode = `<iframe src="${url}" width="480" height="${Math.round(120 * size)}" frameborder="0" scrolling="no" style="background:transparent" allowtransparency="true"></iframe>`;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("복사해서 쓰세요", text);
    }
  };
  const chip = (active: boolean) =>
    `px-2 py-1 rounded-md text-[11px] font-semibold ${active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-600 dark:bg-white/[0.06] dark:text-neutral-300"}`;

  return (
    <div className="space-y-3 text-[12px]">
      <p className="text-neutral-600 dark:text-neutral-400 break-keep">
        OBS·프리즘 등 방송 프로그램에서 <strong>브라우저 소스</strong>로 아래 URL 을 추가하면 이 경기의 점수·경기 시간이 5초마다 자동 갱신되는 오버레이가 됩니다. 배경은 투명이라 화면 위에 바로 얹힙니다.
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="flex items-center gap-1">
          <span className="text-neutral-500">배경</span>
          {(["transparent", "dark", "light"] as const).map((b) => (
            <button key={b} type="button" onClick={() => setBg(b)} className={chip(bg === b)}>{b === "transparent" ? "투명" : b === "dark" ? "다크" : "라이트"}</button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-neutral-500">크기</span>
          {[0.8, 1, 1.3, 1.6].map((s) => (
            <button key={s} type="button" onClick={() => setSize(s)} className={chip(size === s)}>{s}x</button>
          ))}
        </span>
        <span className="flex items-center gap-1">
          <span className="text-neutral-500">팀명</span>
          <button type="button" onClick={() => setNames("short")} className={chip(names === "short")}>약칭</button>
          <button type="button" onClick={() => setNames("full")} className={chip(names === "full")}>전체</button>
        </span>
        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={clock} onChange={(e) => setClock(e.target.checked)} /> 경기 시간</label>
        <label className="flex items-center gap-1 cursor-pointer"><input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)} /> 리그명</label>
      </div>

      {/* 미리보기 — 체커 배경으로 투명 확인 */}
      <div
        className="rounded-xl p-3 overflow-x-auto"
        style={{ backgroundImage: "linear-gradient(45deg,#8884 25%,transparent 25%,transparent 75%,#8884 75%),linear-gradient(45deg,#8884 25%,transparent 25%,transparent 75%,#8884 75%)", backgroundSize: "16px 16px", backgroundPosition: "0 0,8px 8px" }}
      >
        <iframe title="오버레이 미리보기" src={url.replace(siteUrl, "")} width="100%" height={Math.round(130 * size)} style={{ border: 0, background: "transparent" }} />
      </div>

      <div className="flex items-center gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-md border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 px-2 py-1.5 text-[11px] font-mono" aria-label="오버레이 URL" />
        <button type="button" onClick={() => copy(url)} className="shrink-0 rounded-md bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-rose-700">
          {copied ? "복사됨" : "URL 복사"}
        </button>
        <button type="button" onClick={() => copy(iframeCode)} className="shrink-0 rounded-md border border-neutral-300 dark:border-white/15 px-3 py-1.5 text-[11px] font-semibold hover:bg-neutral-100 dark:hover:bg-white/[0.06]">
          iframe 코드
        </button>
      </div>
      <p className="text-[10px] text-neutral-400">OBS 브라우저 소스 권장 크기 480×{Math.round(120 * size)} · 점수는 스코어베이스 라이브 데이터 기준이며 방송 영상보다 수 초 빠르거나 늦을 수 있습니다.</p>
    </div>
  );
}

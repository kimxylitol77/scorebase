// 베트맨(스포츠토토) 프로토 배당 목록 — /odds?sport=betman.
//
// 이 화면의 값어치는 배당 자체보다 **국내 투표 분포**다. 해외 북메이커는 배당만 주지만
// 베트맨은 국내 구매자가 실제로 어디에 걸었는지를 준다 — 배당 내재확률과 어긋나는 지점이
// 여론과 시장이 다르게 보는 곳이다. 그래서 투표 막대를 화면에서 가장 크게 잡았다.
//
// 접힘/펼침은 <details>/<summary> — 상태가 하나뿐이라 client 컴포넌트로 만들 이유가 없다.
// 펼치면 같은 경기의 핸디캡·언더오버·홀짝·승N패 라인이 나온다.

import { ChevronDown } from "lucide-react";
import type { BetmanMatch, BetmanLine } from "@/lib/odds/betman";

const SPORT_LABEL: Record<string, string> = { SC: "축구", BS: "야구", BK: "농구" };

const fmtOdds = (v: number | null) => (v != null && v > 0 ? v.toFixed(2) : "-");

/** 베트맨 원본에 "일본_여자" 처럼 언더스코어가 섞여 온다 — 표시할 때만 공백으로 편다. */
const teamLabel = (s: string) => s.replace(/_/g, " ");

/** 배당 → 마진 제거한 내재확률(합=1). 투표 비율과 같은 축에서 비교하기 위함. */
function impliedPct(w: number | null, d: number | null, l: number | null) {
  const iw = w && w > 0 ? 1 / w : 0;
  const id = d && d > 0 ? 1 / d : 0;
  const il = l && l > 0 ? 1 / l : 0;
  const s = iw + id + il;
  if (s <= 0) return null;
  return { w: (iw / s) * 100, d: (id / s) * 100, l: (il / s) * 100 };
}

function votePct(line: BetmanLine) {
  const w = line.winVotes, d = line.drawVotes ?? 0, l = line.loseVotes;
  if (w == null || l == null) return null;
  const total = w + d + l;
  if (total <= 0) return null;
  return { w: (w / total) * 100, d: (d / total) * 100, l: (l / total) * 100, total };
}

function TeamLogo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // 외부 도메인 로고가 섞여 있어 next/image 최적화 대상이 아니다 (/scores 팀로고와 동일).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        loading="lazy"
        className="h-7 w-7 shrink-0 rounded bg-white object-contain p-0.5"
      />
    );
  }
  // 이름 매칭이 모호하면 로고를 달지 않는다 — 틀린 마크보다 이니셜이 낫다.
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-400 dark:bg-neutral-800">
      {name.slice(0, 1)}
    </span>
  );
}

/** 국내 투표 분포 — 이 화면의 주인공이라 굵게 잡고 % 를 막대 안에 박는다. */
function VoteBar({ pct, hasDraw }: { pct: { w: number; d: number; l: number }; hasDraw: boolean }) {
  const seg = [
    { v: pct.w, cls: "bg-rose-500" },
    ...(hasDraw ? [{ v: pct.d, cls: "bg-neutral-400 dark:bg-neutral-500" }] : []),
    { v: pct.l, cls: "bg-blue-500" },
  ];
  return (
    <div className="flex h-6 w-full overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800">
      {seg.map((s, i) => (
        <div
          key={i}
          style={{ width: `${s.v}%` }}
          className={`flex items-center justify-center text-[11px] font-bold text-white ${s.cls}`}
        >
          {/* 좁은 조각에 숫자를 넣으면 깨진다 — 12% 미만은 숫자 생략 */}
          {s.v >= 12 ? `${Math.round(s.v)}%` : ""}
        </div>
      ))}
    </div>
  );
}

/** 펼침 영역의 한 줄 — 핸디캡/언더오버/홀짝. 기준선(핸디 라인)을 같이 보여줘야 뜻이 통한다. */
function LineRow({ line }: { line: BetmanLine }) {
  const hasDraw = line.drawAllot != null;
  const pct = votePct(line);
  const imp = impliedPct(line.winAllot, line.drawAllot, line.loseAllot);
  // 핸디 라인. 핸디캡은 ±로 붙는 값이지만 언더오버는 기준점이라 부호를 붙이면 뜻이 틀어진다.
  const isOverUnder = (line.betTypNm ?? "").includes("언더오버");
  const lineLabel =
    line.winHandi != null && line.winHandi !== 0
      ? isOverUnder
        ? `기준 ${line.winHandi}`
        : `${line.winHandi > 0 ? "+" : ""}${line.winHandi}`
      : null;
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-3 border-t border-neutral-100 px-3 py-2 dark:border-neutral-800/70 sm:grid-cols-[170px_120px_1fr]">
      <div className="text-[11px] text-neutral-500 dark:text-neutral-400">
        {line.betTypNm ?? line.betNm ?? "-"}
        {lineLabel && (
          <span className="ml-1 rounded bg-neutral-100 px-1 py-px text-[10px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {lineLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 text-[13px] tabular-nums">
        <span className="font-semibold text-rose-600 dark:text-rose-400">
          {isOverUnder && <span className="mr-0.5 text-[10px] font-medium opacity-70">오버</span>}
          {fmtOdds(line.winAllot)}
        </span>
        {hasDraw && <span className="text-neutral-500">{fmtOdds(line.drawAllot)}</span>}
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          {isOverUnder && <span className="mr-0.5 text-[10px] font-medium opacity-70">언더</span>}
          {fmtOdds(line.loseAllot)}
        </span>
      </div>
      <div className="col-span-2 sm:col-span-1">
        {pct ? (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
              <div style={{ width: `${pct.w}%` }} className="bg-rose-500/70" />
              {hasDraw && <div style={{ width: `${pct.d}%` }} className="bg-neutral-400/70" />}
              <div style={{ width: `${pct.l}%` }} className="bg-blue-500/70" />
            </div>
            {imp && (
              <div className="mt-0.5 flex gap-3 text-[10px] tabular-nums text-neutral-400">
                <span>
                  투표 {Math.round(pct.w)}
                  {hasDraw ? `·${Math.round(pct.d)}` : ""}·{Math.round(pct.l)}
                </span>
                <span>
                  배당 {Math.round(imp.w)}
                  {hasDraw ? `·${Math.round(imp.d)}` : ""}·{Math.round(imp.l)}
                </span>
              </div>
            )}
          </>
        ) : (
          <span className="text-[10px] text-neutral-400">투표 집계 없음</span>
        )}
      </div>
    </div>
  );
}

export default function BetmanOddsPanel({ matches }: { matches: BetmanMatch[] }) {
  if (matches.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        표시할 발매 경기가 없습니다. 베트맨 배당은 하루 두 번(09:00·21:00) 갱신됩니다.
      </p>
    );
  }

  const kst = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", {
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
      hour12: false, timeZone: "Asia/Seoul",
    }).format(d);
  };

  return (
    <section className="mt-4">
      <p className="mb-3 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        프로토 승부식 배당과 <strong className="font-semibold">국내 구매자 투표 분포</strong>입니다
        {matches[0]?.gmTs ? ` (${matches[0].gmTs} 회차 기준)` : ""}. 막대는 실제 투표 비율,
        오른쪽 <strong className="font-semibold">배당 기준 확률</strong>은 배당을 확률로 바꾼
        값입니다 — 둘이 벌어진 경기가 여론과 시장이 다르게 보는 경기입니다.
        경기를 누르면 핸디캡·언더오버 배당이 펼쳐집니다. 출처는 베트맨(스포츠토토).
      </p>

      <div className="space-y-2">
        {matches.map((m) => {
          const hasDraw = m.drawAllot != null;
          const pct = votePct(m);
          const imp = impliedPct(m.winAllot, m.drawAllot, m.loseAllot);
          return (
            <details
              key={m.key}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <summary className="cursor-pointer list-none px-3 py-3 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                  <span className="tabular-nums">{kst(m.gameDate)}</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-px font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {SPORT_LABEL[m.itemCode ?? ""] ?? "-"}
                  </span>
                  <span className="truncate">{m.leagueName}</span>
                  {m.lines.length > 0 && (
                    // 펼칠 수 있다는 걸 알아볼 수 있어야 한다 — 회색 10px 로는 안 보인다.
                    // 색 있는 알약 + 닫힘/열림 문구 교체(CSS group-open, JS 불필요).
                    <span className="ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-bold text-indigo-600 ring-1 ring-indigo-200 transition group-hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30 dark:group-hover:bg-indigo-500/25">
                      <span className="group-open:hidden">핸디·오버언더 {m.lines.length}종</span>
                      <span className="hidden group-open:inline">접기</span>
                      <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" aria-hidden="true" />
                    </span>
                  )}
                </div>

                {/* 팀 + 배당. 모바일은 3열로 두면 팀명이 잘린다(실측 375px "야쿠르트 …") →
                    세로로 쌓아 팀명에 폭을 다 준다. 데스크탑은 홈 좌·원정 우 3열 유지.
                    양쪽 다 자식 순서는 [로고][이름] — 데스크탑 홈만 flex-row-reverse 로 뒤집어
                    [이름][로고] 우측 정렬을 만든다. */}
                <div className="mt-2 flex flex-col gap-1.5 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
                  <div className="flex min-w-0 items-center gap-2 sm:flex-row-reverse sm:justify-start">
                    <TeamLogo url={m.homeLogo} name={m.homeName} />
                    <span className="truncate text-[14px] text-neutral-800 dark:text-neutral-100 sm:text-right">
                      {teamLabel(m.homeName)}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 tabular-nums sm:gap-2.5">
                    {/* 모바일은 팀이 위아래로 쌓여 배당이 어느 팀 것인지 모호해진다 →
                        승/무/패 라벨을 붙인다. 데스크탑은 팀 사이에 있어 자명하므로 숨긴다. */}
                    <span className="min-w-[46px] rounded-md bg-rose-50 px-2 py-1 text-center text-[14px] font-bold text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">
                      <span className="mr-1 text-[10px] font-medium opacity-70 sm:hidden">승</span>
                      {fmtOdds(m.winAllot)}
                    </span>
                    {hasDraw && (
                      <span className="min-w-[46px] rounded-md bg-neutral-100 px-2 py-1 text-center text-[14px] font-semibold text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        <span className="mr-1 text-[10px] font-medium opacity-70 sm:hidden">무</span>
                        {fmtOdds(m.drawAllot)}
                      </span>
                    )}
                    <span className="min-w-[46px] rounded-md bg-blue-50 px-2 py-1 text-center text-[14px] font-bold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                      <span className="mr-1 text-[10px] font-medium opacity-70 sm:hidden">패</span>
                      {fmtOdds(m.loseAllot)}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo url={m.awayLogo} name={m.awayName} />
                    <span className="truncate text-[14px] text-neutral-800 dark:text-neutral-100">
                      {teamLabel(m.awayName)}
                    </span>
                  </div>
                </div>

                {/* 국내 투표 분포 — 이 화면의 주인공 */}
                <div className="mt-2.5">
                  {pct ? (
                    <>
                      <VoteBar pct={pct} hasDraw={hasDraw} />
                      <div className="mt-1 flex items-center gap-2 text-[10px] tabular-nums text-neutral-400">
                        <span className="font-semibold text-neutral-500 dark:text-neutral-400">
                          국내 투표 {pct.total.toLocaleString()}표
                        </span>
                        {imp && (
                          <span className="ml-auto">
                            배당 기준 확률 {Math.round(imp.w)}
                            {hasDraw ? ` · ${Math.round(imp.d)}` : ""} · {Math.round(imp.l)}%
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-[10px] text-neutral-400">투표 집계 없음</div>
                  )}
                </div>
              </summary>

              {m.lines.length > 0 && (
                <div className="bg-neutral-50/60 pb-1 dark:bg-neutral-950/40">
                  <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                    같은 경기의 다른 배당
                  </div>
                  {m.lines.map((l) => (
                    <LineRow key={l.id} line={l} />
                  ))}
                </div>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}

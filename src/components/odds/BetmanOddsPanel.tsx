// 베트맨(스포츠토토) 프로토 배당 목록 — /odds?sport=betman.
//
// 이 화면의 값어치는 배당 자체보다 **국내 투표 분포**다. 해외 북메이커는 배당만 주지만
// 베트맨은 국내 구매자가 실제로 어디에 걸었는지를 준다 — 배당 내재확률과 어긋나는 지점이
// 여론과 시장이 다르게 보는 곳이다. 그래서 투표 막대를 화면에서 가장 크게 잡았다.
//
// 접힘/펼침은 <details>/<summary> — 상태가 하나뿐이라 client 컴포넌트로 만들 이유가 없다.
// 펼치면 같은 경기의 핸디캡·언더오버·홀짝·승N패 라인이 나온다.
//
// 카드는 한 줄형(2026-09-17 개편, 머니볼랩스 참고): 왼쪽 [홈 로고·이름][승·무·패 배당][원정], 오른쪽 [투표 막대 + 우세 표시 + 배당 확률].
// sm: 덮어쓰기를 무력화하는 윈도우 환경 실사례(8/16·8/22) 때문에 반응형 변형 대신 flex-wrap + basis 로 접는다.

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { betmanRenderNow, type BetmanMatch, type BetmanLine } from "@/lib/odds/betman";
import TeamName from "./BetmanTeamName";

const SPORT_LABEL: Record<string, string> = { SC: "축구", BS: "야구", BK: "농구", VL: "배구" };

const fmtOdds = (v: number | null) => (v != null && v > 0 ? v.toFixed(2) : "-");

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

/** 베트맨 원본에 "일본_여자" 처럼 언더스코어가 섞여 온다 — 표시할 때만 공백으로 편다. */
const teamLabel = (s: string) => s.replace(/_/g, " ");

function TeamLogo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    return (
      // 외부 도메인 로고가 섞여 있어 next/image 최적화 대상이 아니다 (/scores 팀로고와 동일).
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded bg-white object-contain p-0.5" />
    );
  }
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-bold text-neutral-400 dark:bg-neutral-800">
      {name.slice(0, 1)}
    </span>
  );
}

/**
 * 국내 투표 분포 — 이 화면의 주인공. 막대 위에 홈·무·원정 % 를 두고 가장 큰 쪽에 ▲.
 * 배당 확률(마진 제거)을 바로 아래 같은 순서로 놓아 "여론 vs 시장" 이 한눈에 비교된다.
 */
function VotePanel({ pct, imp, hasDraw, total }: { pct: { w: number; d: number; l: number } | null; imp: { w: number; d: number; l: number } | null; hasDraw: boolean; total: number | null }) {
  const cols = hasDraw ? (["w", "d", "l"] as const) : (["w", "l"] as const);
  const label = { w: "홈", d: "무", l: "원정" } as const;
  const tone = { w: "text-rose-600 dark:text-rose-400", d: "text-amber-600 dark:text-amber-400", l: "text-blue-600 dark:text-blue-400" } as const;
  const bar = { w: "bg-rose-500", d: "bg-amber-400", l: "bg-blue-500" } as const;
  const top = pct ? cols.reduce((a, k) => (pct[k] > pct[a] ? k : a), cols[0]) : null;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold tabular-nums">
        {cols.map((k) => (
          <span key={k} className={`${tone[k]} ${k === "d" ? "text-center" : k === "l" ? "text-right" : ""}`}>
            {k === "l" && top === k && "▲ "}
            {label[k]} {pct ? `${Math.round(pct[k])}%` : "—"}
            {k !== "l" && top === k && " ▲"}
          </span>
        ))}
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
        {pct
          ? cols.map((k) => <div key={k} style={{ width: `${pct[k]}%` }} className={`rounded-full ${bar[k]}`} />)
          : null}
      </div>
      <div className="flex items-center justify-between gap-2 text-[10px] tabular-nums text-neutral-400">
        <span>{pct && total != null ? `국내 투표 ${total.toLocaleString()}표` : "투표 집계 없음"}</span>
        {imp && (
          <span title="배당을 확률로 바꾼 값(마진 제거). 투표 비율과 벌어진 경기가 여론과 시장이 다르게 보는 경기">
            배당 확률 {cols.map((k) => Math.round(imp[k])).join(" · ")}%
          </span>
        )}
      </div>
    </div>
  );
}

const ODDS_TONE = { w: "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400", d: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300", l: "bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" } as const;

/** 승·무·패 배당 알약 — 팀 사이에 놓인다. */
function OddsPills({ m }: { m: BetmanMatch }) {
  const hasDraw = m.drawAllot != null;
  const pill = (k: "w" | "d" | "l", v: number | null, lab: string) => (
    <span key={k} className={`inline-flex min-w-[52px] flex-col items-center rounded-md px-1.5 py-1 leading-none ${ODDS_TONE[k]}`}>
      <span className="text-[9px] font-medium opacity-70">{lab}</span>
      <span className="mt-0.5 text-[13px] font-bold tabular-nums">{fmtOdds(v)}</span>
    </span>
  );
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {pill("w", m.winAllot, "승")}
      {hasDraw && pill("d", m.drawAllot, "무")}
      {pill("l", m.loseAllot, "패")}
    </span>
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
        {/* 전반 라인은 유형명("승무패")만 보이면 풀타임과 구분이 안 된다 — betNm("축구 전반 승무패")로 */}
        {(line.betNm ?? "").includes("전반") ? line.betNm : (line.betTypNm ?? line.betNm ?? "-")}
        {line.single && (
          <span className="ml-1 rounded bg-emerald-500/10 px-1 py-px text-[10px] font-bold text-emerald-700 dark:text-emerald-300">단폭</span>
        )}
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

/** KST 날짜 키("2026-09-13")와 라벨("9/13 (일)") */
function kstDayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function kstDayLabel(key: string, todayKey: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const base = `${m}/${d} (${wd})`;
  const diff = Math.round((Date.UTC(y, m - 1, d) - Date.parse(todayKey)) / 86400_000);
  return diff === 0 ? `오늘 ${base}` : diff === 1 ? `내일 ${base}` : diff === 2 ? `모레 ${base}` : base;
}

const chip = (active: boolean) =>
  `inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 transition ${
    active
      ? "bg-neutral-900 text-white ring-neutral-900 dark:bg-white dark:text-neutral-900 dark:ring-white"
      : "bg-white text-neutral-600 ring-neutral-200 hover:bg-neutral-50 dark:bg-white/[0.04] dark:text-neutral-300 dark:ring-white/10 dark:hover:bg-white/[0.08]"
  }`;

/**
 * @param date  KST 날짜 키(YYYY-MM-DD) — 그 날만. 없으면 발매 중 전부를 날짜별로 묶어 보인다.
 * @param item  SC/BS/BK/VL — 종목 필터. 없으면 전 종목.
 */
export default function BetmanOddsPanel({ matches, date, item }: { matches: BetmanMatch[]; date?: string; item?: string }) {
  if (matches.length === 0) {
    return (
      <p className="mt-6 rounded-xl border border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        표시할 발매 경기가 없습니다. 베트맨 배당은 하루 두 번(09:00·21:00) 갱신됩니다.
      </p>
    );
  }

  // 날짜·종목 칩 — 카운트는 전체 기준(필터를 걸어도 다른 날짜·종목에 몇 경기 있는지 보이게)
  const todayKey = kstDayKey(new Date().toISOString());
  const dayCounts = new Map<string, number>();
  const itemCounts = new Map<string, number>();
  for (const m of matches) {
    const k = kstDayKey(m.gameDate);
    dayCounts.set(k, (dayCounts.get(k) ?? 0) + 1);
    if (m.itemCode) itemCounts.set(m.itemCode, (itemCounts.get(m.itemCode) ?? 0) + 1);
  }
  const days = [...dayCounts.keys()].sort();
  const dateSel = date && dayCounts.has(date) ? date : null;
  const itemSel = item && itemCounts.has(item) ? item : null;
  const shown = matches.filter((m) => (!dateSel || kstDayKey(m.gameDate) === dateSel) && (!itemSel || m.itemCode === itemSel));
  const href = (d: string | null, it: string | null) =>
    `/odds?sport=betman${d ? `&date=${d}` : ""}${it ? `&item=${it}` : ""}`;
  // 날짜별 묶음 — 같은 날 안에서는 프로토 경기번호 순
  const groups = new Map<string, BetmanMatch[]>();
  for (const m of shown) {
    const k = kstDayKey(m.gameDate);
    const g = groups.get(k) ?? [];
    g.push(m);
    groups.set(k, g);
  }
  for (const g of groups.values()) g.sort((a, b) => a.matchSeq - b.matchSeq);

  const kstTime = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "-";
    return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(d);
  };
  // 발매 마감 — 베트맨 endDate 는 대부분 경기 시작과 같고(그때는 표기 생략), 회차 마감(예: 9/13 23:00)보다
  // 늦게 시작하는 경기는 회차 마감으로 당겨진다. 킥오프와 1분 이상 다를 때만 "마감 HH:mm" 을 붙인다.
  const nowMs = betmanRenderNow();
  const deadline = (m: BetmanMatch): { label: string; closed: boolean; soon: boolean } | null => {
    if (!m.endDate) return null;
    const end = new Date(m.endDate).getTime();
    const kick = new Date(m.gameDate).getTime();
    if (!Number.isFinite(end) || Math.abs(kick - end) < 60_000) return null;
    const sameDay = kstDayKey(m.endDate) === kstDayKey(m.gameDate);
    const label = sameDay ? kstTime(m.endDate) : `${kstDayLabel(kstDayKey(m.endDate), todayKey).replace(/^(오늘|내일|모레) /, "")} ${kstTime(m.endDate)}`;
    return { label, closed: end <= nowMs, soon: end > nowMs && end - nowMs <= 3600_000 };
  };

  return (
    <section className="mt-4">
      {/* 날짜 칩 — 오늘·내일·모레 … 발매 중인 날짜 전부. 없던 시절엔 60건 상한에 내일 이후가 잘렸다. */}
      <div className="mb-2 flex flex-wrap gap-1.5" aria-label="날짜">
        <Link href={href(null, itemSel)} className={chip(!dateSel)}>전체 <span className="opacity-60 tabular-nums">{matches.length}</span></Link>
        {days.map((d) => (
          <Link key={d} href={href(d, itemSel)} className={chip(dateSel === d)}>
            {kstDayLabel(d, todayKey)} <span className="opacity-60 tabular-nums">{dayCounts.get(d)}</span>
          </Link>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5" aria-label="종목">
        <Link href={href(dateSel, null)} className={chip(!itemSel)}>전 종목</Link>
        {["SC", "BS", "BK", "VL"].filter((c) => itemCounts.has(c)).map((c) => (
          <Link key={c} href={href(dateSel, c)} className={chip(itemSel === c)}>
            {SPORT_LABEL[c]} <span className="opacity-60 tabular-nums">{itemCounts.get(c)}</span>
          </Link>
        ))}
      </div>
      <p className="mb-3 text-[12px] leading-relaxed text-neutral-500 dark:text-neutral-400">
        프로토 승부식 배당과 <strong className="font-semibold">국내 구매자 투표 분포</strong>입니다
        {matches[0]?.gmTs ? ` (${matches[0].gmTs} 회차 기준)` : ""}. 막대는 실제 투표 비율,
        오른쪽 <strong className="font-semibold">배당 기준 확률</strong>은 배당을 확률로 바꾼
        값입니다 — 둘이 벌어진 경기가 여론과 시장이 다르게 보는 경기입니다.
        경기를 누르면 핸디캡·언더오버 배당이 펼쳐집니다. <strong className="font-semibold">단폭</strong>은 1경기만 단독으로 살 수 있는 유형,
        마감 표시는 경기 시작보다 먼저 발매가 끝나는 경기입니다. 출처는 베트맨(스포츠토토).
      </p>

      {shown.length === 0 && (
        <p className="rounded-xl border border-neutral-200 px-4 py-8 text-center text-[13px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          이 조건에 발매 경기가 없습니다.
        </p>
      )}
      {[...groups.entries()].map(([dayKey, list]) => (
      <div key={dayKey} className="mb-6">
        <div className="sticky top-16 z-10 mb-2 flex items-baseline gap-2 bg-white/90 py-1.5 backdrop-blur dark:bg-neutral-950/90">
          <h2 className="text-sm font-bold">{kstDayLabel(dayKey, todayKey)}</h2>
          <span className="text-[11px] tabular-nums text-neutral-500">{list.length}경기 · {list[0].gmTs} 회차</span>
        </div>
      <div className="space-y-2">
        {list.map((m) => {
          const hasDraw = m.drawAllot != null;
          const pct = votePct(m);
          const imp = impliedPct(m.winAllot, m.drawAllot, m.loseAllot);
          return (
            <details
              key={m.key}
              className="group overflow-hidden rounded-xl border border-neutral-200 bg-white transition hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <summary className="cursor-pointer list-none px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-400">
                  {/* 프로토 경기번호 — 한국 구매자는 팀명이 아니라 이 번호로 경기를 찾는다(2026-09-11). */}
                  <span className="rounded bg-neutral-900 px-1.5 py-px font-bold tabular-nums text-white dark:bg-white dark:text-neutral-900">
                    #{m.matchSeq}
                  </span>
                  <span className="tabular-nums">{kstTime(m.gameDate)}</span>
                  <span className="rounded bg-neutral-100 px-1.5 py-px font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                    {SPORT_LABEL[m.itemCode ?? ""] ?? "-"}
                  </span>
                  <span className="truncate">{m.leagueName}</span>
                  {/* 단폭 — 1경기만 단독 구매 가능(베트맨 sgl). 조합이 기본인 승부식에서 실구매자가 먼저 보는 표시 */}
                  {m.single && (
                    <span className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30">
                      단폭
                    </span>
                  )}
                  {(() => {
                    const dl = deadline(m);
                    if (!dl) return null;
                    return (
                      <span
                        className={`rounded px-1.5 py-px text-[10px] font-semibold ring-1 ${
                          dl.closed
                            ? "bg-neutral-100 text-neutral-500 ring-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:ring-neutral-700"
                            : dl.soon
                              ? "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30"
                              : "bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30"
                        }`}
                        title="베트맨 발매 마감 시각 — 경기 시작보다 앞서 마감되는 경기(회차 마감 등)만 표시"
                      >
                        {dl.closed ? "발매 마감" : `마감 ${dl.label}`}
                      </span>
                    );
                  })()}
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

                {/* 본체 — 왼쪽 [홈][배당 알약][원정], 오른쪽 [투표 막대]. flex-wrap + basis 로 좁으면 세로로 접힌다(sm: 변형 없음). */}
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
                  <div className="flex min-w-0 grow basis-[300px] items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right">
                      <TeamName href={m.homeTeamId != null ? `/teams/${m.homeTeamId}` : null} className="line-clamp-2 break-keep text-[13px] font-semibold leading-tight text-neutral-800 dark:text-neutral-100">
                        {teamLabel(m.homeName)}
                      </TeamName>
                      <TeamLogo url={m.homeLogo} name={m.homeName} />
                    </div>
                    <OddsPills m={m} />
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <TeamLogo url={m.awayLogo} name={m.awayName} />
                      <TeamName href={m.awayTeamId != null ? `/teams/${m.awayTeamId}` : null} className="line-clamp-2 break-keep text-[13px] font-semibold leading-tight text-neutral-800 dark:text-neutral-100">
                        {teamLabel(m.awayName)}
                      </TeamName>
                    </div>
                  </div>
                  <div className="min-w-0 grow basis-[240px]">
                    <VotePanel pct={pct} imp={imp} hasDraw={hasDraw} total={pct?.total ?? null} />
                  </div>
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
      </div>
      ))}
    </section>
  );
}

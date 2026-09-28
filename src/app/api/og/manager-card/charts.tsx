// 감독 카드 차트형 5종 — 선수 카드형(fut)·피자(pizza)·순위 흐름(bump)·덤벨(dumbbell)·포스터(poster).
// satori 는 svg 안의 글자를 못 그린다 — 도형만 svg 로, 글자는 절대 위치 div 로 얹는다.
import type { ManagerCardData } from "@/lib/tactical/manager-card-data";
import { Img, signed, RESULT_COLOR, type Theme } from "./parts";

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (cx: number, cy: number, r: number, deg: number) => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))] as const;

// ───────── 선수 카드형 ─────────
export function Fut({ t, d, photo, logo }: { t: Theme; d: ManagerCardData; photo: string | null; logo: string | null }) {
  const W = 700;
  const H = 960;
  const SHORT: Record<string, string> = { ppg: "승점", gf: "득점", ga: "실점", gd: "득실", cs: "무실점", over: "초과" };
  const attrs = d.percentiles.map((p) => ({ label: SHORT[p.key] ?? p.label, v: Math.round(60 + 39 * p.pct) }));
  const overall = Math.round(attrs.reduce((a, x) => a + x.v, 0) / attrs.length);
  const ink = "#2a1d05";
  return (
    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
      <div style={{ display: "flex", position: "relative", width: W, height: H }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fde68a" />
              <stop offset="0.45" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#fcd34d" />
            </linearGradient>
          </defs>
          <path d={`M 60 40 Q ${W / 2} 0 ${W - 60} 40 L ${W - 30} 90 L ${W - 30} ${H - 190} Q ${W - 30} ${H - 120} ${W / 2} ${H - 20} Q 30 ${H - 120} 30 ${H - 190} L 30 90 Z`} fill="url(#gold)" stroke="#fff7d6" strokeWidth="6" />
          <path d={`M 60 40 Q ${W / 2} 0 ${W - 60} 40 L ${W - 30} 90 L ${W - 30} 470 L 30 300 L 30 90 Z`} fill="#ffffff" fillOpacity="0.16" />
        </svg>
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 90, left: 80, alignItems: "center", color: ink }}>
          <span style={{ fontSize: "150px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 0.95 }}>{overall}</span>
          <span style={{ fontSize: "40px", fontFamily: "Oswald", fontWeight: 700 }}>MGR</span>
          <div style={{ display: "flex", width: "90px", height: "3px", background: ink, opacity: 0.4, margin: "12px 0" }} />
          <Img src={logo} size={92} />
        </div>
        <div style={{ display: "flex", position: "absolute", top: 80, left: 300 }}>
          <Img src={photo} size={340} round />
        </div>
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 432, left: 30, width: W - 60, alignItems: "center", color: ink }}>
          <span style={{ fontSize: "58px", fontWeight: 900, letterSpacing: "-0.03em" }}>{d.coach.nameKo}</span>
          <span style={{ fontSize: "26px", fontWeight: 700, opacity: 0.75 }}>{d.team.nameKo} · {d.coach.formation ?? ""}</span>
          <div style={{ display: "flex", width: "520px", height: "3px", background: ink, opacity: 0.35, margin: "12px 0 6px" }} />
          <div style={{ display: "flex", width: "500px", flexWrap: "wrap" }}>
            {attrs.map((a) => (
              <div key={a.label} style={{ display: "flex", width: "250px", alignItems: "center", gap: "14px", padding: "0 30px" }}>
                <span style={{ fontSize: "50px", fontFamily: "Oswald", fontWeight: 700, width: "66px" }}>{a.v}</span>
                <span style={{ fontSize: "30px", fontWeight: 900 }}>{a.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginLeft: "26px", width: "240px" }}>
        {([["이달", `${d.monthRecord.w}승 ${d.monthRecord.d}무 ${d.monthRecord.l}패`], ["시즌", `${d.season.w}승 ${d.season.d}무 ${d.season.l}패`], ["순위", `${d.season.rank}위`], ["연승", `${d.winStreak}`]] as const).map(([k, v]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", padding: "18px 22px", borderRadius: "20px", background: t.panel, border: `1px solid ${t.line}` }}>
            <span style={{ fontSize: "21px", color: t.sub }}>{k}</span>
            <span style={{ fontSize: "34px", fontWeight: 900 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────── 피자 차트 ─────────
export function Pizza({ t, d, photo }: { t: Theme; d: ManagerCardData; photo: string | null }) {
  const S = 968;
  const H = 900;
  const cx = S / 2;
  const cy = H / 2;
  const R0 = 90;
  const R1 = 310;
  const n = d.percentiles.length;
  const step = 360 / n;
  const wedge = (i: number, r: number) => {
    const a0 = i * step + 2;
    const a1 = (i + 1) * step - 2;
    const [x0, y0] = pt(cx, cy, r, a0);
    const [x1, y1] = pt(cx, cy, r, a1);
    const [ix0, iy0] = pt(cx, cy, R0, a0);
    const [ix1, iy1] = pt(cx, cy, R0, a1);
    return `M ${ix0} ${iy0} L ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1} L ${ix1} ${iy1} A ${R0} ${R0} 0 0 0 ${ix0} ${iy0} Z`;
  };
  const COLORS = ["#f59e0b", "#f59e0b", "#38bdf8", "#38bdf8", "#34d399", "#34d399"];
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center" }}>
      <div style={{ display: "flex", position: "relative", width: S, height: H }}>
        <svg width={S} height={H} viewBox={`0 0 ${S} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
          {d.percentiles.map((p, i) => (
            <path key={`bg-${p.key}`} d={wedge(i, R1)} fill={t.track} />
          ))}
          {[0.25, 0.5, 0.75].map((f) => (
            <circle key={f} cx={cx} cy={cy} r={R0 + (R1 - R0) * f} fill="none" stroke={t.line} strokeWidth="2" strokeDasharray="6 8" />
          ))}
          {d.percentiles.map((p, i) => (
            <path key={p.key} d={wedge(i, R0 + (R1 - R0) * Math.max(0.06, p.pct))} fill={COLORS[i % COLORS.length]} />
          ))}
        </svg>
        <div style={{ display: "flex", position: "absolute", left: cx - 80, top: cy - 80 }}>
          <Img src={photo} size={160} round ring={t.fg} />
        </div>
        {d.percentiles.map((p, i) => {
          const mid = (i + 0.5) * step;
          const [lx, ly] = pt(cx, cy, R1 + 78, mid);
          // 값이 낮으면 조각이 짧아 숫자 칸이 가운데 사진을 덮는다 — 사진 밖으로 밀어낸다
          const [vx, vy] = pt(cx, cy, Math.max(R0 + 62, R0 + (R1 - R0) * Math.max(0.06, p.pct) - 44), mid);
          return (
            <div key={p.key} style={{ display: "flex" }}>
              <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: lx - 110, top: ly - 42, width: 220, alignItems: "center" }}>
                <span style={{ fontSize: "24px", color: t.sub }}>{p.label}</span>
                <span style={{ fontSize: "42px", fontFamily: "Oswald", fontWeight: 700 }}>{p.value}</span>
              </div>
              <div style={{ display: "flex", position: "absolute", left: vx - 40, top: vy - 22, width: 80, height: 44, borderRadius: "10px", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "#ffffff", fontSize: "26px", fontFamily: "Oswald", fontWeight: 700 }}>
                {Math.round(p.pct * 100)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "26px", fontSize: "22px", color: t.sub }}>
        {([["#f59e0b", "결과·공격"], ["#38bdf8", "수비·득실"], ["#34d399", "안정·초과 성과"]] as const).map(([c, k]) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ width: "20px", height: "20px", borderRadius: "5px", background: c }} />
            <span>{k}</span>
          </div>
        ))}
        <span>검은 칸 숫자는 백분위</span>
      </div>
    </div>
  );
}

// ───────── 순위 흐름 ─────────
export function Bump({ t, d, logos }: { t: Theme; d: ManagerCardData; logos: (string | null)[] }) {
  const W = 968;
  const H = 960;
  const padL = 70;
  const padR = 300;
  const padT = 30;
  const padB = 70;
  const maxRank = Math.max(8, ...d.bump.teams.flatMap((x) => x.ranks));
  const n = d.bump.rounds;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (W - padL - padR)) / (n - 1));
  const y = (rk: number) => padT + ((rk - 1) * (H - padT - padB)) / (maxRank - 1);
  const ticks = [1, ...Array.from({ length: Math.floor(maxRank / 4) }, (_, i) => (i + 1) * 4)].filter((v) => v <= maxRank);
  const order = [...d.bump.teams.map((tm, i) => ({ tm, i }))].sort((a, b) => Number(a.tm.isWinner) - Number(b.tm.isWinner));
  return (
    <div style={{ display: "flex", position: "relative", width: W, height: H }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", top: 0, left: 0 }}>
        {ticks.map((rk) => (
          <line key={rk} x1={padL} y1={y(rk)} x2={W - padR} y2={y(rk)} stroke={t.line} strokeWidth="2" />
        ))}
        {order.map(({ tm }) => (
          <polyline key={tm.nameKo} points={tm.ranks.map((rk, i) => `${x(i)},${y(rk)}`).join(" ")} fill="none" stroke={tm.isWinner ? t.accent : t.sub} strokeOpacity={tm.isWinner ? 1 : 0.55} strokeWidth={tm.isWinner ? 12 : 6} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {order.flatMap(({ tm }) => tm.ranks.map((rk, i) => (
          <circle key={`${tm.nameKo}-${i}`} cx={x(i)} cy={y(rk)} r={tm.isWinner ? 14 : 9} fill={tm.isWinner ? t.accent : t.sub} />
        )))}
      </svg>
      {ticks.map((rk) => (
        <span key={rk} style={{ position: "absolute", left: 0, top: y(rk) - 18, width: 50, fontSize: "26px", fontFamily: "Oswald", fontWeight: 700, color: t.sub }}>{rk}위</span>
      ))}
      {Array.from({ length: n }, (_, i) => (
        <span key={i} style={{ position: "absolute", left: x(i) - 40, top: H - 50, width: 80, display: "flex", justifyContent: "center", fontSize: "24px", color: t.sub }}>{i + 1}R</span>
      ))}
      {d.bump.teams.map((tm, i) => {
        const rk = tm.ranks[tm.ranks.length - 1];
        return (
          <div key={tm.nameKo} style={{ display: "flex", position: "absolute", left: W - padR + 26, top: y(rk) - 26, alignItems: "center", gap: "10px" }}>
            <Img src={logos[i]} size={52} />
            <span style={{ fontSize: tm.isWinner ? "30px" : "25px", fontWeight: tm.isWinner ? 900 : 700, color: tm.isWinner ? t.accent : t.fg }}>{tm.nameKo}</span>
          </div>
        );
      })}
    </div>
  );
}

// ───────── 덤벨 ─────────
export function Dumbbell({ t, d }: { t: Theme; d: ManagerCardData }) {
  const rows = d.leagueMonth;
  const rowH = Math.min(46, Math.floor(900 / Math.max(rows.length, 1)));
  const TRACK = 520;
  const px = (v: number) => (Math.max(0, Math.min(3, v)) / 3) * TRACK;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ display: "flex", gap: "26px", fontSize: "21px", color: t.sub, marginBottom: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "18px", height: "18px", borderRadius: "999px", border: `4px solid ${t.fg}` }} /><span>기대 승점</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "18px", height: "18px", borderRadius: "999px", background: RESULT_COLOR.W }} /><span>실제(기대 이상)</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "18px", height: "18px", borderRadius: "999px", background: RESULT_COLOR.L }} /><span>실제(기대 이하)</span></div>
      </div>
      {rows.map((r) => {
        const e = r.expectedPpg ?? r.ppg;
        const c = r.over >= 0 ? RESULT_COLOR.W : RESULT_COLOR.L;
        const a = px(Math.min(e, r.ppg));
        const b = px(Math.max(e, r.ppg));
        return (
          <div key={r.nameKo} style={{ display: "flex", alignItems: "center", height: rowH, borderRadius: "10px", background: r.isWinner ? t.panel : "transparent", border: r.isWinner ? `2px solid ${t.accent}` : "2px solid transparent", padding: "0 10px" }}>
            <span style={{ display: "flex", width: "270px", flexShrink: 0, fontSize: "23px", fontWeight: r.isWinner ? 900 : 700, color: r.isWinner ? t.accent : t.fg }}>{r.nameKo}</span>
            <div style={{ display: "flex", position: "relative", width: TRACK + 20, height: rowH - 8, flexShrink: 0 }}>
              <div style={{ position: "absolute", left: 10, top: (rowH - 8) / 2 - 1, width: TRACK, height: 2, background: t.track }} />
              <div style={{ position: "absolute", left: 10 + a, top: (rowH - 8) / 2 - 3, width: Math.max(2, b - a), height: 6, background: c, opacity: 0.7 }} />
              <div style={{ position: "absolute", left: px(e), top: (rowH - 8) / 2 - 10, width: 20, height: 20, borderRadius: "999px", border: `4px solid ${t.fg}`, background: "transparent" }} />
              <div style={{ position: "absolute", left: px(r.ppg), top: (rowH - 8) / 2 - 10, width: 20, height: 20, borderRadius: "999px", background: c }} />
            </div>
            <span style={{ display: "flex", flex: 1, justifyContent: "flex-end", fontSize: "26px", fontFamily: "Oswald", fontWeight: 700, color: c }}>{signed(r.over)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ───────── 포스터 ─────────
export function Poster({ t, d, photo, logo }: { t: Theme; d: ManagerCardData; photo: string | null; logo: string | null }) {
  const r = d.monthRecord;
  const big = d.winStreak >= 2 ? [String(d.winStreak), "연승"] : [String(r.points), "승점"];
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: t.bg, color: t.fg, fontFamily: "Noto" }}>
      <svg width="1080" height="1350" viewBox="0 0 1080 1350" style={{ position: "absolute", top: 0, left: 0 }}>
        {Array.from({ length: 34 }, (_, i) => (
          <line key={i} x1={-400 + i * 60} y1="1350" x2={400 + i * 60} y2="0" stroke={t.fg} strokeOpacity="0.045" strokeWidth="18" />
        ))}
        <circle cx="795" cy="875" r="330" fill={t.accent} fillOpacity="0.16" />
      </svg>
      <div style={{ display: "flex", position: "absolute", right: 50, bottom: 240 }}>
        <Img src={photo} size={470} round ring={t.accent} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", position: "absolute", top: 56, left: 60, right: 60 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "30px", fontWeight: 900 }}>Scorebase</span>
          <span style={{ fontSize: "26px", fontWeight: 700, color: t.sub }}>{d.monthLabel} {d.tag}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "14px", marginTop: "10px" }}>
          <span style={{ fontSize: "430px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 0.95, color: t.accent }}>{big[0]}</span>
          <span style={{ fontSize: "110px", fontWeight: 900, paddingBottom: "40px" }}>{big[1]}</span>
        </div>
        <span style={{ fontSize: "84px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{d.coach.nameKo}</span>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginTop: "12px" }}>
          <Img src={logo} size={60} />
          <span style={{ fontSize: "36px", fontWeight: 700 }}>{d.team.nameKo}</span>
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", left: 60, right: 60, bottom: 56, gap: "14px" }}>
        {([["이달 성적", `${r.w}승${r.d}무${r.l}패`], ["득실", `${r.gf} - ${r.ga}`], ["시즌 승점", String(d.season.points)], ["리그 순위", `${d.season.rank}위`]] as const).map(([k, v]) => (
          <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "20px 22px", borderRadius: "20px", background: t.panel, border: `1px solid ${t.line}` }}>
            <span style={{ fontSize: "21px", color: t.sub }}>{k}</span>
            <span style={{ fontSize: "36px", fontWeight: 900 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

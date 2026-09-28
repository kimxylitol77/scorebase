// GET /api/og/manager-card?id=<이달의 감독 글 번호> 또는 ?match=<경기 번호>&side=home|away, &kind=hero|ring|form|rivals|fut|pizza|bump|dumbbell|poster&theme=club|dark|light — 감독 기록 그림 카드(1080×1350).
// 수치는 글에 저장된 집계와 같은 DB 경기에서 읽는다(loadManagerCard). satori 주의 — 모든 컨테이너 display:flex.
//   hero   — 감독 사진 + 승무패 + 핵심 숫자
//   ring   — 승점 획득률 원형 + 기록 목록
//   form   — 경기별 상대·점수·결과
//   rivals — 경기 전 예측 기대 승점 대비 실제, 상위 4팀
//   fut·pizza·bump·dumbbell·poster — charts.tsx
import { ImageResponse } from "next/og";
import { toDataUri, loadCardFonts, CARD_W, CARD_H, CARD_CACHE } from "@/components/og/weekly-frame";
import { loadManagerCard, loadMatchManagerCard, type ManagerCardData } from "@/lib/tactical/manager-card-data";
import { LEAGUE_DISPLAY } from "@/lib/sports/sport-leagues";
import { themeOf, Img, signed, RESULT_COLOR, RESULT_KO, type Theme } from "./parts";
import { Fut, Pizza, Bump, Dumbbell, Poster } from "./charts";

export const runtime = "nodejs";

function Shell({ t, d, title, sub, children }: { t: Theme; d: ManagerCardData; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "52px 56px", background: t.bg, color: t.fg, fontFamily: "Noto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", fontSize: "30px", fontWeight: 900, letterSpacing: "-0.02em" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", height: "34px" }}>
            {[14, 22, 30].map((h) => (
              <div key={h} style={{ width: "7px", height: `${h}px`, background: t.fg, opacity: 0.5 + h / 60, borderRadius: "2px" }} />
            ))}
          </div>
          <span>Scorebase</span>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          {[LEAGUE_DISPLAY[d.league] ?? d.league, d.monthLabel].map((c) => (
            <div key={c} style={{ display: "flex", fontSize: "21px", fontWeight: 700, padding: "7px 18px", borderRadius: "999px", background: t.panel, border: `1px solid ${t.line}` }}>{c}</div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: "28px" }}>
        <span style={{ fontSize: "60px", fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{title}</span>
        <span style={{ display: "flex", fontSize: "24px", color: t.sub, marginTop: "10px" }}>{sub}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginTop: "30px" }}>{children}</div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "18px", fontSize: "19px", color: t.sub }}>
        <span>scorebase.kr · {d.tag}</span>
        <span>수치는 경기 종료 시점 집계</span>
      </div>
    </div>
  );
}

function Tiles({ t, items }: { t: Theme; items: [string, string][] }) {
  return (
    <div style={{ display: "flex", width: "100%", gap: "14px" }}>
      {items.map(([k, v], i) => (
        <div key={k} style={{ display: "flex", flexDirection: "column", flex: 1, alignItems: "center", padding: "20px 0", borderRadius: "20px", background: t.panel, border: `2px solid ${i === 0 ? t.accent : t.line}` }}>
          <span style={{ fontSize: "20px", color: t.sub }}>{k}</span>
          <span style={{ fontSize: "52px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 1.1, marginTop: "4px", color: i === 0 ? t.accent : t.fg }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function Hero({ t, d, photo, logo }: { t: Theme; d: ManagerCardData; photo: string | null; logo: string | null }) {
  const r = d.monthRecord;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "36px" }}>
        <Img src={photo} size={300} round ring={t.accent} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <Img src={logo} size={64} />
            <span style={{ fontSize: "34px", fontWeight: 700 }}>{d.team.nameKo}</span>
          </div>
          <span style={{ fontSize: "24px", color: t.sub, marginTop: "18px" }}>주 포메이션</span>
          <span style={{ fontSize: "72px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 1.05 }}>{d.coach.formation ?? "-"}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: "34px", padding: "34px 0", borderRadius: "28px", background: t.panel, border: `1px solid ${t.line}` }}>
        {([["승", r.w, RESULT_COLOR.W], ["무", r.d, RESULT_COLOR.D], ["패", r.l, RESULT_COLOR.L]] as const).map(([k, v, c]) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-end", gap: "10px" }}>
            <span style={{ fontSize: "170px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 0.9, color: c }}>{v}</span>
            <span style={{ fontSize: "44px", fontWeight: 900, paddingBottom: "10px" }}>{k}</span>
          </div>
        ))}
      </div>
      <Tiles t={t} items={[["이달 승점", String(r.points)], ["득점", String(r.gf)], ["실점", String(r.ga)], ["리그 순위", `${d.season.rank}위`]]} />
      <Tiles t={t} items={[["시즌 승점", String(d.season.points)], ["시즌 경기", String(d.season.played)], ["시즌 승무패", `${d.season.w}-${d.season.d}-${d.season.l}`], ["시즌 득실", signed(d.season.gf - d.season.ga, 0)]]} />
    </div>
  );
}

function Ring({ t, d, photo, logo }: { t: Theme; d: ManagerCardData; photo: string | null; logo: string | null }) {
  const r = d.monthRecord;
  const rate = r.played ? r.points / (r.played * 3) : 0;
  const R = 200;
  const C = 2 * Math.PI * R;
  const rowsList: [string, string][] = [
    ["이달 성적", `${r.played}경기 ${r.w}승 ${r.d}무 ${r.l}패`],
    ["이달 득실", `${r.gf}득점 ${r.ga}실점`],
    ["시즌 성적", `${d.season.played}경기 ${d.season.w}승 ${d.season.d}무 ${d.season.l}패`],
    ["시즌 승점", `${d.season.points}점`],
    ["리그 순위", `${d.season.teams}팀 중 ${d.season.rank}위`],
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "40px" }}>
        <div style={{ display: "flex", position: "relative", width: "460px", height: "460px", alignItems: "center", justifyContent: "center" }}>
          <svg width="460" height="460" viewBox="0 0 460 460" style={{ position: "absolute", top: 0, left: 0 }}>
            <circle cx="230" cy="230" r={R} fill="none" stroke={t.track} strokeWidth="30" />
            <circle cx="230" cy="230" r={R} fill="none" stroke={t.accent} strokeWidth="30" strokeLinecap="round" strokeDasharray={`${C * rate} ${C}`} transform="rotate(-90 230 230)" />
          </svg>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "24px", color: t.sub }}>승점 획득률</span>
            <span style={{ fontSize: "116px", fontFamily: "Oswald", fontWeight: 700, lineHeight: 1.1, color: t.accent }}>{Math.round(rate * 100)}%</span>
            <span style={{ fontSize: "26px", fontWeight: 700 }}>{r.points} / {r.played * 3} 승점</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "18px" }}>
          <Img src={photo} size={210} round ring={t.line} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Img src={logo} size={44} />
            <span style={{ fontSize: "26px", fontWeight: 700 }}>{d.team.nameKo}</span>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", borderRadius: "28px", background: t.panel, border: `1px solid ${t.line}`, padding: "10px 36px" }}>
        {rowsList.map(([k, v], i) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "22px 0", borderTop: i ? `1px solid ${t.line}` : "none" }}>
            <span style={{ fontSize: "28px", color: t.sub }}>{k}</span>
            <span style={{ fontSize: "34px", fontWeight: 900 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Form({ t, d, logos }: { t: Theme; d: ManagerCardData; logos: (string | null)[] }) {
  const r = d.monthRecord;
  const rows = d.form.slice(-6);
  // 경기 수가 적으면 줄을 키워 아래 빈칸을 없앤다
  const pad = rows.length <= 3 ? 58 : rows.length === 4 ? 38 : 22;
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: rows.length <= 4 ? "24px" : "16px" }}>
        {rows.map((m, i) => (
          <div key={m.date} style={{ display: "flex", alignItems: "center", gap: "22px", padding: `${pad}px 28px`, borderRadius: "24px", background: t.panel, border: `1px solid ${t.line}`, borderLeft: `10px solid ${RESULT_COLOR[m.result]}` }}>
            <div style={{ display: "flex", flexDirection: "column", width: "120px", flexShrink: 0 }}>
              <span style={{ fontSize: "30px", fontFamily: "Oswald", fontWeight: 700 }}>{`${Number(m.date.slice(5, 7))}.${Number(m.date.slice(8))}`}</span>
              <span style={{ fontSize: "20px", color: t.sub }}>{m.homeAway === "H" ? "홈" : "원정"}</span>
            </div>
            <Img src={logos[i]} size={76} />
            <span style={{ display: "flex", flex: 1, fontSize: "34px", fontWeight: 900 }}>{m.opponentKo}</span>
            <span style={{ fontSize: "64px", fontFamily: "Oswald", fontWeight: 700 }}>{m.gf} - {m.ga}</span>
            <div style={{ display: "flex", width: "76px", height: "76px", flexShrink: 0, borderRadius: "999px", alignItems: "center", justifyContent: "center", background: RESULT_COLOR[m.result], color: "#ffffff", fontSize: "34px", fontWeight: 900 }}>{RESULT_KO[m.result]}</div>
          </div>
        ))}
      </div>
      <Tiles t={t} items={[["승점", String(r.points)], ["경기당 득점", (r.gf / r.played).toFixed(1)], ["경기당 실점", (r.ga / r.played).toFixed(1)], ["무실점 경기", String(d.form.filter((m) => m.ga === 0).length)]]} />
    </div>
  );
}

function Rivals({ t, d, logos }: { t: Theme; d: ManagerCardData; logos: (string | null)[] }) {
  const BAR = 640; // 3.0 승점 = 막대 전체
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between" }}>
      <div style={{ display: "flex", gap: "28px", fontSize: "22px", color: t.sub }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "26px", height: "14px", borderRadius: "4px", background: t.accent }} /><span>실제 경기당 승점</span></div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "5px", height: "26px", background: t.fg }} /><span>경기 전 예측 기대치</span></div>
      </div>
      {d.rivals.map((rv, i) => (
        <div key={rv.nameKo} style={{ display: "flex", flexDirection: "column", padding: "24px 28px", borderRadius: "24px", background: t.panel, border: `2px solid ${rv.isWinner ? t.accent : t.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "34px", fontFamily: "Oswald", fontWeight: 700, color: t.sub, width: "34px" }}>{i + 1}</span>
            <Img src={logos[i]} size={60} />
            <span style={{ display: "flex", flex: 1, fontSize: "34px", fontWeight: 900 }}>{rv.nameKo}</span>
            <span style={{ fontSize: "26px", color: t.sub }}>기대 대비</span>
            <span style={{ fontSize: "44px", fontFamily: "Oswald", fontWeight: 700, color: rv.over >= 0 ? RESULT_COLOR.W : RESULT_COLOR.L }}>{signed(rv.over)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "18px", marginTop: "16px" }}>
            <div style={{ display: "flex", position: "relative", width: `${BAR}px`, height: "34px", flexShrink: 0, borderRadius: "999px", background: t.track }}>
              <div style={{ width: `${Math.max(8, (rv.ppg / 3) * BAR)}px`, height: "34px", borderRadius: "999px", background: rv.isWinner ? t.accent : t.sub }} />
              {rv.expectedPpg != null && (
                <div style={{ position: "absolute", left: `${(rv.expectedPpg / 3) * BAR - 3}px`, top: "-8px", width: "6px", height: "50px", borderRadius: "3px", background: t.fg }} />
              )}
            </div>
            <span style={{ fontSize: "40px", fontFamily: "Oswald", fontWeight: 700 }}>{rv.ppg.toFixed(2)}</span>
            {rv.expectedPpg != null && <span style={{ fontSize: "24px", color: t.sub }}>기대 {rv.expectedPpg.toFixed(2)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const id = Number(sp.get("id"));
  const kind = sp.get("kind") ?? "hero";
  const fonts = await loadCardFonts();
  const matchId = Number(sp.get("match"));
  const d = Number.isInteger(matchId) && matchId > 0
    ? await loadMatchManagerCard(matchId, sp.get("side") === "away" ? "away" : "home").catch(() => null)
    : Number.isInteger(id) && id > 0 ? await loadManagerCard(id).catch(() => null) : null;
  if (!d) {
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a", color: "white", fontFamily: "Noto", fontSize: "44px", fontWeight: 900 }}>Scorebase 감독 기록</div>,
      { width: CARD_W, height: CARD_H, fonts, headers: { "Cache-Control": "public, max-age=60" } },
    );
  }
  const t = themeOf(sp.get("theme") ?? "club", d.league);
  const opts = { width: CARD_W, height: CARD_H, fonts, headers: CARD_CACHE };
  const r = d.monthRecord;
  const recordLine = `${r.played}경기 ${r.w}승 ${r.d}무 ${r.l}패 · 승점 ${r.points}`;

  if (kind === "bump") {
    const logos = await Promise.all(d.bump.teams.map((x) => toDataUri(x.logo)));
    return new ImageResponse(<Shell t={t} d={d} title="시즌 순위 흐름" sub={`라운드별 순위 · 상위 6팀과 ${d.bump.teams.filter((x) => x.isWinner).map((x) => x.nameKo).join("·")} 강조`}><Bump t={t} d={d} logos={logos} /></Shell>, opts);
  }
  if (kind === "dumbbell") {
    return new ImageResponse(<Shell t={t} d={d} title="기대와 실제" sub={`${d.monthLabel} 전 구단 · 경기 전 예측 기대 승점과 실제 경기당 승점`}><Dumbbell t={t} d={d} /></Shell>, opts);
  }
  if (kind === "fut" || kind === "pizza" || kind === "poster") {
    const [photo, logo] = await Promise.all([toDataUri(d.coach.photo), toDataUri(d.team.logo)]);
    if (kind === "pizza") {
      return new ImageResponse(<Shell t={t} d={d} title={`${d.coach.nameKo} 지표`} sub={`${d.monthLabel} 리그 ${d.leagueMonth.length}팀 중 백분위 · 바깥일수록 상위`}><Pizza t={t} d={d} photo={photo} /></Shell>, opts);
    }
    if (kind === "poster") return new ImageResponse(<Poster t={t} d={d} photo={photo} logo={logo} />, opts);
    return new ImageResponse(<Shell t={t} d={d} title={d.tag === "이달의 감독" ? "이달의 감독 카드" : `${d.coach.nameKo} 감독 카드`} sub={`${d.monthLabel} · 능력치는 리그 내 백분위를 60~99 로 환산`}><Fut t={t} d={d} photo={photo} logo={logo} /></Shell>, opts);
  }
  if (kind === "form") {
    const logos = await Promise.all(d.form.slice(-6).map((m) => toDataUri(m.opponentLogo)));
    return new ImageResponse(<Shell t={t} d={d} title={`${d.coach.nameKo}의 ${d.monthLabel.split(" ")[1]}`} sub={`${d.team.nameKo} · ${recordLine}`}><Form t={t} d={d} logos={logos} /></Shell>, opts);
  }
  if (kind === "rivals") {
    const logos = await Promise.all(d.rivals.map((rv) => toDataUri(rv.logo)));
    return new ImageResponse(<Shell t={t} d={d} title="기대를 넘어선 팀" sub="경기 전 예측 모델의 기대 승점과 실제 승점 비교"><Rivals t={t} d={d} logos={logos} /></Shell>, opts);
  }
  const [photo, logo] = await Promise.all([toDataUri(d.coach.photo), toDataUri(d.team.logo)]);
  if (kind === "ring") {
    return new ImageResponse(<Shell t={t} d={d} title={d.coach.nameKo} sub={`${d.monthLabel} ${d.tag} · ${d.team.nameKo}`}><Ring t={t} d={d} photo={photo} logo={logo} /></Shell>, opts);
  }
  return new ImageResponse(<Shell t={t} d={d} title={d.coach.nameKo} sub={`${d.monthLabel} ${d.tag} · ${recordLine}`}><Hero t={t} d={d} photo={photo} logo={logo} /></Shell>, opts);
}

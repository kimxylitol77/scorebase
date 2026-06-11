// morning-brief.js — 아침 운영 브리핑 빌더 (nightly-report.sh 가 07:00 에 호출).
// /api/internal/daily-brief(어제 트래픽·적중률·신규 글·봇 실패·오늘 경기)
// + data-sanity + missing-previews 를 텔레그램 한 장으로.
// env: SITE, TOKEN (호출 측에서 주입)

const SITE = process.env.SITE || process.env.SITE_URL || "https://www.scorebase.kr";
const TOKEN = process.env.TOKEN || process.env.INTERNAL_API_TOKEN;
const h = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };
const LG = { WORLD_CUP: "월드컵", KBO: "KBO", MLB: "MLB", NPB: "NPB", EPL: "EPL", NBA: "NBA", NHL: "NHL" };

(async () => {
  const [brief, sanity, prev] = await Promise.all([
    fetch(SITE + "/api/internal/daily-brief", { headers: h }).then((r) => r.json()).catch(() => null),
    fetch(SITE + "/api/internal/data-sanity", { headers: h }).then((r) => r.json()).catch(() => null),
    fetch(SITE + "/api/internal/missing-previews?days=2", { headers: h }).then((r) => r.json()).catch(() => null),
  ]);

  const L = [];
  if (brief && brief.traffic) {
    L.push(`👥 어제 트래픽: 사람 ${brief.traffic.human.toLocaleString()} (유니크 ${brief.traffic.uniqueVisitors}) · 봇 ${brief.traffic.bot.toLocaleString()}`);
    const acc = Object.entries(brief.accuracy || {});
    if (acc.length) L.push("🎯 적중률: " + acc.map(([k, v]) => `${LG[k] || k} ${v.hit}/${v.total}${v.pct != null ? `(${v.pct}%)` : ""}`).join(" · "));
    const arts = Object.entries(brief.newArticles || {});
    if (arts.length) L.push("📝 신규 글: " + arts.map(([k, v]) => `${k} ${v}`).join(" · "));
    if ((brief.failedBots || []).length) L.push("❌ 봇 실패(24h): " + brief.failedBots.map((b) => b.name).join(", "));
    const today = Object.entries(brief.todayMatches || {});
    if (today.length) L.push("📅 오늘: " + today.map(([k, v]) => `${LG[k] || k} ${v}경기`).join(" · "));
  } else {
    L.push("👥 brief 조회 실패");
  }

  const issues = (sanity && sanity.issues) || [];
  const byKind = {};
  for (const i of issues) byKind[i.kind] = (byKind[i.kind] || 0) + 1;
  const high = issues.filter((i) => i.severity === "HIGH").length;
  L.push("🩺 데이터 이상: " + (issues.length === 0 ? "없음 ✅" : Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(", ")));
  if (prev) L.push(`🗂 누락 프리뷰 ${prev.missing_count}건 (야구 투수대기 ${prev.baseball_starter_pending_count})`);

  const sev = high > 0 || ((brief && brief.failedBots) || []).length > 0 ? "WARN" : "INFO";
  await fetch(SITE + "/api/internal/notify", {
    method: "POST", headers: h,
    body: JSON.stringify({ source: "nightly-report", severity: sev, title: "☀️ 아침 운영 브리핑", message: L.join("\n") }),
  }).catch(() => {});
  console.log("[brief] sent:\n" + L.join("\n"));
})().then(() => process.exit(0)).catch((e) => { console.error(e.message); process.exit(1); });

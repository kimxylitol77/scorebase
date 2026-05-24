// 비축구(NBA/MLB/NHL) 25명 매핑 — api 매칭 불가 (무료 plan 시즌 제한 + endpoint 부재)
// → manual offset PK 부여로 직접 upsert.
//
// PK 컨벤션:
//   200_000_000 + idx  → NBA
//   300_000_000 + idx  → MLB
//   400_000_000 + idx  → NHL

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

interface Row {
  api_football_id: number;
  sport: "basketball" | "baseball" | "hockey";
  name_en: string;
  name_ko: string;
  name_ko_alt?: string[];
  team_name_en: string;
  nationality?: string;
}

const NBA: Array<Omit<Row, "api_football_id" | "sport">> = [
  { name_en: "LeBron James", name_ko: "르브론 제임스", team_name_en: "Los Angeles Lakers", nationality: "US" },
  { name_en: "Stephen Curry", name_ko: "스테판 커리", team_name_en: "Golden State Warriors", nationality: "US" },
  { name_en: "Kevin Durant", name_ko: "케빈 듀란트", team_name_en: "Phoenix Suns", nationality: "US" },
  { name_en: "Giannis Antetokounmpo", name_ko: "야니스 아데토쿤보", team_name_en: "Milwaukee Bucks", nationality: "GR" },
  { name_en: "Nikola Jokic", name_ko: "니콜라 요키치", team_name_en: "Denver Nuggets", nationality: "RS" },
  { name_en: "Luka Doncic", name_ko: "루카 돈치치", team_name_en: "Los Angeles Lakers", nationality: "SI" },
  { name_en: "Jayson Tatum", name_ko: "제이슨 테이텀", team_name_en: "Boston Celtics", nationality: "US" },
  { name_en: "Joel Embiid", name_ko: "조엘 엠비드", team_name_en: "Philadelphia 76ers", nationality: "CM" },
  { name_en: "Shai Gilgeous-Alexander", name_ko: "셰이 길저스알렉산더", team_name_en: "Oklahoma City Thunder", nationality: "CA" },
  { name_en: "Victor Wembanyama", name_ko: "빅터 웸반야마", team_name_en: "San Antonio Spurs", nationality: "FR" },
];

const MLB: Array<Omit<Row, "api_football_id" | "sport">> = [
  { name_en: "Shohei Ohtani", name_ko: "오타니 쇼헤이", name_ko_alt: ["오타니"], team_name_en: "Los Angeles Dodgers", nationality: "JP" },
  { name_en: "Aaron Judge", name_ko: "에런 저지", team_name_en: "New York Yankees", nationality: "US" },
  { name_en: "Mookie Betts", name_ko: "무키 베츠", team_name_en: "Los Angeles Dodgers", nationality: "US" },
  { name_en: "Juan Soto", name_ko: "후안 소토", team_name_en: "New York Mets", nationality: "DO" },
  { name_en: "Yordan Alvarez", name_ko: "요르단 알바레스", team_name_en: "Houston Astros", nationality: "CU" },
  { name_en: "Yoshinobu Yamamoto", name_ko: "야마모토 요시노부", team_name_en: "Los Angeles Dodgers", nationality: "JP" },
  { name_en: "Ha-Seong Kim", name_ko: "김하성", team_name_en: "Tampa Bay Rays", nationality: "KR" },
  { name_en: "Hyeseong Kim", name_ko: "김혜성", team_name_en: "Los Angeles Dodgers", nationality: "KR" },
  { name_en: "Jung Hoo Lee", name_ko: "이정후", team_name_en: "San Francisco Giants", nationality: "KR" },
];

const NHL: Array<Omit<Row, "api_football_id" | "sport">> = [
  { name_en: "Connor McDavid", name_ko: "코너 맥데이비드", team_name_en: "Edmonton Oilers", nationality: "CA" },
  { name_en: "Leon Draisaitl", name_ko: "레온 드라이자이틀", team_name_en: "Edmonton Oilers", nationality: "DE" },
  { name_en: "Auston Matthews", name_ko: "오스턴 매슈스", team_name_en: "Toronto Maple Leafs", nationality: "US" },
  { name_en: "Nathan MacKinnon", name_ko: "네이선 매키넌", team_name_en: "Colorado Avalanche", nationality: "CA" },
  { name_en: "Cale Makar", name_ko: "케일 마카", team_name_en: "Colorado Avalanche", nationality: "CA" },
  { name_en: "Sidney Crosby", name_ko: "시드니 크로즈비", team_name_en: "Pittsburgh Penguins", nationality: "CA" },
];

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const rows: Row[] = [
    ...NBA.map((p, i) => ({
      ...p,
      api_football_id: 200_000_001 + i,
      sport: "basketball" as const,
    })),
    ...MLB.map((p, i) => ({
      ...p,
      api_football_id: 300_000_001 + i,
      sport: "baseball" as const,
    })),
    ...NHL.map((p, i) => ({
      ...p,
      api_football_id: 400_000_001 + i,
      sport: "hockey" as const,
    })),
  ];

  console.log(`[seed] 비축구 ${rows.length}건 upsert (NBA ${NBA.length} + MLB ${MLB.length} + NHL ${NHL.length})`);

  const { error, count } = await sb
    .from("players")
    .upsert(
      rows.map((r) => ({
        ...r,
        name_ko_alt: r.name_ko_alt ?? [],
        source: "manual",
        source_confidence: 100,
      })),
      { onConflict: "api_football_id", count: "exact" },
    );

  if (error) {
    console.error("[seed] 실패:", error.message);
    process.exit(1);
  }
  console.log(`[seed] ✅ upsert ${count}건`);

  // 충돌 점검
  const { data: conflicts } = await sb.rpc("detect_name_conflicts");
  const list = (conflicts ?? []) as Array<{ name_ko: string; sports: string[] }>;
  if (list.length === 0) {
    console.log("[seed] 동명이인 충돌 없음 ✅");
  } else {
    console.warn(`[seed] ⚠ 충돌 ${list.length}건:`);
    for (const c of list) {
      console.warn(`  - "${c.name_ko}" — sports=${c.sports.join(",")}`);
    }
  }

  // 최종 카운트
  const { count: total } = await sb
    .from("players")
    .select("*", { count: "exact", head: true });
  const { count: bySport } = await sb
    .from("players")
    .select("*", { count: "exact", head: true })
    .eq("sport", "soccer");
  console.log(`[seed] 총 players: ${total} (축구 ${bySport})`);
}

main();

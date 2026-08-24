// /en/benchmark/data.csv — 벤치마크 원본 예측 전체 (채점 완료분).
//
// 집계만 공개하면 "우리 계산을 믿어라" 가 된다. 페이지의 모든 수치를 남이 직접
// 재현할 수 있도록 예측 한 건 한 건을 낸다. 시장 확률 3열을 같이 실어야
// baseline 까지 재현된다.

import { NextResponse } from "next/server";
import {
  loadBenchmarkRows, BENCHMARK_COLUMNS, BENCHMARK_LICENSE, BENCHMARK_ATTRIBUTION,
  type BenchmarkRow,
} from "@/lib/predict/llm-benchmark";
import { toEnglishTeamName } from "@/lib/i18n/en";

export const revalidate = 3600;

/** RFC 4180 — 쉼표·따옴표·개행이 있으면 감싸고 내부 따옴표는 두 번 쓴다. */
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const rows = await loadBenchmarkRows();
  const out: string[] = [
    `# ${BENCHMARK_ATTRIBUTION}`,
    `# License: ${BENCHMARK_LICENSE}`,
    `# Rows are scored forecasts only, each one written before its event started.`,
    BENCHMARK_COLUMNS.join(","),
  ];
  for (const r of rows) {
    const row: BenchmarkRow = {
      ...r,
      home_team: toEnglishTeamName(r.home_team),
      away_team: toEnglishTeamName(r.away_team),
    };
    out.push(BENCHMARK_COLUMNS.map((c) => cell(row[c])).join(","));
  }
  return new NextResponse(out.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="scorebase-llm-benchmark.csv"',
      "cache-control": "public, max-age=3600, s-maxage=3600",
      "access-control-allow-origin": "*",
    },
  });
}

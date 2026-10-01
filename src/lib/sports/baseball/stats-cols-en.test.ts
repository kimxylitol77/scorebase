// 영어판 야구 열 메타에 한글이 남지 않는지 — 한국어 설명이 바뀌면 여기서 걸린다
import { test } from "node:test";
import assert from "node:assert/strict";
import { columnsFor } from "./stats-table";
import { enStatColumns } from "./stats-cols-en";

test("MLB·KBO 타자·투수 열 전부 영어", () => {
  for (const lg of ["MLB", "KBO"]) for (const role of ["bat", "pit"] as const) {
    for (const c of enStatColumns(columnsFor(role, lg))) {
      assert.ok(!/[가-힣]/.test(`${c.group ?? ""}${c.desc ?? ""}`), `${lg} ${role} ${c.key}: ${c.group} / ${c.desc}`);
    }
  }
});

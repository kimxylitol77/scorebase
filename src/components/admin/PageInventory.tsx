// 페이지 인벤토리 박스 — 그룹 접기/펼치기 + 페이지 카드(설명 길면 클릭으로 펼침). /admin/structure ④ 섹션.
"use client";
import Link from "next/link";
import { useState } from "react";

interface InvPage {
  route: string;
  desc: string;
  dynamic: boolean;
}
interface Group {
  key: string;
  label: string;
  dot: string; // 그룹 색 점 (bg-*)
  bar: string; // 카드 좌측 색 보더 (border-l-*)
  pages: InvPage[];
}

export default function PageInventory({ groups }: { groups: Group[] }) {
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());
  const toggle = (s: Set<string>, k: string) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k);
    else n.add(k);
    return n;
  };

  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        const open = openGroups.has(g.key);
        return (
          <div key={g.key} className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenGroups((s) => toggle(s, g.key))}
              className="w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold bg-neutral-50 dark:bg-neutral-900/40 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition"
            >
              <span className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${g.dot}`} />
                {g.label}
                <span className="text-neutral-400 font-normal tabular-nums">{g.pages.length}</span>
              </span>
              <span className={`text-neutral-400 transition-transform duration-200 ${open ? "rotate-90" : ""}`}>›</span>
            </button>
            {open && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                {g.pages.map((p) => {
                  const exp = openCards.has(p.route);
                  return (
                    <div
                      key={p.route}
                      className={`rounded-lg border border-neutral-200 dark:border-neutral-800 border-l-4 ${g.bar} bg-white dark:bg-neutral-900/40 px-2.5 py-2`}
                    >
                      {p.dynamic ? (
                        <span className="block font-mono text-[11px] text-neutral-500 truncate" title="동적 경로 — 목록에서 항목 클릭 시 접근">
                          {p.route}
                        </span>
                      ) : (
                        <Link href={p.route} className="block font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline truncate">
                          {p.route}
                        </Link>
                      )}
                      {p.desc ? (
                        <p
                          onClick={() => setOpenCards((s) => toggle(s, p.route))}
                          className={`mt-1 text-[11.5px] text-neutral-600 dark:text-neutral-300 leading-snug cursor-pointer ${exp ? "" : "line-clamp-2"}`}
                          title={exp ? "접기" : "전체 보기"}
                        >
                          {p.desc}
                        </p>
                      ) : (
                        <p className="mt-1 text-[11.5px] text-neutral-400 italic">헤더 주석 없음</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

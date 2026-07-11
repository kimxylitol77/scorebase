// /scores 광고 배너를 등록·수정하는 관리자 페이지 (단일 설정 폼)

import { prisma } from "@/lib/db";
import { saveAdBanner } from "./actions";

export const dynamic = "force-dynamic";

const INPUT =
  "w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-sm";

export default async function AdminAdPage() {
  const banner = await prisma.adBanner.findUnique({ where: { id: 1 } });

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">광고 배너</h1>
        <p className="text-sm text-neutral-500 mt-1">
          /scores 상단에 표시할 광고 배너를 관리합니다. 표시를 끄면 배너가
          사라집니다.
        </p>
      </div>

      <form action={saveAdBanner} className="space-y-5">
        <Field label="이미지 URL" hint="배너로 띄울 이미지 주소 (https://...)">
          <input
            name="imageUrl"
            type="url"
            required
            defaultValue={banner?.imageUrl ?? ""}
            placeholder="https://example.com/banner.png"
            className={INPUT}
          />
        </Field>

        <Field
          label="링크 URL (선택)"
          hint="이미지를 클릭하면 이동할 광고주 주소. 비우면 클릭해도 이동하지 않습니다."
        >
          <input
            name="linkUrl"
            type="url"
            defaultValue={banner?.linkUrl ?? ""}
            placeholder="https://advertiser.com"
            className={INPUT}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="너비 (px)" hint="0 이면 원본·반응형">
            <input
              name="width"
              type="number"
              min={0}
              defaultValue={banner?.width ?? 0}
              className={INPUT}
            />
          </Field>
          <Field label="높이 (px)" hint="0 이면 자동">
            <input
              name="height"
              type="number"
              min={0}
              defaultValue={banner?.height ?? 0}
              className={INPUT}
            />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            name="enabled"
            type="checkbox"
            defaultChecked={banner?.enabled ?? false}
            className="w-4 h-4"
          />
          <span className="font-medium">사이트에 표시</span>
        </label>

        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold hover:opacity-90 transition"
        >
          저장
        </button>
      </form>

      {banner?.imageUrl && (
        <div className="mt-10">
          <p className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
            현재 미리보기
          </p>
          <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-4 flex justify-center bg-neutral-50 dark:bg-neutral-900/50">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={banner.imageUrl}
              alt="광고 미리보기"
              width={banner.width || undefined}
              height={banner.height || undefined}
              style={{ maxWidth: "100%", height: "auto" }}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1">{label}</label>
      {hint && <p className="text-xs text-neutral-500 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

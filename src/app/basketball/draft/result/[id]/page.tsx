// 옛 결과 주소 — 세 종목 통합으로 /draft/result/[id] 로 옮겼다. 이미 공유된 링크를 살리려고 넘긴다.
import { permanentRedirect } from "next/navigation";
import { resultPath } from "@/lib/draft/modes";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  permanentRedirect(resultPath((await params).id));
}

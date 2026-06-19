// 부상자 명단 — 리그 미지정 시 기본 리그로 redirect.
import { redirect } from "next/navigation";

export default function InjuriesIndex() {
  redirect("/injuries/EPL");
}

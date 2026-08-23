// /en/injuries — 기본 리그로 redirect (영어판). scripts/en-mirror 로 자동 생성.
import { redirect } from "next/navigation";

export default function InjuriesIndex() {
  redirect("/en/injuries/EPL");
}

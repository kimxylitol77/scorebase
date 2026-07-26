// /en/injuries — 기본 리그(EPL)로 redirect (ko /injuries 와 동일 패턴)
import { redirect } from "next/navigation";

export default function EnInjuriesIndex() {
  redirect("/en/injuries/EPL");
}

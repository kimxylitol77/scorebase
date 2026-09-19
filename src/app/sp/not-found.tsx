// sportspredictions.live 404 — sp 레이아웃 안에서 영어로.
import Link from "next/link";

export default function SpNotFound() {
  return (
    <section className="py-24 text-center">
      <p className="sp-mono text-sm font-bold" style={{ color: "var(--sp-lime)" }}>404</p>
      <h1 className="mt-2 text-3xl font-extrabold">That page does not exist.</h1>
      <p className="mt-3" style={{ color: "var(--sp-fg-muted)" }}>Older URLs from the previous site at this domain were retired.</p>
      <Link href="/" className="sp-btn sp-btn-primary mt-8">Today&apos;s predictions</Link>
    </section>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p className="not-found__code">404</p>
      <h1>Page not found</h1>
      <p className="not-found__description">
        The requested path does not exist. Choose a reliable place to continue.
      </p>
      <nav aria-label="404 recovery links">
        <Link href="/">Home</Link>
        <Link href="/research-room">Public research</Link>
        <Link href="/contact">Contact</Link>
        <Link href="/llms.txt">Agent guide</Link>
        <Link href="/sitemap.xml">Sitemap</Link>
      </nav>
    </main>
  );
}

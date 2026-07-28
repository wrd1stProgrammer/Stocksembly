import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found">
      <p>404</p>
      <h1>That research room does not exist.</h1>
      <Link href="/">Return home</Link>
    </main>
  );
}

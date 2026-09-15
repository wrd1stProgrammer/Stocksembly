import NotFound from "./not-found";

export const metadata = {
  title: "Page not found | Stocksembly",
  robots: { index: false, follow: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body
        style={{
          margin: "10vh auto",
          maxWidth: 640,
          padding: 24,
          fontFamily: "system-ui",
          lineHeight: 1.6,
        }}
      >
        <NotFound />
      </body>
    </html>
  );
}

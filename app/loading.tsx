export default function WorkspaceLoading() {
  return (
    <main
      className="min-h-screen bg-[#08090b] px-5 py-6 text-zinc-100"
      aria-label="Loading workspace"
      aria-live="polite"
      role="status"
    >
      <div className="mx-auto flex w-full max-w-[1600px] gap-5">
        <aside className="hidden h-[calc(100vh-3rem)] w-64 shrink-0 animate-pulse rounded-2xl border border-white/8 bg-white/[0.025] lg:block" />
        <section className="min-w-0 flex-1">
          <div className="mb-5 h-16 animate-pulse rounded-2xl border border-white/8 bg-white/[0.035]" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {["a", "b", "c", "d", "e", "f"].map((key) => (
              <div
                className="h-56 animate-pulse rounded-2xl border border-white/8 bg-white/[0.035]"
                key={key}
              />
            ))}
          </div>
        </section>
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}

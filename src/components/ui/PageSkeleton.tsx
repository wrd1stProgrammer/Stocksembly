type Variant = "home" | "research" | "briefing" | "report" | "office";

function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-lg bg-white/[0.06] motion-safe:animate-pulse ${className}`}
    />
  );
}

function Lines() {
  return (
    <div className="space-y-3">
      <Block className="h-4 w-full" />
      <Block className="h-4 w-5/6" />
      <Block className="h-4 w-2/3" />
    </div>
  );
}

export function PageSkeleton({ variant = "home" }: { variant?: Variant }) {
  const reader = variant === "report" || variant === "office";
  return (
    <main
      className="min-h-dvh bg-[#08090b] text-zinc-100"
      role="status"
      aria-busy="true"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex min-h-dvh">
        {!reader && (
          <aside className="hidden w-60 shrink-0 space-y-8 border-r border-white/10 p-6 lg:block">
            <Block className="mb-12 h-8 w-40" />
            {["dashboard", "research", "briefing", "blog", "glossary"].map(
              (key) => (
                <Block key={key} className="h-6 w-4/5" />
              ),
            )}
            <div className="pt-12">
              <Lines />
            </div>
          </aside>
        )}
        <section className="min-w-0 flex-1">
          <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
            <Block className="h-6 w-36" />
            <Block className="h-8 w-24" />
          </div>
          {reader ? (
            <div className="flex gap-3 p-2">
              <div className="min-w-0 flex-1">
                {variant === "office" ? (
                  <div className="grid h-[75vh] grid-cols-2 gap-4 p-6">
                    {["market", "company", "finance", "risk"].map((key) => (
                      <Block key={key} className="h-full" />
                    ))}
                  </div>
                ) : (
                  <div className="min-h-[85vh] space-y-10 bg-[#f3f2ef] p-6 sm:p-12">
                    <div className="h-5 w-28 rounded bg-black/10 motion-safe:animate-pulse" />
                    <div className="h-12 w-3/4 rounded bg-black/10 motion-safe:animate-pulse" />
                    <div className="h-12 border-y border-black/10" />
                    {[1, 2, 3].map((key) => (
                      <div
                        key={key}
                        className="h-24 rounded bg-black/5 motion-safe:animate-pulse"
                      />
                    ))}
                  </div>
                )}
              </div>
              <aside className="hidden w-80 shrink-0 space-y-12 border-l border-white/10 p-5 lg:block">
                {[1, 2, 3, 4].map((key) => (
                  <Lines key={key} />
                ))}
              </aside>
            </div>
          ) : variant === "home" ? (
            <div className="mx-auto max-w-5xl space-y-10 px-6 py-16">
              <Block className="mx-auto h-12 w-2/3" />
              <Block className="mx-auto h-5 w-1/2" />
              <Block className="h-36 w-full" />
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[1, 2, 3, 4].map((key) => (
                  <Block key={key} className="h-36" />
                ))}
              </div>
            </div>
          ) : (
            <div className="flex gap-5 p-5">
              <aside className="hidden w-52 shrink-0 space-y-7 rounded-xl border border-white/10 p-5 xl:block">
                {[1, 2, 3, 4, 5, 6].map((key) => (
                  <Block key={key} className="h-9" />
                ))}
              </aside>
              <div className="min-w-0 flex-1 space-y-6">
                <Block
                  className={variant === "research" ? "h-14" : "h-6 w-40"}
                />
                <div
                  className={`grid gap-4 md:grid-cols-2 ${variant === "research" ? "2xl:grid-cols-4" : ""}`}
                >
                  {[1, 2, 3, 4, 5, 6].map((key) => (
                    <div
                      key={key}
                      className="space-y-7 rounded-xl border border-white/10 p-6"
                    >
                      <div className="flex items-center gap-3">
                        <Block className="h-10 w-10" />
                        <Block className="h-5 w-20" />
                      </div>
                      {variant === "briefing" && <Block className="h-9 w-32" />}
                      <Lines />
                      <div className="flex justify-between border-t border-white/10 pt-4">
                        <Block className="h-3 w-16" />
                        <Block className="h-3 w-10" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

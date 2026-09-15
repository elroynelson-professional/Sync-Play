export function AuthPageLoading() {
  return (
    <main className="min-h-screen bg-black p-0 text-white">
      <div className="mx-auto flex min-h-screen w-full overflow-hidden bg-[#050505]">
        <aside className="hidden w-[240px] shrink-0 border-r border-white/10 bg-[#090909] md:block" />
        <section className="flex min-w-0 flex-1 flex-col gap-5 bg-[#050505] px-4 py-4 md:px-5 md:py-5">
          <div className="h-[58px] animate-pulse rounded-2xl border border-white/10 bg-[#0d0d0d]" />
          <div className="space-y-4 pt-5">
            <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
            <div className="grid gap-4 md:grid-cols-3">
              {["one", "two", "three"].map((item) => <div key={item} className="h-32 animate-pulse rounded-[20px] border border-white/10 bg-[#0d0d0d]" />)}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

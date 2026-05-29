export function SidebarFallback({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside
      className={
        mobile
          ? "fixed left-0 top-0 z-40 flex h-[100dvh] w-[min(18rem,88vw)] shrink-0 -translate-x-full flex-col border-r lg:relative lg:h-screen lg:w-64 lg:translate-x-0"
          : "flex h-screen w-64 shrink-0 flex-col border-r"
      }
      style={{ background: "hsl(var(--sidebar))" }}
    >
      <div className="animate-pulse px-5 py-5">
        <div className="h-9 w-32 rounded-md bg-muted" />
      </div>
      <div className="flex-1 space-y-3 px-3">
        <div className="h-4 w-20 rounded bg-muted/80" />
        <div className="h-9 rounded-md bg-muted/60" />
        <div className="h-9 rounded-md bg-muted/60" />
      </div>
    </aside>
  );
}

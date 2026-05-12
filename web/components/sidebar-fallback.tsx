export function SidebarFallback() {
  return (
    <aside
      className="flex h-screen w-64 shrink-0 flex-col border-r"
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

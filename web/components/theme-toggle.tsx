"use client";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light",  label: "Light",  icon: Sun },
  { value: "dark",   label: "Dark",   icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!mounted) return <div className="h-8 w-8" />;

  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  const Icon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Theme"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-36 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {OPTIONS.map(({ value, label, icon: Ic }) => (
            <button
              key={value}
              type="button"
              onClick={() => { setTheme(value); setOpen(false); }}
              className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted
                ${theme === value ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              <Ic className="h-3.5 w-3.5 shrink-0" />
              {label}
              {theme === value && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

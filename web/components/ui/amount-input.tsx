"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function idleDisplay(value: number | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "";
  return String(n);
}

function sanitizeAmount(raw: string) {
  const next = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = next.split(".");
  return rest.length ? `${whole}.${rest.join("").replace(/\./g, "")}` : whole;
}

type AmountInputProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onValueChange: (n: number) => void;
};

export const AmountInput = React.forwardRef<HTMLInputElement, AmountInputProps>(
  ({ value, onValueChange, className, onFocus, onBlur, inputMode = "decimal", ...props }, ref) => {
    const [focused, setFocused] = React.useState(false);
    const [draft, setDraft] = React.useState(() => idleDisplay(value));

    React.useEffect(() => {
      if (!focused) setDraft(idleDisplay(value));
    }, [value, focused]);

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode={inputMode}
        className={cn("tabular-nums", className)}
        value={focused ? draft : idleDisplay(value)}
        onFocus={(e) => {
          setFocused(true);
          setDraft(idleDisplay(value));
          onFocus?.(e);
        }}
        onChange={(e) => {
          const cleaned = sanitizeAmount(e.target.value);
          setDraft(cleaned);
          if (cleaned === "" || cleaned === ".") {
            onValueChange(0);
            return;
          }
          const n = Number(cleaned);
          if (Number.isFinite(n)) onValueChange(n);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
      />
    );
  },
);
AmountInput.displayName = "AmountInput";

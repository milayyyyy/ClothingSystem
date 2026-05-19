"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TaskDatePreset } from "@/lib/task-date-filter";

const PRESETS: Array<{ key: TaskDatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "all", label: "All" },
];

type Props = {
  idPrefix: string;
  dateFrom: string;
  dateTo: string;
  allTime: boolean;
  datePreset: TaskDatePreset | null;
  onPreset: (preset: TaskDatePreset) => void;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  filteredCount: number;
  totalCount: number;
  className?: string;
};

export function TaskDateFilterBar({
  idPrefix,
  dateFrom,
  dateTo,
  allTime,
  datePreset,
  onPreset,
  onFromChange,
  onToChange,
  filteredCount,
  totalCount,
  className = "mb-4",
}: Props) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-2 p-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:gap-y-2 sm:p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {PRESETS.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={datePreset === key ? "default" : "outline"}
              className="h-7 px-2 text-xs"
              onClick={() => onPreset(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        <div
          className={`flex items-center gap-1.5 ${allTime ? "pointer-events-none opacity-50" : ""}`}
        >
          <Input
            id={`${idPrefix}-from`}
            type="date"
            aria-label="Start date"
            className="h-8 w-[10.25rem] text-xs tabular-nums"
            value={dateFrom}
            disabled={allTime}
            onChange={(e) => onFromChange(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            id={`${idPrefix}-to`}
            type="date"
            aria-label="End date"
            className="h-8 w-[10.25rem] text-xs tabular-nums"
            value={dateTo}
            disabled={allTime}
            onChange={(e) => onToChange(e.target.value)}
          />
        </div>

        <p className="text-[11px] leading-tight text-muted-foreground sm:ml-auto">
          <span className="font-medium text-foreground">{filteredCount}</span>
          <span> / {totalCount} tasks</span>
          <span className="hidden lg:inline"> · due or created date</span>
        </p>
      </CardContent>
    </Card>
  );
}

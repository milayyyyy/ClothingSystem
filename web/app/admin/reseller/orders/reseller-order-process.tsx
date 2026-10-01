"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { roleLabel } from "@/lib/roles";
import {
  RESELLER_ORDER_PROCESSES,
  RESELLER_PROCESS_FLOW,
  resellerProcessBadge,
  resellerProcessLabel,
  resellerProcessNeedsAccount,
  type ResellerDeskAccount,
  type ResellerOrder,
  type ResellerOrderProcess,
} from "@/lib/reseller-orders";
import { Badge } from "@/components/ui/badge";

const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-sm sm:h-9 sm:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ResellerOrderProcessBar({
  order,
  canChange,
  canAssign,
  accounts,
  onChange,
}: {
  order: ResellerOrder;
  canChange: boolean;
  canAssign: boolean;
  accounts: ResellerDeskAccount[];
  onChange: (process: ResellerOrderProcess, assignedTo?: string) => void;
}) {
  const [assignProcess, setAssignProcess] = useState<ResellerOrderProcess | null>(null);
  const [accountId, setAccountId] = useState(order.assigned_to || accounts[0]?.id || "");
  const paid = order.payment_status === "approved" || !(order.downpayment_amount > 0);

  function pick(next: ResellerOrderProcess) {
    if (!canChange || next === order.process) return;
    if (resellerProcessNeedsAccount(next) && !paid) return;
    const leavingQueue = order.process === "draft" || order.process === "pending_checking" || order.process === "cancelled";
    if (resellerProcessNeedsAccount(next) && leavingQueue) {
      if (!canAssign) return;
      setAccountId(order.assigned_to || accounts[0]?.id || "");
      setAssignProcess(next);
      return;
    }
    onChange(next);
  }

  function send() {
    if (!assignProcess || !accountId) return;
    onChange(assignProcess, accountId);
    setAssignProcess(null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {RESELLER_PROCESS_FLOW.map((step, i) => {
          const active = order.process === step;
          const needsPay = resellerProcessNeedsAccount(step) && !paid;
          const needsAssign =
            resellerProcessNeedsAccount(step) &&
            (order.process === "draft" || order.process === "pending_checking" || order.process === "cancelled") &&
            !canAssign;
          const blocked = !canChange || needsPay || needsAssign;
          return (
            <div key={step} className="flex items-center gap-1.5">
              {i > 0 && <span className="hidden text-muted-foreground sm:inline">—</span>}
              <button
                type="button"
                disabled={blocked && !active}
                onClick={() => pick(step)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none sm:text-xs",
                  active && "border-primary bg-primary/15 text-foreground ring-1 ring-primary/40",
                  !active && !blocked && "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  !active && blocked && "cursor-not-allowed border-border/60 text-muted-foreground/50",
                )}
              >
                {resellerProcessLabel(step)}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          disabled={!canChange || order.process === "cancelled"}
          onClick={() => pick("cancelled")}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none sm:text-xs",
            order.process === "cancelled" && "border-destructive/40 bg-destructive/10 text-destructive ring-1 ring-destructive/30",
            order.process !== "cancelled" && canChange && "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            order.process !== "cancelled" && !canChange && "cursor-not-allowed border-border/60 text-muted-foreground/50",
          )}
        >
          Canceled/failed
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={resellerProcessBadge(order.process)}>{resellerProcessLabel(order.process)}</Badge>
        {order.assigned_name && <span>Sent to {order.assigned_name}</span>}
        {canAssign && resellerProcessNeedsAccount(order.process) && accounts.length > 0 && (
          <label className="flex items-center gap-1.5">
            <span>Send to</span>
            <select
              className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
              value={order.assigned_to || ""}
              onChange={(e) => {
                const id = e.target.value;
                if (id) onChange(order.process, id);
              }}
            >
              <option value="" disabled>
                Select account
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.full_name || account.email || "Account"}
                </option>
              ))}
            </select>
          </label>
        )}
        {canChange && !paid && order.process === "pending_checking" && (
          <span>Approve the downpayment before sending to processing.</span>
        )}
      </div>

      <Dialog
        open={Boolean(assignProcess)}
        onClose={() => setAssignProcess(null)}
        title="Send order"
        description="Choose the account this order should appear under, then move it to processing."
        size="sm"
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Forward to {assignProcess ? resellerProcessLabel(assignProcess) : "processing"} and send it to an account.
          </p>
          <div>
            <Label>Account</Label>
            <select className={`${selectClass} mt-1.5`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {(account.full_name || account.email || "Account") + " · " + roleLabel(account.role)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAssignProcess(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={!accountId} onClick={send}>
              Send
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

export function ResellerOrderProcessReadonly({ process }: { process: ResellerOrderProcess }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {RESELLER_ORDER_PROCESSES.map((row) => (
        <span
          key={row.value}
          className={cn(
            "rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none sm:text-xs",
            process === row.value
              ? "border-primary bg-primary/15 text-foreground"
              : "border-border/60 text-muted-foreground/60",
          )}
        >
          {row.label}
        </span>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CsvExportDialog } from "@/components/csv-export-dialog";

type FinanceAccountRow = {
  id: string;
  name: string;
  kind: "bank" | "ewallet" | "cash" | string;
  balance: number;
  description?: string | null;
  notes?: string | null; // legacy
  opening_balance?: number | null;
  account_name?: string | null;
  account_number?: string | null;
  qr_code_url?: string | null;
  updated_at?: string | null;
};

type FinanceTxRow = {
  id: string;
  occurred_at: string;
  account_id: string;
  direction: "in" | "out" | string;
  amount: number;
  description?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function money(n: number) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: "PHP" }).format(n || 0);
  } catch {
    return (n || 0).toFixed(2);
  }
}

function labelKind(kind: string) {
  if (kind === "bank") return "Bank";
  if (kind === "ewallet") return "E-wallet";
  if (kind === "cash") return "Cash";
  return kind || "—";
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function uiSelectClassName() {
  return "h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
}

export function FinanceClient({
  accounts,
  transactions,
  error,
  flowDateFrom = "",
  flowDateTo = "",
  flowRangeActive = false,
}: {
  accounts: FinanceAccountRow[];
  transactions: FinanceTxRow[];
  error: string | null;
  /** URL `from` for money-flow date filter (YYYY-MM-DD). */
  flowDateFrom?: string;
  /** URL `to` for money-flow date filter (YYYY-MM-DD). */
  flowDateTo?: string;
  /** True when both dates are valid and from <= to (server applied filter). */
  flowRangeActive?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [flowFromInput, setFlowFromInput] = useState(flowDateFrom);
  const [flowToInput, setFlowToInput] = useState(flowDateTo);

  useEffect(() => {
    setFlowFromInput(flowDateFrom);
    setFlowToInput(flowDateTo);
  }, [flowDateFrom, flowDateTo]);

  function applyFlowDateFilter() {
    const from = flowFromInput.trim().slice(0, 10);
    const to = flowToInput.trim().slice(0, 10);
    if (!from && !to) {
      clearFlowDateFilter();
      return;
    }
    if (!from || !to) {
      alert("Set both start date and end date, or clear both to see the latest recorded activity.");
      return;
    }
    if (from > to) {
      alert("Start date must be on or before end date.");
      return;
    }
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("from", from);
    params.set("to", to);
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  function clearFlowDateFilter() {
    setFlowFromInput("");
    setFlowToInput("");
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.delete("from");
    params.delete("to");
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  const [accountOpen, setAccountOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<FinanceAccountRow | null>(null);
  const [accKind, setAccKind] = useState<"bank" | "ewallet" | "cash">("bank");
  const [accName, setAccName] = useState("");
  const [accAccountName, setAccAccountName] = useState("");
  const [accNumber, setAccNumber] = useState("");
  const [accDesc, setAccDesc] = useState("");
  const [accOpening, setAccOpening] = useState("");
  const [accQrFile, setAccQrFile] = useState<File | null>(null);
  const [accQrUrl, setAccQrUrl] = useState<string>("");

  const [txOpen, setTxOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<FinanceTxRow | null>(null);
  const [txDate, setTxDate] = useState(isoDate(new Date()));
  const [txAccountId, setTxAccountId] = useState<string>("");
  const [txDir, setTxDir] = useState<"in" | "out">("in");
  const [txAmount, setTxAmount] = useState("");
  const [txDesc, setTxDesc] = useState("");

  const byId = useMemo(() => {
    const m = new Map<string, FinanceAccountRow>();
    for (const a of accounts || []) m.set(a.id, a);
    return m;
  }, [accounts]);

  const totals = useMemo(() => {
    const t = { bank: 0, ewallet: 0, cash: 0, all: 0 };
    for (const r of accounts || []) {
      const v = Number(r.balance || 0);
      t.all += v;
      if (r.kind === "bank") t.bank += v;
      else if (r.kind === "ewallet") t.ewallet += v;
      else if (r.kind === "cash") t.cash += v;
    }
    return t;
  }, [accounts]);

  function openCreateAccount() {
    setEditingAccount(null);
    setAccKind("bank");
    setAccName("");
    setAccAccountName("");
    setAccNumber("");
    setAccDesc("");
    setAccOpening("");
    setAccQrFile(null);
    setAccQrUrl("");
    setAccountOpen(true);
  }

  function openEditAccount(a: FinanceAccountRow) {
    setEditingAccount(a);
    setAccKind((a.kind as any) || "bank");
    setAccName(a.name || "");
    setAccAccountName((a.account_name || "") ?? "");
    setAccNumber((a.account_number || "") ?? "");
    setAccDesc((a.description || a.notes || "") ?? "");
    setAccOpening(a.opening_balance != null ? String(a.opening_balance) : "");
    setAccQrFile(null);
    setAccQrUrl(a.qr_code_url || "");
    setAccountOpen(true);
  }

  async function uploadQrIfNeeded(accountId: string) {
    if (!accQrFile) return accQrUrl || null;
    const file = accQrFile;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${accountId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("finance-qr")
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (upErr) throw new Error(upErr.message);
    const { data } = supabase.storage.from("finance-qr").getPublicUrl(path);
    return data.publicUrl || null;
  }

  async function saveAccount() {
    if (!accName.trim()) return alert("Account name is required.");
    const opening = accOpening.trim() === "" ? null : Number(accOpening);
    if (opening != null && Number.isNaN(opening)) return alert("Opening balance must be a number.");

    if (editingAccount) {
      try {
        const qrUrl = await uploadQrIfNeeded(editingAccount.id);
        const { error: e } = await supabase
          .from("finance_accounts")
          .update({
            kind: accKind,
            name: accName.trim(),
            account_name: accAccountName.trim() || null,
            account_number: accNumber.trim() || null,
            description: accDesc.trim(),
            ...(opening != null ? { opening_balance: opening } : {}),
            ...(qrUrl ? { qr_code_url: qrUrl } : {}),
          })
          .eq("id", editingAccount.id);
        if (e) return alert(e.message);
      } catch (err: any) {
        return alert(err?.message || "Failed to upload QR code.");
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from("finance_accounts")
        .insert({
          kind: accKind,
          name: accName.trim(),
          account_name: accAccountName.trim() || null,
          account_number: accNumber.trim() || null,
          description: accDesc.trim(),
          ...(opening != null ? { opening_balance: opening, balance: opening } : {}),
        })
        .select("id")
        .single();
      if (insErr) return alert(insErr.message);
      const newId = inserted?.id as string | undefined;
      if (newId) {
        try {
          const qrUrl = await uploadQrIfNeeded(newId);
          if (qrUrl) {
            const { error: e2 } = await supabase.from("finance_accounts").update({ qr_code_url: qrUrl }).eq("id", newId);
            if (e2) return alert(e2.message);
          }
        } catch (err: any) {
          return alert(err?.message || "Account created, but QR upload failed.");
        }
      }
    }

    setAccountOpen(false);
    router.refresh();
  }

  async function deleteAccount(a: FinanceAccountRow) {
    if (!confirm(`Delete "${a.name}"? This will also delete its money flow history.`)) return;
    const { error: e } = await supabase.from("finance_accounts").delete().eq("id", a.id);
    if (e) return alert(e.message);
    router.refresh();
  }

  function openCreateTx() {
    setEditingTx(null);
    setTxDate(isoDate(new Date()));
    setTxDir("in");
    setTxAmount("");
    setTxDesc("");
    setTxAccountId(accounts?.[0]?.id || "");
    setTxOpen(true);
  }

  function openEditTx(t: FinanceTxRow) {
    setEditingTx(t);
    setTxDate(t.occurred_at);
    setTxAccountId(t.account_id);
    setTxDir((t.direction as any) || "in");
    setTxAmount(String(t.amount ?? ""));
    setTxDesc((t.description || "") ?? "");
    setTxOpen(true);
  }

  async function saveTx() {
    if (!txAccountId) return alert("Choose an account.");
    const amt = Number(txAmount);
    if (Number.isNaN(amt) || amt < 0) return alert("Amount must be a valid number (>= 0).");
    if (!txDate) return alert("Date is required.");

    const payload = {
      occurred_at: txDate,
      account_id: txAccountId,
      direction: txDir,
      amount: amt,
      description: txDesc.trim(),
    };

    if (editingTx) {
      const { error: e } = await supabase.from("finance_transactions").update(payload).eq("id", editingTx.id);
      if (e) return alert(e.message);
    } else {
      const { error: e } = await supabase.from("finance_transactions").insert(payload);
      if (e) return alert(e.message);
    }

    setTxOpen(false);
    router.refresh();
  }

  async function deleteTx(t: FinanceTxRow) {
    if (!confirm("Delete this money flow entry?")) return;
    const { error: e } = await supabase.from("finance_transactions").delete().eq("id", t.id);
    if (e) return alert(e.message);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Finance is unavailable until migrations <code className="rounded bg-muted px-1">037_finance_accounts.sql</code> and{" "}
          <code className="rounded bg-muted px-1">038_finance_transactions.sql</code> are applied. ({error})
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Bank</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(totals.bank)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">E-wallet</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(totals.ewallet)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cash</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{money(totals.cash)}</CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/[0.03]">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold text-primary">{money(totals.all)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Accounts</CardTitle>
          <div className="flex gap-2">
            <CsvExportDialog
              label="Export CSV"
              filename="finance_accounts"
              columns={[
                { header: "Type",           value: (r: FinanceAccountRow) => labelKind(r.kind) },
                { header: "Name",           value: (r: FinanceAccountRow) => r.name },
                { header: "Account Name",   value: (r: FinanceAccountRow) => r.account_name ?? "" },
                { header: "Account Number", value: (r: FinanceAccountRow) => r.account_number ?? "" },
                { header: "Balance",        value: (r: FinanceAccountRow) => Number(r.balance || 0) },
                { header: "Description",    value: (r: FinanceAccountRow) => r.description ?? r.notes ?? "" },
              ]}
              fetchRows={async (from, to) => {
                let q = supabase.from("finance_accounts").select("*").order("kind").order("name");
                const { data } = await q;
                return (data as FinanceAccountRow[]) || [];
              }}
            />
            <Button type="button" size="sm" onClick={openCreateAccount}>
              Add account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[220px]">Account name</TableHead>
                  <TableHead className="w-[200px]">Account #</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="min-w-[260px]">Description</TableHead>
                  <TableHead className="w-[90px]">QR</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(accounts || []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      No finance accounts yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((r) => (
                    <TableRow key={r.id} className={cn(r.balance < 0 && "bg-destructive/5")}>
                      <TableCell className="text-sm text-muted-foreground">{labelKind(r.kind)}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.account_name || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.account_number || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(Number(r.balance || 0))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{(r.description || r.notes) ?? "—"}</TableCell>
                      <TableCell className="text-sm">
                        {r.qr_code_url ? (
                          <a
                            href={r.qr_code_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            View
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button type="button" size="sm" variant="outline" onClick={() => openEditAccount(r)} className="mr-2">
                          Edit
                        </Button>
                        <Button type="button" size="sm" variant="destructive" onClick={() => deleteAccount(r)}>
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Money flow (in / out)</CardTitle>
            <p className="text-xs text-muted-foreground">
              {flowRangeActive
                ? `Showing entries whose date is between ${flowDateFrom} and ${flowDateTo}, newest recorded first.`
                : "Showing the most recently recorded activity first (not sorted by transaction date alone)."}
            </p>
          </div>
          <div className="flex shrink-0 self-end gap-2 sm:self-start">
            <CsvExportDialog
              label="Export CSV"
              filename="finance_money_flow"
              columns={[
                { header: "Date",        value: (r: FinanceTxRow) => r.occurred_at },
                { header: "Account",     value: (r: FinanceTxRow) => byId.get(r.account_id)?.name ?? "" },
                { header: "Type",        value: (r: FinanceTxRow) => labelKind(byId.get(r.account_id)?.kind ?? "") },
                { header: "Direction",   value: (r: FinanceTxRow) => r.direction === "in" ? "In" : "Out" },
                { header: "Money In",    value: (r: FinanceTxRow) => r.direction === "in" ? Number(r.amount || 0) : "" },
                { header: "Money Out",   value: (r: FinanceTxRow) => r.direction === "out" ? Number(r.amount || 0) : "" },
                { header: "Description", value: (r: FinanceTxRow) => r.description ?? "" },
                { header: "Recorded",    value: (r: FinanceTxRow) => r.created_at ? String(r.created_at).slice(0, 10) : "" },
              ]}
              fetchRows={async (from, to) => {
                let q = supabase
                  .from("finance_transactions")
                  .select("*")
                  .order("occurred_at", { ascending: false });
                if (from) q = q.gte("occurred_at", from);
                if (to)   q = q.lte("occurred_at", to);
                const { data } = await q;
                return (data as FinanceTxRow[]) || [];
              }}
            />
            <Button type="button" size="sm" onClick={openCreateTx} disabled={(accounts || []).length === 0}>
              Add money flow
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(accounts || []).length > 0 && (
            <div className="flex flex-col gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="grid gap-1 sm:min-w-[160px]">
                <Label htmlFor="flow-from" className="text-xs">
                  Start date
                </Label>
                <Input id="flow-from" type="date" value={flowFromInput} onChange={(e) => setFlowFromInput(e.target.value)} />
              </div>
              <div className="grid gap-1 sm:min-w-[160px]">
                <Label htmlFor="flow-to" className="text-xs">
                  End date
                </Label>
                <Input id="flow-to" type="date" value={flowToInput} onChange={(e) => setFlowToInput(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void applyFlowDateFilter()}>
                  Apply filter
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => void clearFlowDateFilter()} disabled={!flowRangeActive && !flowFromInput && !flowToInput}>
                  Clear
                </Button>
              </div>
            </div>
          )}
          {(accounts || []).length === 0 ? (
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Create an account first to start recording money flow.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px] whitespace-nowrap">Date</TableHead>
                    <TableHead className="w-[150px] text-muted-foreground">Recorded</TableHead>
                    <TableHead className="w-[220px]">Account</TableHead>
                    <TableHead className="w-[120px]">Type</TableHead>
                    <TableHead className="text-right w-[140px]">In</TableHead>
                    <TableHead className="text-right w-[140px]">Out</TableHead>
                    <TableHead className="min-w-[280px]">Description</TableHead>
                    <TableHead className="w-[160px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(transactions || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                        No money flow yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => {
                      const a = byId.get(t.account_id);
                      const dir = t.direction === "out" ? "out" : "in";
                      const rec = t.created_at
                        ? new Date(t.created_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—";
                      return (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{t.occurred_at}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={t.created_at || undefined}>
                            {rec}
                          </TableCell>
                          <TableCell className="font-medium">{a?.name || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{labelKind(a?.kind || "")}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                            {dir === "in" ? money(Number(t.amount || 0)) : "—"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-rose-700 dark:text-rose-300">
                            {dir === "out" ? money(Number(t.amount || 0)) : "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{t.description || "—"}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button type="button" size="sm" variant="outline" onClick={() => openEditTx(t)} className="mr-2">
                              Edit
                            </Button>
                            <Button type="button" size="sm" variant="destructive" onClick={() => deleteTx(t)}>
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={editingAccount ? "Edit account" : "Add account"}
        description="Create or update a finance account (bank, e-wallet, or cash)."
        size="md"
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveAccount();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="acc-kind">Type</Label>
            <select
              id="acc-kind"
              className={uiSelectClassName()}
              value={accKind}
              onChange={(e) => setAccKind(e.target.value as any)}
            >
              <option value="bank">Bank</option>
              <option value="ewallet">E-wallet</option>
              <option value="cash">Cash</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-name">Name</Label>
            <Input id="acc-name" value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="e.g. BPI, GCash, Cash drawer" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-account-name">Account name</Label>
            <Input
              id="acc-account-name"
              value={accAccountName}
              onChange={(e) => setAccAccountName(e.target.value)}
              placeholder="Optional (account holder name)"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-number">Account number</Label>
            <Input
              id="acc-number"
              value={accNumber}
              onChange={(e) => setAccNumber(e.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-desc">Description</Label>
            <Input id="acc-desc" value={accDesc} onChange={(e) => setAccDesc(e.target.value)} placeholder="Optional notes / description" />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-qr">QR code</Label>
            <Input
              id="acc-qr"
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setAccQrFile(f);
                if (f) setAccQrUrl(URL.createObjectURL(f));
              }}
            />
            {accQrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={accQrUrl} alt="QR code preview" className="mt-2 h-40 w-40 rounded-md border object-contain" />
            ) : (
              <p className="text-xs text-muted-foreground">Optional. Upload an image QR for payments/transfers.</p>
            )}
          </div>
          <div className="grid gap-1">
            <Label htmlFor="acc-opening">Opening balance</Label>
            <Input
              id="acc-opening"
              type="number"
              step="0.01"
              value={accOpening}
              onChange={(e) => setAccOpening(e.target.value)}
              placeholder="Optional"
            />
            <p className="text-xs text-muted-foreground">
              Balance is computed as opening balance + total(in) − total(out).
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAccountOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingAccount ? "Save changes" : "Create account"}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={txOpen}
        onClose={() => setTxOpen(false)}
        title={editingTx ? "Edit money flow" : "Add money flow"}
        description="Record money coming in or going out from a specific account."
        size="md"
      >
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveTx();
          }}
        >
          <div className="grid gap-1">
            <Label htmlFor="tx-date">Date</Label>
            <Input id="tx-date" type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tx-account">Account</Label>
            <select
              id="tx-account"
              className={uiSelectClassName()}
              value={txAccountId}
              onChange={(e) => setTxAccountId(e.target.value)}
            >
              {(accounts || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {labelKind(a.kind)} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tx-dir">Direction</Label>
            <select
              id="tx-dir"
              className={uiSelectClassName()}
              value={txDir}
              onChange={(e) => setTxDir(e.target.value as any)}
            >
              <option value="in">Money IN</option>
              <option value="out">Money OUT</option>
            </select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tx-amount">Amount</Label>
            <Input id="tx-amount" type="number" step="0.01" value={txAmount} onChange={(e) => setTxAmount(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label htmlFor="tx-desc">Description</Label>
            <Input id="tx-desc" value={txDesc} onChange={(e) => setTxDesc(e.target.value)} placeholder="e.g. Customer payment, Supplier payment, Cash deposit" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setTxOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingTx ? "Save changes" : "Add entry"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}


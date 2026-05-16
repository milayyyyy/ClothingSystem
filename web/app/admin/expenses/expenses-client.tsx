"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate, cn } from "@/lib/utils";
import { defaultSalesListDateRange } from "@/lib/sales-list";
import { FileImage, Pencil, Plus, Trash2 } from "lucide-react";
import { CsvExportDialog } from "@/components/csv-export-dialog";

const CATS = [
  "Materials", "Fabrics", "Salary", "Employee Expenses", "Marketing",
  "Utilities", "Maintenance", "Logistics", "Supplies", "Equipment", "Rent", "Other",
];

const RECEIPT_BUCKET = "expense-receipts";

export type FinanceAccountOption = { id: string; name: string; kind: string };

function accountKindLabel(kind: string) {
  const k = String(kind || "").toLowerCase();
  if (k === "bank") return "Bank";
  if (k === "ewallet") return "E-wallet";
  return "Cash";
}

function formatAccountOption(a: FinanceAccountOption) {
  return `${a.name} (${accountKindLabel(a.kind)})`;
}

export type SupplierOption = { id: string; name: string };

export type InventoryPickerRow = {
  id: string;
  name: string;
  category: string | null;
  item_type: string | null;
  quantity: number | null;
  unit: string | null;
};

export type EmployeePickerRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
};

type ExpensePurpose = "inventory" | "salary" | "general";

type ExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  notes?: string | null;
  supplier_id?: string | null;
  paid_through?: string | null;
  finance_account_id?: string | null;
  receipt_path?: string | null;
};

function safeReceiptFileName(name: string) {
  const base = name.replace(/[/\\]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.slice(0, 120) || "receipt";
}

function expenseDateKey(expenseDate: string | null | undefined): string {
  return String(expenseDate || "").slice(0, 10);
}

function inDateRange(dateKey: string, from: string, to: string, allTime: boolean) {
  if (allTime) return true;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

export function ExpensesClient({
  initial,
  suppliers,
  financeAccounts,
  inventoryItems = [],
  employees = [],
}: {
  initial: ExpenseRow[];
  suppliers: SupplierOption[];
  financeAccounts: FinanceAccountOption[];
  inventoryItems?: InventoryPickerRow[];
  employees?: EmployeePickerRow[];
}) {
  const supabase = createClient();
  const [list, setList] = useState<ExpenseRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState<ExpenseRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const headerCheckRef = useRef<HTMLInputElement>(null);

  const defaults = useMemo(() => defaultSalesListDateRange(), []);
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [allTime, setAllTime] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [supplierId, setSupplierId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const accountById = useMemo(
    () => Object.fromEntries(financeAccounts.map((a) => [a.id, a])),
    [financeAccounts],
  );

  useEffect(() => {
    setList(initial);
  }, [initial]);

  const supplierNameById = useMemo(
    () => Object.fromEntries(suppliers.map((s) => [s.id, s.name])),
    [suppliers],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((e) => {
      const dateKey = expenseDateKey(e.expense_date);
      if (!inDateRange(dateKey, from, to, allTime)) return false;
      if (category !== "all" && e.category !== category) return false;
      if (accountFilter !== "all") {
        if (accountFilter === "__none__") {
          if (e.finance_account_id) return false;
        } else if (String(e.finance_account_id || "") !== accountFilter) return false;
      }
      if (supplierId !== "all") {
        if (supplierId === "__none__") {
          if (e.supplier_id) return false;
        } else if (String(e.supplier_id || "") !== supplierId) return false;
      }
      if (q) {
        const sup = e.supplier_id ? supplierNameById[e.supplier_id] || "" : "";
        const blob = [
          e.category,
          e.description || "",
          e.notes || "",
          String(e.amount),
          e.paid_through || "",
          e.finance_account_id ? accountById[e.finance_account_id]?.name || "" : "",
          sup,
        ]
          .join(" ")
          .toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [list, from, to, allTime, category, accountFilter, supplierId, search, supplierNameById, accountById]);

  const filteredTotal = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const byCatFiltered: Record<string, number> = {};
  filtered.forEach((e) => {
    byCatFiltered[e.category] = (byCatFiltered[e.category] || 0) + Number(e.amount);
  });
  const biggestFiltered = Object.entries(byCatFiltered).sort((a, b) => b[1] - a[1])[0];

  function applyPreset(p: "month" | "30" | "7" | "all") {
    setAllTime(p === "all");
    if (p === "all") return;
    const now = new Date();
    const toK = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    if (p === "month") {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const fromK = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(first.getDate()).padStart(2, "0")}`;
      setFrom(fromK);
      setTo(toK);
      return;
    }
    const days = p === "30" ? 30 : 7;
    const start = new Date(now);
    start.setDate(start.getDate() - (days - 1));
    const fromK = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
    setFrom(fromK);
    setTo(toK);
  }

  async function refresh() {
    const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
    setList((data as ExpenseRow[]) || []);
    setSelectedIds(new Set());
  }

  // Keep header checkbox in sync (indeterminate state)
  useEffect(() => {
    const el = headerCheckRef.current;
    if (!el) return;
    const sel = selectedIds.size;
    const total = filtered.length;
    el.indeterminate = sel > 0 && sel < total;
    el.checked = total > 0 && sel === total;
  }, [selectedIds, filtered]);

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected expense${selectedIds.size > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkBusy(true);
    const ids = Array.from(selectedIds);
    // Remove receipts for those that have one
    const withReceipts = filtered.filter((e) => ids.includes(e.id) && e.receipt_path);
    if (withReceipts.length > 0) {
      await supabase.storage.from(RECEIPT_BUCKET).remove(withReceipts.map((e) => e.receipt_path!));
    }
    await supabase.from("expenses").delete().in("id", ids);
    setBulkBusy(false);
    await refresh();
  }

  async function openReceipt(path: string) {
    const { data, error } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      alert(error?.message || "Could not open receipt.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function remove(row: ExpenseRow) {
    if (!confirm("Delete this expense?")) return;
    if (row.receipt_path) {
      const { error } = await supabase.storage.from(RECEIPT_BUCKET).remove([row.receipt_path]);
      if (error) console.warn("Receipt delete:", error.message);
    }
    await supabase.from("expenses").delete().eq("id", row.id);
    refresh();
  }

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total in view</div>
            <div className="text-2xl font-semibold">{peso(filteredTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Transactions in view</div>
            <div className="text-2xl font-semibold">{filtered.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Top category (in view)</div>
            <div className="text-2xl font-semibold">{biggestFiltered ? biggestFiltered[0] : "—"}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Quick range</span>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("month")}>
              This month
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("30")}>
              Last 30 days
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => applyPreset("7")}>
              Last 7 days
            </Button>
            <Button type="button" size="sm" variant={allTime ? "default" : "outline"} onClick={() => applyPreset("all")}>
              All time
            </Button>
          </div>

          <div className="grid gap-4 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="ex-from">From</Label>
              <Input
                id="ex-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setAllTime(false);
                  setFrom(e.target.value);
                }}
                className="mt-1"
                disabled={allTime}
              />
            </div>
            <div className={allTime ? "pointer-events-none opacity-50" : ""}>
              <Label htmlFor="ex-to">To</Label>
              <Input
                id="ex-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setAllTime(false);
                  setTo(e.target.value);
                }}
                className="mt-1"
                disabled={allTime}
              />
            </div>
            <div>
              <Label htmlFor="ex-cat">Category</Label>
              <select
                id="ex-cat"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="all">All categories</option>
                {CATS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="ex-paid">Finance account</Label>
              <select
                id="ex-paid"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
              >
                <option value="all">All accounts</option>
                <option value="__none__">Not linked (legacy)</option>
                {financeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatAccountOption(a)}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-2">
              <Label htmlFor="ex-sup">Supplier</Label>
              <select
                id="ex-sup"
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
              >
                <option value="all">All suppliers</option>
                <option value="__none__">No supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="ex-search">Search</Label>
              <Input
                id="ex-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Description, category, amount, supplier…"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <div>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={() => void bulkDelete()}>
              <Trash2 className="mr-1 h-4 w-4" />
              {bulkBusy ? "Deleting…" : `Delete selected (${selectedIds.size})`}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <CsvExportDialog
            label="Export CSV"
            filename="expenses"
            columns={[
              { header: "Date",            value: (r: any) => r.expense_date },
              { header: "Category",        value: (r: any) => r.category },
              { header: "Description",     value: (r: any) => r.description ?? "" },
              { header: "Amount",          value: (r: any) => r.amount },
              { header: "Finance Account", value: (r: any) => r.paid_through ?? "" },
              { header: "Notes",           value: (r: any) => r.notes ?? "" },
            ]}
            fetchRows={async (from, to) => {
              let q = supabase.from("expenses").select("*").order("expense_date", { ascending: false });
              if (from) q = q.gte("expense_date", from);
              if (to)   q = q.lte("expense_date", to);
              const { data } = await q;
              return data || [];
            }}
          />
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Add Expense
          </Button>
        </div>
      </div>

      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full min-w-[780px] text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="w-10 p-2 pl-3">
              <input
                ref={headerCheckRef}
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                onChange={toggleAll}
                disabled={filtered.length === 0}
                aria-label="Select all"
              />
            </th>
            <th className="p-3">Date</th>
            <th className="p-3">Category</th>
            <th className="p-3">Description</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Supplier</th>
            <th className="p-3">Finance account</th>
            <th className="p-3">Receipt</th>
            <th className="p-3 w-24 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {filtered.map((e) => {
              const isSelected = selectedIds.has(e.id);
              return (
                <tr key={e.id} className={`border-t ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}>
                  <td className="p-2 pl-3 align-middle">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-input"
                      checked={isSelected}
                      onChange={() => toggleRow(e.id)}
                      aria-label="Select row"
                    />
                  </td>
                  <td className="p-3 whitespace-nowrap">{formatDate(e.expense_date)}</td>
                  <td className="p-3"><Badge variant="outline">{e.category}</Badge></td>
                  <td className="p-3 max-w-[200px]"><span className="line-clamp-2">{e.description || "—"}</span></td>
                  <td className="p-3 whitespace-nowrap">{peso(e.amount)}</td>
                  <td className="p-3 text-muted-foreground">{(e.supplier_id && supplierNameById[e.supplier_id]) || "—"}</td>
                  <td className="p-3 text-muted-foreground">
                    {e.finance_account_id && accountById[e.finance_account_id]
                      ? formatAccountOption(accountById[e.finance_account_id]!)
                      : e.paid_through || "—"}
                  </td>
                  <td className="p-3">
                    {e.receipt_path ? (
                      <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => openReceipt(e.receipt_path!)}>
                        <FileImage className="h-3.5 w-3.5" />
                        View
                      </Button>
                    ) : (
                      <span className="text-muted-foreground/60">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex justify-end gap-0.5">
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setEditRow(e)} aria-label="Edit expense">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => remove(e)} aria-label="Delete expense">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  {list.length === 0 ? "No expenses." : "No expenses match the current filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent></Card>

      <ExpenseForm
        open={open}
        onClose={() => setOpen(false)}
        onSaved={refresh}
        suppliers={suppliers}
        financeAccounts={financeAccounts}
        inventoryItems={inventoryItems}
        employees={employees}
      />

      <ExpenseEditDialog
        row={editRow}
        open={!!editRow}
        onClose={() => setEditRow(null)}
        onSaved={refresh}
        suppliers={suppliers}
        financeAccounts={financeAccounts}
      />
    </>
  );
}

function employeeLabel(e: EmployeePickerRow) {
  return e.full_name?.trim() || e.email || "—";
}

function inventoryOptionLabel(i: InventoryPickerRow) {
  const q = Number(i.quantity ?? 0);
  const u = (i.unit || "").trim();
  const qty = u ? `${q} ${u}` : String(q);
  const cat = (i.category || "").trim();
  return `${i.name}${cat ? ` · ${cat}` : ""} (${qty})`;
}

type ExpenseFormState = {
  expense_purpose: ExpensePurpose;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  notes: string;
  supplier_id: string;
  finance_account_id: string;
  inventory_id: string;
  stock_mode: "add" | "deduct";
  stock_qty: number;
  employee_id: string;
};

function emptyForm(defaultAccountId: string): ExpenseFormState {
  return {
    expense_purpose: "general",
    expense_date: new Date().toISOString().slice(0, 10),
    category: "Materials",
    description: "",
    amount: 0,
    notes: "",
    supplier_id: "",
    finance_account_id: defaultAccountId,
    inventory_id: "",
    stock_mode: "add",
    stock_qty: 0,
    employee_id: "",
  };
}

function ExpenseForm({
  open,
  onClose,
  onSaved,
  suppliers,
  financeAccounts,
  inventoryItems,
  employees,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  suppliers: SupplierOption[];
  financeAccounts: FinanceAccountOption[];
  inventoryItems: InventoryPickerRow[];
  employees: EmployeePickerRow[];
}) {
  const supabase = createClient();
  const defaultAccountId = financeAccounts[0]?.id || "";
  const [form, setForm] = useState<ExpenseFormState>(() => emptyForm(defaultAccountId));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [invSearch, setInvSearch] = useState("");

  const filteredInventory = useMemo(() => {
    const q = invSearch.trim().toLowerCase();
    if (!q) return inventoryItems;
    return inventoryItems.filter((i) => {
      const blob = [i.name, i.category, i.item_type, i.unit].map((x) => String(x || "").toLowerCase()).join(" ");
      return blob.includes(q);
    });
  }, [inventoryItems, invSearch]);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm(financeAccounts[0]?.id || ""));
    setReceiptFile(null);
    setInvSearch("");
  }, [open, financeAccounts]);

  function set(k: keyof ExpenseFormState, v: string | number) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function setPurpose(p: ExpensePurpose) {
    setForm((f) => {
      const next: ExpenseFormState = { ...f, expense_purpose: p };
      if (p === "salary") {
        next.category = "Salary";
        next.inventory_id = "";
        next.stock_qty = 0;
      } else if (p === "inventory") {
        if (f.category === "Salary") next.category = "Materials";
        next.employee_id = "";
      } else {
        next.inventory_id = "";
        next.stock_qty = 0;
        next.employee_id = "";
        if (f.category === "Salary") next.category = "Materials";
      }
      return next;
    });
  }

  async function rollbackExpenseLedger(expenseId: string, invRestore: { id: string; qty: number } | null) {
    if (invRestore) {
      const { error: ie } = await supabase.from("inventory").update({ quantity: invRestore.qty }).eq("id", invRestore.id);
      if (ie) console.warn("Could not restore inventory quantity:", ie.message);
    }
    await supabase.from("finance_transactions").delete().eq("expense_id", expenseId);
    await supabase.from("expenses").delete().eq("id", expenseId);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(form.amount) || 0;
    const purpose = form.expense_purpose;

    if (purpose === "salary") {
      if (!form.employee_id) {
        alert("Select an employee for this salary expense.");
        return;
      }
      if (amt <= 0) {
        alert("Enter a positive amount for the salary payment.");
        return;
      }
    }

    if (purpose === "inventory" && Number(form.stock_qty) > 0) {
      if (!form.inventory_id) {
        alert("Select an inventory item, or set stock change to 0 if you are not adjusting on-hand quantity.");
        return;
      }
    }

    if (amt > 0 && financeAccounts.length === 0) {
      alert("Add a finance account under Finance before recording an expense with an amount.");
      return;
    }
    if (amt > 0 && !form.finance_account_id) {
      alert("Choose a finance account. The expense amount will be deducted from that account.");
      return;
    }

    setSaving(true);
    let invPrev: { id: string; qty: number } | null = null;
    try {
      const id = crypto.randomUUID();
      const account = financeAccounts.find((a) => a.id === form.finance_account_id);
      const extraNotes: string[] = [];
      if (purpose === "inventory" && form.inventory_id) {
        const inv = inventoryItems.find((x) => x.id === form.inventory_id);
        if (inv) extraNotes.push(`Inventory: ${inv.name}`);
      }
      if (purpose === "salary" && form.employee_id) {
        const emp = employees.find((x) => x.id === form.employee_id);
        if (emp) extraNotes.push(`Salary payout: ${employeeLabel(emp)}`);
      }
      const mergedNotes = [form.notes.trim(), ...extraNotes].filter(Boolean).join("\n") || null;

      const payload = {
        id,
        expense_date: form.expense_date,
        category: form.category,
        description: form.description.trim() || null,
        amount: amt,
        notes: mergedNotes,
        supplier_id: form.supplier_id || null,
        paid_through: amt > 0 && account ? account.name : null,
        finance_account_id: amt > 0 && form.finance_account_id ? form.finance_account_id : null,
        receipt_path: null as string | null,
      };

      const { error: insertErr } = await supabase.from("expenses").insert(payload);
      if (insertErr) {
        alert(insertErr.message);
        return;
      }

      if (amt > 0 && form.finance_account_id) {
        const descParts = [`Expense: ${form.category}`];
        if (form.description.trim()) descParts.push(form.description.trim().slice(0, 120));
        const { error: txErr } = await supabase.from("finance_transactions").insert({
          occurred_at: form.expense_date,
          account_id: form.finance_account_id,
          direction: "out",
          amount: amt,
          description: descParts.join(" — "),
          notes: `expense:${id}`,
          expense_id: id,
        });
        if (txErr) {
          await supabase.from("expenses").delete().eq("id", id);
          alert(txErr.message || "Could not record the deduction on the finance account.");
          return;
        }
      }

      if (purpose === "inventory" && form.inventory_id && Number(form.stock_qty) > 0) {
        const row = inventoryItems.find((x) => x.id === form.inventory_id);
        if (!row) {
          alert("Inventory item not found.");
          await rollbackExpenseLedger(id, null);
          return;
        }
        const cur = Number(row.quantity ?? 0);
        const delta = Number(form.stock_qty);
        const next = form.stock_mode === "add" ? cur + delta : cur - delta;
        if (next < 0) {
          alert("That deduction would make on-hand quantity negative. Lower the quantity or add stock first.");
          await rollbackExpenseLedger(id, null);
          return;
        }
        invPrev = { id: form.inventory_id, qty: cur };
        const { error: invErr } = await supabase
          .from("inventory")
          .update({ quantity: next })
          .eq("id", form.inventory_id);
        if (invErr) {
          alert(invErr.message);
          await rollbackExpenseLedger(id, null);
          return;
        }
      }

      if (purpose === "salary") {
        const period = form.expense_date;
        const { error: salErr } = await supabase.from("salaries").insert({
          user_id: form.employee_id,
          period_start: period,
          period_end: period,
          days_worked: 1,
          gross_pay: amt,
          deductions: 0,
          net_pay: amt,
          paid: true,
          paid_at: new Date().toISOString(),
        });
        if (salErr) {
          alert(salErr.message);
          await rollbackExpenseLedger(id, invPrev);
          return;
        }
      }

      if (receiptFile && receiptFile.size > 0) {
        const path = `${id}/${Date.now()}-${safeReceiptFileName(receiptFile.name)}`;
        const { error: upErr } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .upload(path, receiptFile, { contentType: receiptFile.type || undefined, upsert: false });
        if (upErr) {
          alert(`Expense saved but receipt upload failed: ${upErr.message}`);
        } else {
          const { error: upRow } = await supabase.from("expenses").update({ receipt_path: path }).eq("id", id);
          if (upRow) alert(upRow.message);
        }
      }

      onClose();
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const purpose = form.expense_purpose;
  const submitDisabled =
    saving ||
    (Number(form.amount) > 0 && (financeAccounts.length === 0 || !form.finance_account_id)) ||
    (purpose === "salary" && (!form.employee_id || Number(form.amount) <= 0)) ||
    (purpose === "inventory" && Number(form.stock_qty) > 0 && !form.inventory_id);

  return (
    <Dialog open={open} onClose={onClose} title="Add Expense">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div className="col-span-2 rounded-md border bg-muted/20 p-3">
          <Label className="text-xs font-medium text-muted-foreground">What is this expense for?</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                { p: "inventory" as const, label: "Inventory & ready-made", hint: "Link to an item and adjust stock" },
                { p: "salary" as const, label: "Employee salary", hint: "Record pay and add a payroll row" },
                { p: "general" as const, label: "Other", hint: "Utilities, rent, etc. (no stock or payroll link)" },
              ] as const
            ).map(({ p, label, hint }) => (
              <button
                key={p}
                type="button"
                onClick={() => setPurpose(p)}
                className={cn(
                  "max-w-[14rem] flex-1 rounded-md border p-2.5 text-left text-xs transition-colors sm:min-w-[9rem]",
                  purpose === p ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent",
                )}
              >
                <div className="text-sm font-medium text-foreground">{label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>
              </button>
            ))}
          </div>
        </div>

        {purpose === "inventory" && (
          <div className="col-span-2 space-y-2 rounded-md border border-dashed p-3">
            <Label className="text-xs font-medium text-muted-foreground">Inventory item & stock</Label>
            <Input
              type="search"
              placeholder="Filter items by name, category, type…"
              value={invSearch}
              onChange={(e) => setInvSearch(e.target.value)}
              className="h-9"
            />
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={form.inventory_id}
              onChange={(e) => set("inventory_id", e.target.value)}
            >
              <option value="">Select item…</option>
              {filteredInventory.map((i) => (
                <option key={i.id} value={i.id}>
                  {inventoryOptionLabel(i)}
                </option>
              ))}
            </select>
            {inventoryItems.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No inventory rows yet. Add items under{" "}
                <Link href="/admin/inventory" className="font-medium text-primary underline underline-offset-2">
                  Inventory
                </Link>
                .
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <span className="text-xs text-muted-foreground">Adjust on hand</span>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="stock_mode"
                  checked={form.stock_mode === "add"}
                  onChange={() => set("stock_mode", "add")}
                />
                Add
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="radio"
                  name="stock_mode"
                  checked={form.stock_mode === "deduct"}
                  onChange={() => set("stock_mode", "deduct")}
                />
                Deduct
              </label>
              <div className="flex items-center gap-2">
                <Label htmlFor="inv-stock-qty" className="whitespace-nowrap text-xs">
                  Quantity
                </Label>
                <Input
                  id="inv-stock-qty"
                  type="number"
                  step="0.01"
                  min={0}
                  className="h-8 w-28"
                  value={form.stock_qty}
                  onChange={(e) => set("stock_qty", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Set quantity to 0 if you only want to log the purchase (no stock change). The item&apos;s unit is unchanged.
            </p>
          </div>
        )}

        {purpose === "salary" && (
          <div className="col-span-2 space-y-2 rounded-md border border-dashed p-3">
            <Label htmlFor="exp-employee">Employee</Label>
            <select
              id="exp-employee"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={form.employee_id}
              onChange={(e) => {
                const empId = e.target.value;
                setForm((f) => {
                  const emp = employees.find((x) => x.id === empId);
                  const next = { ...f, employee_id: empId };
                  if (emp && !f.description.trim()) {
                    next.description = `Salary — ${employeeLabel(emp)}`;
                  }
                  return next;
                });
              }}
            >
              <option value="">Select employee…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {employeeLabel(emp)} ({emp.role})
                </option>
              ))}
            </select>
            {employees.length === 0 && (
              <p className="text-xs text-muted-foreground">No employee profiles found (roles employee / sub_admin).</p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Creates a paid salary row for the amount and date (same list as Salary). Finance account is still debited.
            </p>
          </div>
        )}

        <div>
          <Label>Date</Label>
          <Input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} required />
        </div>
        <div>
          <Label>Category</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={form.category}
            disabled={purpose === "salary"}
            onChange={(e) => set("category", e.target.value)}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder={purpose === "salary" ? "Pay period or memo" : "What was purchased"}
          />
        </div>
        <div>
          <Label>Amount (₱)</Label>
          <Input type="number" step="0.01" min={0} value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} required />
        </div>
        <div>
          <Label>Paid through (finance account)</Label>
          {financeAccounts.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No finance accounts yet. Add one under{" "}
              <Link href="/admin/finance" className="font-medium text-primary underline underline-offset-2">
                Finance
              </Link>{" "}
              to deduct expenses from a balance.
            </p>
          ) : (
            <select
              className="mt-1 flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              value={form.finance_account_id}
              onChange={(e) => set("finance_account_id", e.target.value)}
            >
              {financeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {formatAccountOption(a)}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Saving subtracts the amount from this account (same balances as on the Finance page).
          </p>
        </div>
        <div className="col-span-2">
          <Label>Supplier</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            value={form.supplier_id}
            onChange={(e) => set("supplier_id", e.target.value)}
          >
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <Label>Receipt or screenshot</Label>
          <Input
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="cursor-pointer text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:font-medium file:text-primary"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              setReceiptFile(f ?? null);
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">Optional. JPG, PNG, WebP, GIF, or PDF (stored privately).</p>
        </div>
        <div className="col-span-2">
          <Label>Notes</Label>
          <Input value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Internal memo, PO #, etc." />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitDisabled}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const expenseEditSelect = cn(
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background focus-visible:border-primary",
);

type EditExpenseFormState = {
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  supplier_id: string;
  finance_account_id: string;
};

function ExpenseEditDialog({
  row,
  open,
  onClose,
  onSaved,
  suppliers,
  financeAccounts,
}: {
  row: ExpenseRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  suppliers: SupplierOption[];
  financeAccounts: FinanceAccountOption[];
}) {
  const supabase = createClient();
  const [form, setForm] = useState<EditExpenseFormState>({
    expense_date: "",
    category: "Materials",
    description: "",
    amount: 0,
    supplier_id: "",
    finance_account_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row || !open) return;
    setForm({
      expense_date: expenseDateKey(row.expense_date),
      category: row.category || "Materials",
      description: row.description || "",
      amount: Number(row.amount) || 0,
      supplier_id: row.supplier_id || "",
      finance_account_id: row.finance_account_id || "",
    });
  }, [row, open]);

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    const amt = Math.max(0, Math.round((Number(form.amount) || 0) * 100) / 100);
    const financeId = form.finance_account_id.trim() || null;
    const account = financeId ? financeAccounts.find((a) => a.id === financeId) : undefined;

    if (amt > 0 && !financeId) {
      alert("Choose a finance account when the amount is greater than zero.");
      return;
    }
    if (amt > 0 && financeAccounts.length === 0) {
      alert("Add a finance account under Finance first.");
      return;
    }

    setSaving(true);
    try {
      const { data: tx } = await supabase.from("finance_transactions").select("id").eq("expense_id", row.id).maybeSingle();

      const descTrim = form.description.trim();
      const expensePayload = {
        expense_date: form.expense_date,
        category: form.category,
        description: descTrim || null,
        amount: amt,
        supplier_id: form.supplier_id || null,
        finance_account_id: financeId,
        paid_through: amt > 0 && account ? account.name : null,
      };

      const { error: exErr } = await supabase.from("expenses").update(expensePayload).eq("id", row.id);
      if (exErr) {
        alert(exErr.message);
        return;
      }

      const descForTx = descTrim
        ? `Expense: ${form.category} — ${descTrim.slice(0, 120)}`
        : `Expense: ${form.category}`;

      if (amt > 0 && financeId) {
        const txBody = {
          occurred_at: form.expense_date,
          account_id: financeId,
          direction: "out" as const,
          amount: amt,
          description: descForTx,
        };
        if (tx?.id) {
          const { error: txErr } = await supabase.from("finance_transactions").update(txBody).eq("id", tx.id);
          if (txErr) {
            alert(txErr.message);
            return;
          }
        } else {
          const { error: txErr } = await supabase.from("finance_transactions").insert({
            ...txBody,
            notes: `expense:${row.id}`,
            expense_id: row.id,
          });
          if (txErr) {
            alert(txErr.message);
            return;
          }
        }
      } else if (tx?.id) {
        const { error: delErr } = await supabase.from("finance_transactions").delete().eq("id", tx.id);
        if (delErr) {
          alert(delErr.message);
          return;
        }
      }

      onClose();
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!row) return null;

  return (
    <Dialog
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Edit expense"
      description="Updates this row and its linked finance withdrawal (if any)."
      size="md"
    >
      <form onSubmit={(e) => void submitEdit(e)} className="grid gap-3">
        <div>
          <Label htmlFor="ee-date">Date</Label>
          <Input
            id="ee-date"
            type="date"
            className="mt-1 h-9"
            value={form.expense_date}
            onChange={(e) => setForm((f) => ({ ...f, expense_date: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="ee-cat">Category</Label>
          <select
            id="ee-cat"
            className={cn(expenseEditSelect, "mt-1")}
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ee-desc">Description</Label>
          <Input
            id="ee-desc"
            className="mt-1 h-9"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="ee-amt">Amount (₱)</Label>
          <Input
            id="ee-amt"
            type="number"
            step="0.01"
            min={0}
            className="mt-1 h-9"
            value={Number.isFinite(form.amount) ? form.amount : 0}
            onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))}
          />
        </div>
        <div>
          <Label htmlFor="ee-acct">Finance account</Label>
          <select
            id="ee-acct"
            className={cn(expenseEditSelect, "mt-1")}
            value={form.finance_account_id}
            onChange={(e) => setForm((f) => ({ ...f, finance_account_id: e.target.value }))}
          >
            <option value="">None (no deduction / remove ledger row)</option>
            {financeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {formatAccountOption(a)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="ee-sup">Supplier</Label>
          <select
            id="ee-sup"
            className={cn(expenseEditSelect, "mt-1")}
            value={form.supplier_id}
            onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}
          >
            <option value="">None</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

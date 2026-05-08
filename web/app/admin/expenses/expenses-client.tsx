"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso, formatDate } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

const CATS = [
  "Materials", "Fabrics", "Salary", "Employee Expenses", "Marketing",
  "Utilities", "Maintenance", "Logistics", "Supplies", "Equipment", "Rent", "Other",
];

export function ExpensesClient({ initial }: { initial: any[] }) {
  const supabase = createClient();
  const [list, setList] = useState(initial);
  const [open, setOpen] = useState(false);

  async function refresh() {
    const { data } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false });
    setList(data || []);
  }

  async function remove(id: string) {
    if (!confirm("Delete?")) return;
    await supabase.from("expenses").delete().eq("id", id);
    refresh();
  }

  const monthTotal = list
    .filter((e) => new Date(e.expense_date).getMonth() === new Date().getMonth())
    .reduce((s, e) => s + Number(e.amount), 0);
  const byCat: Record<string, number> = {};
  list.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const biggest = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">This Month</div><div className="text-2xl font-semibold">{peso(monthTotal)}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Transactions</div><div className="text-2xl font-semibold">{list.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Biggest category</div><div className="text-2xl font-semibold">{biggest ? biggest[0] : "—"}</div></CardContent></Card>
      </div>

      <div className="mb-3 flex justify-end"><Button onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> Add Expense</Button></div>

      <Card><CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left"><tr>
            <th className="p-3">Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th>
          </tr></thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id} className="border-t hover:bg-muted/30">
                <td className="p-3">{formatDate(e.expense_date)}</td>
                <td><Badge variant="outline">{e.category}</Badge></td>
                <td>{e.description}</td>
                <td>{peso(e.amount)}</td>
                <td className="text-right pr-3"><button onClick={() => remove(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No expenses.</td></tr>}
          </tbody>
        </table>
      </CardContent></Card>

      <ExpenseForm open={open} onClose={() => setOpen(false)} onSaved={refresh} />
    </>
  );
}

function ExpenseForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const supabase = createClient();
  const [form, setForm] = useState<any>({ expense_date: new Date().toISOString().slice(0,10), category: "Materials", description: "", amount: 0, notes: "" });
  function set(k: string, v: any) { setForm((f: any) => ({ ...f, [k]: v })); }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    await supabase.from("expenses").insert(form);
    onClose(); onSaved();
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add Expense">
      <form onSubmit={save} className="grid grid-cols-2 gap-3">
        <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} /></div>
        <div><Label>Category</Label>
          <select className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="col-span-2"><Label>Description</Label><Input value={form.description} onChange={(e) => set("description", e.target.value)} /></div>
        <div><Label>Amount (₱)</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} /></div>
        <div><Label>Reference / Vendor</Label><Input value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} placeholder="Receipt #, supplier..." /></div>
        <div className="col-span-2 flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

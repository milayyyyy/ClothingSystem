"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportAllPdfButton } from "@/components/export-all-pdf-button";
import { InventoryFullStockExportButton } from "@/components/inventory-full-stock-export-button";
import { CsvExportDialog, type CsvColumn } from "@/components/csv-export-dialog";
import { FinanceCsvExportDialog } from "@/components/finance-csv-export-dialog";
import { mergeUnifiedSaleRows, type ManualSaleRow, type UnifiedSaleListRow } from "@/lib/sales-list";

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
};

type ExpenseExportRow = ExpenseRow & {
  supplier_name?: string | null;
  finance_account_name?: string | null;
};

export function AdminExportClient() {
  const supabase = useMemo(() => createClient(), []);

  async function fetchSalesRows(from: string | null, to: string | null): Promise<UnifiedSaleListRow[]> {
    let ordersQuery = supabase
      .from("orders")
      .select(
        "id, order_no, customer_name, kind, order_type, source, notes, design_ref, status, stage, total, down_payment, waybill_no, external_order_no, sku_code, return_status, updated_at, created_at",
      )
      .order("updated_at", { ascending: false });

    let manualQuery = supabase
      .from("manual_sales")
      .select("id, sale_date, amount, description, channel, revenue_channel, product_service, notes, import_key")
      .order("sale_date", { ascending: false });

    if (from) {
      ordersQuery = ordersQuery.gte("updated_at", from);
      manualQuery = manualQuery.gte("sale_date", from);
    }
    if (to) {
      ordersQuery = ordersQuery.lte("updated_at", to);
      manualQuery = manualQuery.lte("sale_date", to);
    }

    const [{ data: orders, error: ordersErr }, { data: manual, error: manualErr }] = await Promise.all([
      ordersQuery,
      manualQuery,
    ]);

    if (ordersErr) {
      alert(ordersErr.message);
      return [];
    }
    if (manualErr) {
      alert(manualErr.message);
      return [];
    }

    const manualRows = (manual || []) as ManualSaleRow[];
    return mergeUnifiedSaleRows(orders || [], manualRows);
  }

  const salesColumns: CsvColumn<UnifiedSaleListRow>[] = [
    { header: "Date", value: (r) => r.dateKey },
    { header: "Channel", value: (r) => r.channel },
    { header: "Amount", value: (r) => r.amount },
    { header: "Order #", value: (r) => r.orderNo ?? "" },
    { header: "Customer / Title", value: (r) => r.customerOrTitle },
    { header: "Store / Notes", value: (r) => r.storeOrNotes },
    { header: "Description", value: (r) => r.description },
    { header: "Waybill", value: (r) => r.waybillNo },
    { header: "External Order #", value: (r) => r.externalOrderNo },
  ];

  async function fetchExpenseRows(from: string | null, to: string | null): Promise<ExpenseExportRow[]> {
    let expensesQuery = supabase
      .from("expenses")
      .select(
        "id,expense_date,category,description,amount,notes,supplier_id,paid_through,finance_account_id,supplier:supplier_id(name),account:finance_account_id(name)",
      )
      .order("expense_date", { ascending: false });

    if (from) expensesQuery = expensesQuery.gte("expense_date", from);
    if (to) expensesQuery = expensesQuery.lte("expense_date", to);

    const { data, error } = await expensesQuery;
    if (error) {
      alert(error.message);
      return [];
    }

    return ((data || []) as any[]).map((e) => ({
      id: e.id,
      expense_date: e.expense_date,
      category: e.category,
      description: e.description,
      amount: e.amount,
      notes: e.notes,
      supplier_id: e.supplier_id,
      paid_through: e.paid_through,
      finance_account_id: e.finance_account_id,
      supplier_name: e.supplier?.name ?? null,
      finance_account_name: e.account?.name ?? null,
    }));
  }

  const expenseColumns: CsvColumn<ExpenseExportRow>[] = [
    { header: "Date", value: (r) => String(r.expense_date || "").slice(0, 10) },
    { header: "Category", value: (r) => r.category },
    { header: "Description", value: (r) => r.description ?? "" },
    { header: "Amount", value: (r) => r.amount },
    { header: "Paid through", value: (r) => r.paid_through ?? "" },
    { header: "Finance account", value: (r) => r.finance_account_name ?? "" },
    { header: "Supplier", value: (r) => r.supplier_name ?? "" },
    { header: "Notes", value: (r) => r.notes ?? "" },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Full report (one PDF)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Combine stock inventory, ready-made sheets, finance balances, money flow, sales, expenses, and activity log
            into a single PDF for one date — no need to export each section separately.
          </p>
          <ExportAllPdfButton />
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Stock inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>All inventory items with current quantities, categories, suppliers, and notes.</p>
          <InventoryFullStockExportButton mode="inventory" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ready-made inventory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>All sheet groups and sheets as stock grids (rows × columns), matching the Ready-made inventory page.</p>
          <InventoryFullStockExportButton mode="ready-made" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Finance balances & money flow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Export finance accounts and money in / out for any date range (set both dates to today for today only).</p>
          <FinanceCsvExportDialog supabase={supabase} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Export completed sales, down payments, and manual revenue rows by date range (set today to see today&apos;s sales).</p>
          <CsvExportDialog<UnifiedSaleListRow>
            label="Export sales CSV"
            filename="sales_list"
            columns={salesColumns}
            fetchRows={fetchSalesRows}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Export recorded expenses for any date range (set today to export just today&apos;s expenses).</p>
          <CsvExportDialog<ExpenseExportRow>
            label="Export expenses CSV"
            filename="expenses"
            columns={expenseColumns}
            fetchRows={fetchExpenseRows}
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}


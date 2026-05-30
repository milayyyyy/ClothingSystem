"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, peso } from "@/lib/utils";
import { MapPin, Pencil, Plus, Search, Settings2, Trash2, Hash } from "lucide-react";
import { MachineTypesDialog, fetchMachineTypes } from "@/components/machine-types-dialog";
import {
  ASSET_STATUS_OPTIONS,
  assetMachineTypeName,
  assetStatusLabel,
  type AssetStatus,
  type InventoryAssetRow,
  type MachineTypeOption,
} from "@/lib/inventory-assets";

const FORM_EMPTY = {
  name: "",
  machine_type_id: "",
  location: "",
  serial_number: "",
  status: "active" as AssetStatus,
  purchase_date: "",
  purchase_cost: "",
  warranty_expires: "",
  notes: "",
};

function statusBadgeVariant(status: string): "green" | "amber" | "muted" {
  if (status === "active") return "green";
  if (status === "repair") return "amber";
  return "muted";
}

export function AssetsClient({
  initial,
  machineTypes,
  canEdit,
}: {
  initial: InventoryAssetRow[];
  machineTypes: MachineTypeOption[];
  canEdit: boolean;
}) {
  const supabase = createClient();
  const [list, setList] = useState<InventoryAssetRow[]>(initial);
  const [machineTypesList, setMachineTypesList] = useState<MachineTypeOption[]>(machineTypes);
  const [typesOpen, setTypesOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryAssetRow | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    setList(initial);
  }, [initial]);

  useEffect(() => {
    setMachineTypesList(machineTypes);
  }, [machineTypes]);

  async function refreshMachineTypes() {
    setMachineTypesList(await fetchMachineTypes(supabase));
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((row) => {
      if (typeFilter !== "all" && row.machine_type_id !== typeFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        row.name,
        row.location,
        row.serial_number,
        row.notes,
        assetMachineTypeName(row),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [list, search, statusFilter, typeFilter]);

  async function refresh() {
    const { data } = await supabase
      .from("inventory_assets")
      .select("*, machine_types(name)")
      .order("sort_order")
      .order("name");
    setList((data as InventoryAssetRow[]) || []);
  }

  async function remove(id: string) {
    if (!confirm("Delete this asset?")) return;
    await supabase.from("inventory_assets").delete().eq("id", id);
    refresh();
  }

  function openCreate() {
    setEditing(null);
    setOpen(true);
  }

  function openEdit(row: InventoryAssetRow) {
    setEditing(row);
    setOpen(true);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search assets…"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            <option value="all">All types</option>
            {machineTypesList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
          >
            <option value="all">All statuses</option>
            {ASSET_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {canEdit && (
            <>
              <Button type="button" variant="outline" onClick={() => setTypesOpen(true)}>
                <Settings2 className="mr-1 h-4 w-4" />
                Machine types
              </Button>
              <Button type="button" onClick={openCreate}>
                <Plus className="mr-1 h-4 w-4" />
                Add asset
              </Button>
            </>
          )}
        </div>
      </div>

      {machineTypesList.length === 0 && canEdit && (
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
          Add machine types first (e.g. DTF Printer, Sublimation Printer), then register each physical unit as an asset.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((row) => {
          const typeName = assetMachineTypeName(row);
          return (
            <Card key={row.id} className="card-hover">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{row.name}</div>
                    {typeName && (
                      <div className="mt-1 text-xs text-muted-foreground">{typeName}</div>
                    )}
                  </div>
                  <Badge variant={statusBadgeVariant(row.status)}>{assetStatusLabel(row.status)}</Badge>
                </div>

                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  {row.location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{row.location}</span>
                    </div>
                  )}
                  {row.serial_number && (
                    <div className="flex items-center gap-1.5">
                      <Hash className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate font-mono text-xs">{row.serial_number}</span>
                    </div>
                  )}
                  {(row.purchase_date || row.purchase_cost != null) && (
                    <div>
                      {row.purchase_date && <span>Purchased {formatDate(row.purchase_date)}</span>}
                      {row.purchase_date && row.purchase_cost != null && " · "}
                      {row.purchase_cost != null && <span>{peso(Number(row.purchase_cost))}</span>}
                    </div>
                  )}
                  {row.warranty_expires && (
                    <div>Warranty until {formatDate(row.warranty_expires)}</div>
                  )}
                </div>

                {row.notes && (
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{row.notes}</p>
                )}

                {canEdit && (
                  <div className="mt-4 flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(row)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => remove(row.id)}>
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-16 text-center text-sm text-muted-foreground">
          {list.length === 0
            ? canEdit
              ? "No assets yet — add your first machine or equipment."
              : "No assets registered yet."
            : "No assets match your filters."}
        </p>
      )}

      <AssetFormDialog
        open={open}
        onClose={() => setOpen(false)}
        editing={editing}
        machineTypes={machineTypesList}
        onSaved={() => {
          setOpen(false);
          refresh();
        }}
      />

      <MachineTypesDialog
        open={typesOpen}
        onClose={() => setTypesOpen(false)}
        onChanged={() => {
          void refreshMachineTypes();
          refresh();
        }}
      />
    </>
  );
}

function AssetFormDialog({
  open,
  onClose,
  editing,
  machineTypes,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: InventoryAssetRow | null;
  machineTypes: MachineTypeOption[];
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(FORM_EMPTY);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        name: editing.name,
        machine_type_id: editing.machine_type_id ?? "",
        location: editing.location ?? "",
        serial_number: editing.serial_number ?? "",
        status: editing.status,
        purchase_date: editing.purchase_date?.slice(0, 10) ?? "",
        purchase_cost: editing.purchase_cost != null ? String(editing.purchase_cost) : "",
        warranty_expires: editing.warranty_expires?.slice(0, 10) ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(FORM_EMPTY);
    }
  }, [open, editing]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setBusy(true);
    const payload = {
      name,
      machine_type_id: form.machine_type_id || null,
      location: form.location.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: form.status,
      purchase_date: form.purchase_date || null,
      purchase_cost: form.purchase_cost.trim() ? Number(form.purchase_cost) : null,
      warranty_expires: form.warranty_expires || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (editing) {
      await supabase.from("inventory_assets").update(payload).eq("id", editing.id);
    } else {
      await supabase.from("inventory_assets").insert(payload);
    }
    setBusy(false);
    onSaved();
  }

  return (
    <Dialog open={open} onClose={onClose} title={editing ? "Edit asset" : "Add asset"} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="asset-name">Name</Label>
            <Input
              id="asset-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. DTF Printer 1"
              required
            />
          </div>
          <div>
            <Label htmlFor="asset-type">Machine type</Label>
            <select
              id="asset-type"
              value={form.machine_type_id}
              onChange={(e) => setForm((f) => ({ ...f, machine_type_id: e.target.value }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              <option value="">— Select type —</option>
              {machineTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="asset-status">Status</Label>
            <select
              id="asset-status"
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as AssetStatus }))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
            >
              {ASSET_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="asset-location">Location</Label>
            <Input
              id="asset-location"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              placeholder="e.g. Production area"
            />
          </div>
          <div>
            <Label htmlFor="asset-serial">Serial number</Label>
            <Input
              id="asset-serial"
              value={form.serial_number}
              onChange={(e) => setForm((f) => ({ ...f, serial_number: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="asset-purchase-date">Purchase date</Label>
            <Input
              id="asset-purchase-date"
              type="date"
              value={form.purchase_date}
              onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="asset-purchase-cost">Purchase cost</Label>
            <Input
              id="asset-purchase-cost"
              type="number"
              min={0}
              step="0.01"
              value={form.purchase_cost}
              onChange={(e) => setForm((f) => ({ ...f, purchase_cost: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="asset-warranty">Warranty expires</Label>
            <Input
              id="asset-warranty"
              type="date"
              value={form.warranty_expires}
              onChange={(e) => setForm((f) => ({ ...f, warranty_expires: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="asset-notes">Notes</Label>
            <textarea
              id="asset-notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              className={cn(
                "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
              )}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {editing ? "Save changes" : "Add asset"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export type AssetStatus = "active" | "repair" | "retired";

export type MachineTypeOption = {
  id: string;
  name: string;
  sort_order: number;
};

export type InventoryAssetRow = {
  id: string;
  name: string;
  machine_type_id: string | null;
  location: string | null;
  serial_number: string | null;
  status: AssetStatus;
  purchase_date: string | null;
  purchase_cost: number | null;
  warranty_expires: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  machine_types?: { name: string } | { name: string }[] | null;
};

export const ASSET_STATUS_OPTIONS: { value: AssetStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "repair", label: "In repair" },
  { value: "retired", label: "Retired" },
];

export function assetStatusLabel(status: string | null | undefined): string {
  return ASSET_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status ?? "—";
}

export function assetMachineTypeName(row: InventoryAssetRow): string {
  const mt = row.machine_types;
  if (!mt) return "";
  if (Array.isArray(mt)) return mt[0]?.name ?? "";
  return mt.name ?? "";
}

import { createClient } from "@/lib/supabase/client";
import {
  RESELLER_SPEC_FIELDS,
  resellerSpecFieldKey,
  type ResellerSpecField,
} from "@/lib/reseller-products";
import { formatSupabaseError } from "@/lib/utils";

export const RESELLER_SPEC_SETTINGS_KEY = "reseller_spec_options";

function asFields(value: unknown): ResellerSpecField[] {
  if (!value) return [];
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { fields?: unknown }).fields)
    ? (raw as { fields: unknown[] }).fields
    : [];
  const out: ResellerSpecField[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as { key?: unknown; label?: unknown; options?: unknown };
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const key = (typeof o.key === "string" && o.key.trim()) || resellerSpecFieldKey(label);
    if (!label || !key || seen.has(key)) continue;
    seen.add(key);
    const options = Array.isArray(o.options)
      ? o.options.map((opt) => String(opt || "").trim()).filter(Boolean)
      : [];
    out.push({ key, label, options });
  }
  return out;
}

export function normalizeResellerSpecFields(value: unknown): ResellerSpecField[] {
  const parsed = asFields(value);
  return parsed.length ? parsed : RESELLER_SPEC_FIELDS.map((field) => ({ ...field, options: [...field.options] }));
}

export async function loadResellerSpecFields() {
  const supabase = createClient();
  const { data, error } = await supabase.from("app_settings").select("value").eq("key", RESELLER_SPEC_SETTINGS_KEY).maybeSingle();
  if (error) return { fields: normalizeResellerSpecFields(null), error: formatSupabaseError(error) };
  return { fields: normalizeResellerSpecFields(data?.value), error: "" };
}

export async function saveResellerSpecFields(fields: ResellerSpecField[]) {
  const supabase = createClient();
  const cleaned = normalizeResellerSpecFields(fields);
  const { error } = await supabase.from("app_settings").upsert({
    key: RESELLER_SPEC_SETTINGS_KEY,
    value: JSON.stringify({ fields: cleaned }),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(formatSupabaseError(error));
  return cleaned;
}

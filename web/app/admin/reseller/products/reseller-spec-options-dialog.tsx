"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { RESELLER_SPEC_FIELDS, newResellerId, resellerSpecFieldKey, type ResellerSpecField } from "@/lib/reseller-products";
import { saveResellerSpecFields } from "@/lib/reseller-spec-options";

export function ResellerSpecOptionsDialog({
  open,
  fields,
  focusKey,
  onClose,
  onSaved,
}: {
  open: boolean;
  fields: ResellerSpecField[];
  focusKey?: string;
  onClose: () => void;
  onSaved: (fields: ResellerSpecField[]) => void;
}) {
  const [draft, setDraft] = useState<ResellerSpecField[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [optionDraft, setOptionDraft] = useState("");
  const [fieldDraft, setFieldDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const next = fields.map((field) => ({ ...field, options: [...field.options] }));
    setDraft(next);
    setSelectedKey(focusKey && next.some((f) => f.key === focusKey) ? focusKey : next[0]?.key || "");
    setOptionDraft("");
    setFieldDraft("");
    setError("");
  }, [open, fields, focusKey]);

  const selected = draft.find((field) => field.key === selectedKey) || null;

  function patchField(key: string, partial: Partial<ResellerSpecField>) {
    setDraft((prev) => prev.map((field) => (field.key === key ? { ...field, ...partial } : field)));
  }

  function addField() {
    const label = fieldDraft.trim();
    if (!label) return;
    const key = resellerSpecFieldKey(label) || newResellerId();
    if (draft.some((field) => field.key === key || field.label.toLowerCase() === label.toLowerCase())) {
      setError("That specification already exists.");
      return;
    }
    setDraft((prev) => [...prev, { key, label, options: [] }]);
    setSelectedKey(key);
    setFieldDraft("");
    setError("");
  }

  function addOption() {
    const label = optionDraft.trim();
    if (!selected || !label) return;
    if (selected.options.some((opt) => opt.toLowerCase() === label.toLowerCase())) {
      setError("That option is already in the list.");
      return;
    }
    patchField(selected.key, { options: [...selected.options, label] });
    setOptionDraft("");
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      onSaved(await saveResellerSpecFields(draft));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save specification lists.");
    }
    setSaving(false);
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title="Customize specifications"
      description="Change the option list for each specification, or add a new specification field."
      size="xl"
    >
      <div className="grid gap-4 sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label>Specification</Label>
          <div className="max-h-72 overflow-y-auto rounded-md border">
            {draft.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => setSelectedKey(field.key)}
                className={cn(
                  "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                  selectedKey === field.key && "bg-primary/10 font-medium",
                )}
              >
                {field.label}
                <span className="ml-1 text-xs text-muted-foreground">({field.options.length})</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={fieldDraft}
              placeholder="New specification"
              onChange={(e) => setFieldDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addField();
                }
              }}
            />
            <Button type="button" size="icon" variant="outline" onClick={addField}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {selected ? (
            <>
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label>Name</Label>
                  <Input
                    className="mt-1.5"
                    value={selected.label}
                    onChange={(e) => patchField(selected.key, { label: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  disabled={draft.length <= 1}
                  onClick={() => {
                    const next = draft.filter((field) => field.key !== selected.key);
                    setDraft(next);
                    setSelectedKey(next[0]?.key || "");
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div>
                <Label>Options</Label>
                <div className="mt-1.5 max-h-56 space-y-1.5 overflow-y-auto">
                  {selected.options.length === 0 && (
                    <p className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
                      No options yet. Add the values this dropdown should show.
                    </p>
                  )}
                  {selected.options.map((opt, i) => (
                    <div key={`${selected.key}-${i}`} className="flex gap-2">
                      <Input
                        value={opt}
                        onChange={(e) =>
                          patchField(
                            selected.key,
                            { options: selected.options.map((row, idx) => (idx === i ? e.target.value : row)) },
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => patchField(selected.key, { options: selected.options.filter((_, idx) => idx !== i) })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={optionDraft}
                    placeholder="Add option"
                    onChange={(e) => setOptionDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addOption();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addOption}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Add a specification to start editing its list.</p>
          )}
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => {
            setDraft(RESELLER_SPEC_FIELDS.map((field) => ({ ...field, options: [...field.options] })));
            setSelectedKey(RESELLER_SPEC_FIELDS[0]?.key || "");
          }}
        >
          Reset defaults
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save lists"}
        </Button>
      </div>
    </Dialog>
  );
}

export function CustomizeSpecButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" size="sm" variant="outline" onClick={onClick}>
      <Pencil className="h-3.5 w-3.5" /> Customize lists
    </Button>
  );
}

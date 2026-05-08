"use client";
import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2 } from "lucide-react";

type L = any;

const ACTION_VARIANT: Record<string, any> = {
  INSERT: "green", UPDATE: "blue", DELETE: "red",
};

export function ActivityClient({ initial, canDelete }: { initial: L[]; canDelete: boolean }) {
  const supabase = createClient();
  const [list, setList] = useState<L[]>(initial);
  const [filter, setFilter] = useState("");
  const [entity, setEntity] = useState<string>("all");

  const filtered = useMemo(() => {
    return list.filter((l) => {
      if (entity !== "all" && l.entity !== entity) return false;
      if (filter) {
        const s = filter.toLowerCase();
        const hay = `${l.actor?.full_name || ""} ${l.actor?.email || ""} ${l.entity} ${l.summary || ""}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [list, filter, entity]);

  const entities = Array.from(new Set(list.map((l) => l.entity)));

  async function remove(id: string) {
    if (!confirm("Delete this audit record? Admins only — this is irreversible.")) return;
    await supabase.from("activity_logs").delete().eq("id", id);
    setList((p) => p.filter((x) => x.id !== id));
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input className="w-64" placeholder="Search actor or summary…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <select className="h-9 rounded-md border bg-transparent px-3 text-sm" value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="all">All entities</option>
          {entities.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} of {list.length} records</span>
      </div>
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left font-medium">When</th>
                <th className="text-left font-medium">Actor</th>
                <th className="text-left font-medium">Action</th>
                <th className="text-left font-medium">Entity</th>
                <th className="text-left font-medium">Summary</th>
                {canDelete && <th></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-t row-hover hover:bg-muted/30">
                  <td className="px-4 py-2 text-xs text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                  <td>
                    <div className="text-sm">{l.actor?.full_name || l.actor?.email || "—"}</div>
                    {l.actor_role && <div className="text-[11px] capitalize text-muted-foreground">{l.actor_role.replace("_", " ")}</div>}
                  </td>
                  <td><Badge variant={ACTION_VARIANT[l.action] || "outline"}>{l.action}</Badge></td>
                  <td className="font-mono text-xs">{l.entity}</td>
                  <td className="text-xs text-muted-foreground">{l.summary}</td>
                  {canDelete && (
                    <td className="px-3"><button onClick={() => remove(l.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={canDelete ? 6 : 5} className="p-8 text-center text-muted-foreground">No activity matches.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}

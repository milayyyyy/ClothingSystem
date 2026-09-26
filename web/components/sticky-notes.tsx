"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useConfirmAction } from "@/components/confirm-dialog";
import { roleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { GripHorizontal, Minus, Plus, Share2, StickyNote, Trash2, Users, X } from "lucide-react";

export type StickyNoteColor = "yellow" | "pink" | "blue" | "green" | "purple";

export type StickyNoteRow = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  color: StickyNoteColor;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  z_index: number;
  is_minimized: boolean;
  created_at?: string;
};

type NoteAccount = { id: string; full_name: string | null; email: string | null; role: string };
type NoteShare = { note_id: string; shared_with: string };

const COLORS: StickyNoteColor[] = ["yellow", "pink", "blue", "green", "purple"];

const COLOR_STYLES: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-50 border-amber-200/90 dark:bg-amber-950/70 dark:border-amber-800",
  pink: "bg-rose-50 border-rose-200/90 dark:bg-rose-950/70 dark:border-rose-800",
  blue: "bg-sky-50 border-sky-200/90 dark:bg-sky-950/70 dark:border-sky-800",
  green: "bg-emerald-50 border-emerald-200/90 dark:bg-emerald-950/70 dark:border-emerald-800",
  purple: "bg-violet-50 border-violet-200/90 dark:bg-violet-950/70 dark:border-violet-800",
};

const COLOR_DOT: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-400",
  pink: "bg-rose-400",
  blue: "bg-sky-400",
  green: "bg-emerald-400",
  purple: "bg-violet-400",
};

const PANEL_W = 380;
const PANEL_H = 460;

function accountName(a: NoteAccount) {
  return a.full_name?.trim() || a.email || "Account";
}

function tabLabel(note: StickyNoteRow) {
  const t = note.title.trim();
  return t || "Untitled";
}

function sharesMissing(message: string) {
  return /sticky_note_shares|list_note_accounts|schema cache|does not exist/i.test(message);
}

function panelStorageKey(userId: string) {
  return `cs-notes-panel:${userId}`;
}

function readPanelPos(userId: string) {
  if (typeof window === "undefined") return { x: 24, y: 88 };
  try {
    const raw = localStorage.getItem(panelStorageKey(userId));
    if (!raw) return { x: Math.max(16, window.innerWidth - PANEL_W - 24), y: 88 };
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    return {
      x: Math.max(8, Number(parsed.x) || 24),
      y: Math.max(56, Number(parsed.y) || 88),
    };
  } catch {
    return { x: 24, y: 88 };
  }
}

export function StickyNotes({ userId }: { userId: string }) {
  const supabase = createClient();
  const { ask, dialog } = useConfirmAction();
  const [notes, setNotes] = useState<StickyNoteRow[]>([]);
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [accounts, setAccounts] = useState<NoteAccount[]>([]);
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [banner, setBanner] = useState("");
  const [pos, setPos] = useState(() => readPanelPos(userId));
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const persist = useCallback(
    (id: string, patch: Partial<StickyNoteRow>) => {
      clearTimeout(saveTimers.current[id]);
      saveTimers.current[id] = setTimeout(async () => {
        const { error } = await supabase
          .from("sticky_notes")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id);
        if (error) console.error("sticky note save:", error.message);
      }, 400);
    },
    [supabase],
  );

  const load = useCallback(async () => {
    const [{ data, error }, sharesRes, accountsRes] = await Promise.all([
      supabase.from("sticky_notes").select("*").order("created_at", { ascending: true }),
      supabase.from("sticky_note_shares").select("note_id, shared_with"),
      supabase.rpc("list_note_accounts"),
    ]);
    if (error) {
      console.error("sticky notes load:", error.message);
      setLoaded(true);
      return;
    }
    const next = (data as StickyNoteRow[]) || [];
    setNotes(next);
    setActiveId((prev) => (prev && next.some((n) => n.id === prev) ? prev : next[0]?.id ?? null));

    if (sharesRes.error) {
      if (sharesMissing(sharesRes.error.message) || sharesMissing(accountsRes.error?.message || "")) {
        setBanner("Apply migration 116 to share notes with other accounts.");
      }
      setShares([]);
    } else {
      setShares((sharesRes.data as NoteShare[]) || []);
      if (!accountsRes.error) setBanner("");
    }
    if (accountsRes.error) {
      if (sharesMissing(accountsRes.error.message)) {
        setBanner("Apply migration 116 to share notes with other accounts.");
      }
      setAccounts([]);
    } else {
      setAccounts((accountsRes.data as NoteAccount[]) || []);
    }
    setLoaded(true);
  }, [supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  useEffect(() => {
    try {
      localStorage.setItem(panelStorageKey(userId), JSON.stringify(pos));
    } catch {
      /* ignore */
    }
  }, [pos, userId]);

  const ownNotes = useMemo(() => notes.filter((n) => n.user_id === userId), [notes, userId]);
  const sharedNotes = useMemo(() => notes.filter((n) => n.user_id !== userId), [notes, userId]);
  const ordered = useMemo(() => [...ownNotes, ...sharedNotes], [ownNotes, sharedNotes]);
  const active = ordered.find((n) => n.id === activeId) || ordered[0] || null;
  const isOwner = !!active && active.user_id === userId;
  const activeShares = shares.filter((s) => s.note_id === active?.id);
  const ownerAccount = accounts.find((a) => a.id === active?.user_id);

  async function addNote() {
    const row = {
      user_id: userId,
      title: "New note",
      body: "",
      color: "yellow" as StickyNoteColor,
      pos_x: 32,
      pos_y: 88,
      width: 240,
      height: 200,
      z_index: notes.length + 1,
      is_minimized: false,
    };
    const { data, error } = await supabase.from("sticky_notes").insert(row).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    const created = data as StickyNoteRow;
    setNotes((prev) => [...prev, created]);
    setActiveId(created.id);
    setVisible(true);
    setMinimized(false);
  }

  function patchNote(id: string, patch: Partial<StickyNoteRow>) {
    const note = notes.find((n) => n.id === id);
    if (!note || note.user_id !== userId) return;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    persist(id, patch);
  }

  function deleteNote(id: string) {
    const note = notes.find((n) => n.id === id);
    if (!note || note.user_id !== userId) return;
    ask({
      title: "Delete note?",
      description: `"${tabLabel(note)}" will be removed for you and anyone it is shared with.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        clearTimeout(saveTimers.current[id]);
        const { error } = await supabase.from("sticky_notes").delete().eq("id", id);
        if (error) {
          alert(error.message);
          return;
        }
        const next = notes.filter((n) => n.id !== id);
        setNotes(next);
        setShares((prev) => prev.filter((s) => s.note_id !== id));
        setActiveId((prev) => (prev === id ? next[0]?.id ?? null : prev));
      },
    });
  }

  async function saveShares(noteId: string, nextIds: string[]) {
    const current = shares.filter((s) => s.note_id === noteId).map((s) => s.shared_with);
    const add = nextIds.filter((id) => !current.includes(id));
    const remove = current.filter((id) => !nextIds.includes(id));
    if (add.length) {
      const { error } = await supabase
        .from("sticky_note_shares")
        .insert(add.map((shared_with) => ({ note_id: noteId, shared_with })));
      if (error) {
        alert(sharesMissing(error.message) ? "Apply migration 116 to share notes." : error.message);
        return;
      }
    }
    if (remove.length) {
      const { error } = await supabase
        .from("sticky_note_shares")
        .delete()
        .eq("note_id", noteId)
        .in("shared_with", remove);
      if (error) {
        alert(error.message);
        return;
      }
    }
    setShares((prev) => [
      ...prev.filter((s) => s.note_id !== noteId),
      ...nextIds.map((shared_with) => ({ note_id: noteId, shared_with })),
    ]);
    setShareOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant={visible ? "soft" : "outline"}
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => {
          setVisible((v) => !v);
          setMinimized(false);
        }}
        title="Notes"
      >
        <StickyNote className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Notes</span>
        {loaded && notes.length > 0 && (
          <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary">
            {notes.length}
          </span>
        )}
      </Button>

      {visible && (
        <NotesPanel
          pos={pos}
          setPos={setPos}
          minimized={minimized}
          setMinimized={setMinimized}
          onClose={() => setVisible(false)}
          notes={ordered}
          active={active}
          userId={userId}
          shareCount={activeShares.length}
          ownerName={ownerAccount ? accountName(ownerAccount) : null}
          isOwner={isOwner}
          banner={banner}
          onSelect={setActiveId}
          onAdd={() => void addNote()}
          onPatch={patchNote}
          onDelete={() => active && deleteNote(active.id)}
          onShare={() => setShareOpen(true)}
        />
      )}

      {shareOpen && active && isOwner && (
        <ShareNoteDialog
          note={active}
          accounts={accounts.filter((a) => a.id !== userId)}
          selectedIds={activeShares.map((s) => s.shared_with)}
          onClose={() => setShareOpen(false)}
          onSave={(ids) => saveShares(active.id, ids)}
        />
      )}
      {dialog}
    </>
  );
}

function NotesPanel({
  pos,
  setPos,
  minimized,
  setMinimized,
  onClose,
  notes,
  active,
  userId,
  shareCount,
  ownerName,
  isOwner,
  banner,
  onSelect,
  onAdd,
  onPatch,
  onDelete,
  onShare,
}: {
  pos: { x: number; y: number };
  setPos: (pos: { x: number; y: number }) => void;
  minimized: boolean;
  setMinimized: (v: boolean) => void;
  onClose: () => void;
  notes: StickyNoteRow[];
  active: StickyNoteRow | null;
  userId: string;
  shareCount: number;
  ownerName: string | null;
  isOwner: boolean;
  banner: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onPatch: (id: string, patch: Partial<StickyNoteRow>) => void;
  onDelete: () => void;
  onShare: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const color = active?.color ?? "yellow";

  function onHeaderPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const maxX = Math.max(8, window.innerWidth - 80);
    const maxY = Math.max(56, window.innerHeight - 48);
    setPos({
      x: Math.min(maxX, Math.max(8, dragRef.current.origX + (e.clientX - dragRef.current.startX))),
      y: Math.min(maxY, Math.max(56, dragRef.current.origY + (e.clientY - dragRef.current.startY))),
    });
  }

  function onHeaderPointerUp(e: React.PointerEvent) {
    dragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  }

  return (
    <div
      className={cn(
        "fixed z-[45] flex flex-col overflow-hidden rounded-xl border shadow-2xl",
        COLOR_STYLES[color],
      )}
      style={{
        left: pos.x,
        top: pos.y,
        width: `min(${PANEL_W}px, calc(100vw - 16px))`,
        height: minimized ? 44 : `min(${PANEL_H}px, calc(100dvh - 72px))`,
      }}
    >
      <div
        className="flex cursor-grab items-center gap-2 border-b border-black/10 px-3 py-2 active:cursor-grabbing dark:border-white/10"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <GripHorizontal className="h-4 w-4 shrink-0 text-foreground/40" />
        <StickyNote className="h-4 w-4 shrink-0 text-foreground/70" />
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">
          {active ? tabLabel(active) : "Notes"}
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-foreground/60 hover:bg-black/10 hover:text-foreground"
          onClick={() => setMinimized(!minimized)}
          title={minimized ? "Expand" : "Minimize"}
        >
          {minimized ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className="rounded-md p-1 text-foreground/60 hover:bg-black/10 hover:text-foreground"
          onClick={onClose}
          title="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {!minimized && (
        <>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-black/10 px-2 py-1.5 dark:border-white/10 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {notes.map((note) => {
              const shared = note.user_id !== userId;
              const selected = active?.id === note.id;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => onSelect(note.id)}
                  title={tabLabel(note)}
                  className={cn(
                    "inline-flex h-8 max-w-[9.5rem] shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                    selected
                      ? "bg-background/90 text-foreground shadow-sm ring-1 ring-black/10 dark:ring-white/10"
                      : "text-foreground/65 hover:bg-black/5 hover:text-foreground",
                  )}
                >
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", COLOR_DOT[note.color])} />
                  <span className="truncate">{tabLabel(note)}</span>
                  {shared && <Users className="h-3 w-3 shrink-0 opacity-70" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onAdd}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/60 hover:bg-black/10 hover:text-foreground"
              title="New note"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {banner && (
            <p className="border-b border-black/10 px-3 py-2 text-[11px] text-foreground/70 dark:border-white/10">
              {banner}
            </p>
          )}

          {active ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <input
                value={active.title}
                onChange={(e) => onPatch(active.id, { title: e.target.value })}
                disabled={!isOwner}
                className="bg-transparent px-4 pt-3 text-base font-semibold outline-none placeholder:text-foreground/40 disabled:cursor-default"
                placeholder="Note title"
              />
              <textarea
                value={active.body}
                onChange={(e) => onPatch(active.id, { body: e.target.value })}
                disabled={!isOwner}
                placeholder={isOwner ? "Write a note…" : "Shared note"}
                className="min-h-0 flex-1 resize-none bg-transparent px-4 py-2 text-sm leading-relaxed outline-none placeholder:text-foreground/40 disabled:cursor-default"
              />
              <div className="flex items-center gap-2 border-t border-black/10 px-3 py-2 dark:border-white/10">
                {isOwner ? (
                  <div className="flex items-center gap-1">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        title={c}
                        className={cn(
                          "h-4 w-4 rounded-full border border-black/15",
                          COLOR_DOT[c],
                          active.color === c && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-transparent",
                        )}
                        onClick={() => onPatch(active.id, { color: c })}
                      />
                    ))}
                  </div>
                ) : (
                  <span className="text-[11px] text-foreground/60">
                    Shared by {ownerName || "another account"}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  {isOwner && (
                    <>
                      <button
                        type="button"
                        onClick={onShare}
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/70 hover:bg-black/10 hover:text-foreground"
                        title="Share with accounts"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        {shareCount > 0 ? shareCount : "Share"}
                      </button>
                      <button
                        type="button"
                        onClick={onDelete}
                        className="rounded-md p-1.5 text-foreground/55 hover:bg-destructive/15 hover:text-destructive"
                        title="Delete note"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <StickyNote className="h-8 w-8 text-foreground/35" />
              <p className="text-sm text-foreground/70">No notes yet. Add a tab to start one.</p>
              <Button type="button" size="sm" onClick={onAdd}>
                <Plus className="h-4 w-4" /> New note
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShareNoteDialog({
  note,
  accounts,
  selectedIds,
  onClose,
  onSave,
}: {
  note: StickyNoteRow;
  accounts: NoteAccount[];
  selectedIds: string[];
  onClose: () => void;
  onSave: (ids: string[]) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(selectedIds);
  const [saving, setSaving] = useState(false);
  const filtered = accounts.filter((a) => {
    const blob = `${accountName(a)} ${a.email || ""} ${a.role}`.toLowerCase();
    return blob.includes(query.trim().toLowerCase());
  });

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Dialog
      open
      onClose={saving ? () => {} : onClose}
      title="Share note"
      description={`Choose who can see “${tabLabel(note)}” in their Notes.`}
      size="md"
    >
      <div className="space-y-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accounts"
        />
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No accounts found.</p>
          ) : (
            filtered.map((a) => (
              <label
                key={a.id}
                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2.5 text-sm last:border-0 hover:bg-muted/30"
              >
                <input type="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className="min-w-0 flex-1 truncate">{accountName(a)}</span>
                <Badge variant="outline">{roleLabel(a.role)}</Badge>
              </label>
            ))
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {picked.length === 0
            ? "Only you can see this note."
            : `Shared with ${picked.length} account${picked.length === 1 ? "" : "s"}.`}
        </p>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => {
              void (async () => {
                setSaving(true);
                try {
                  await onSave(picked);
                } finally {
                  setSaving(false);
                }
              })();
            }}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

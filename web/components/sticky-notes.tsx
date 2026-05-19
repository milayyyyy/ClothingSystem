"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Minus, Plus, StickyNote, Trash2 } from "lucide-react";

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
};

const COLORS: StickyNoteColor[] = ["yellow", "pink", "blue", "green", "purple"];

const COLOR_STYLES: Record<StickyNoteColor, string> = {
  yellow: "bg-amber-100 border-amber-300/80 dark:bg-amber-950/80 dark:border-amber-700",
  pink: "bg-pink-100 border-pink-300/80 dark:bg-pink-950/80 dark:border-pink-700",
  blue: "bg-sky-100 border-sky-300/80 dark:bg-sky-950/80 dark:border-sky-700",
  green: "bg-emerald-100 border-emerald-300/80 dark:bg-emerald-950/80 dark:border-emerald-700",
  purple: "bg-violet-100 border-violet-300/80 dark:bg-violet-950/80 dark:border-violet-700",
};

function nextZ(notes: StickyNoteRow[]) {
  return notes.reduce((m, n) => Math.max(m, n.z_index), 0) + 1;
}

export function StickyNotes({ userId }: { userId: string }) {
  const supabase = createClient();
  const [notes, setNotes] = useState<StickyNoteRow[]>([]);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
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
    const { data, error } = await supabase
      .from("sticky_notes")
      .select("*")
      .eq("user_id", userId)
      .order("z_index", { ascending: true });
    if (error) {
      console.error("sticky notes load:", error.message);
      setLoaded(true);
      return;
    }
    setNotes((data as StickyNoteRow[]) || []);
    setLoaded(true);
  }, [supabase, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addNote() {
    const z = nextZ(notes);
    const offset = (notes.length % 6) * 28;
    const row = {
      user_id: userId,
      title: "New note",
      body: "",
      color: "yellow" as StickyNoteColor,
      pos_x: 32 + offset,
      pos_y: 88 + offset,
      width: 240,
      height: 200,
      z_index: z,
      is_minimized: false,
    };
    const { data, error } = await supabase.from("sticky_notes").insert(row).select().single();
    if (error) {
      alert(error.message);
      return;
    }
    setNotes((prev) => [...prev, data as StickyNoteRow]);
    setVisible(true);
  }

  function patchNote(id: string, patch: Partial<StickyNoteRow>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    persist(id, patch);
  }

  function bringToFront(id: string) {
    const z = nextZ(notes);
    patchNote(id, { z_index: z });
  }

  async function deleteNote(id: string) {
    if (!confirm("Delete this note?")) return;
    clearTimeout(saveTimers.current[id]);
    const { error } = await supabase.from("sticky_notes").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }

  return (
    <>
      <Button
        type="button"
        variant={visible ? "soft" : "outline"}
        size="sm"
        className="h-8 gap-1.5"
        onClick={() => setVisible((v) => !v)}
        title="Sticky notes"
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
        <>
          <button
            type="button"
            className="fixed bottom-6 right-6 z-[45] flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
            onClick={() => void addNote()}
            title="New sticky note"
          >
            <Plus className="h-5 w-5" />
          </button>

          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onPatch={patchNote}
              onDelete={() => void deleteNote(note.id)}
              onFocus={() => bringToFront(note.id)}
            />
          ))}

          {loaded && notes.length === 0 && (
            <div className="fixed bottom-20 right-6 z-[45] max-w-[220px] rounded-lg border bg-card p-3 text-xs text-muted-foreground shadow-md">
              No notes yet. Click <strong className="text-foreground">+</strong> to add one.
            </div>
          )}
        </>
      )}
    </>
  );
}

function NoteCard({
  note,
  onPatch,
  onDelete,
  onFocus,
}: {
  note: StickyNoteRow;
  onPatch: (id: string, patch: Partial<StickyNoteRow>) => void;
  onDelete: () => void;
  onFocus: () => void;
}) {
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest("button")) return;
    onFocus();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: note.pos_x,
      origY: note.pos_y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHeaderPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onPatch(note.id, {
      pos_x: Math.max(8, dragRef.current.origX + dx),
      pos_y: Math.max(56, dragRef.current.origY + dy),
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

  const h = note.is_minimized ? 40 : note.height;

  return (
    <div
      className={cn(
        "fixed z-[45] flex flex-col overflow-hidden rounded-md border shadow-lg",
        COLOR_STYLES[note.color],
      )}
      style={{
        left: note.pos_x,
        top: note.pos_y,
        width: note.width,
        height: h,
        zIndex: note.z_index,
      }}
      onPointerDown={onFocus}
    >
      <div
        className="flex cursor-grab items-center gap-1 border-b border-black/10 px-2 py-1.5 active:cursor-grabbing"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
      >
        <input
          value={note.title}
          onChange={(e) => onPatch(note.id, { title: e.target.value })}
          className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none placeholder:text-foreground/50"
          placeholder="Title"
        />
        <div className="flex shrink-0 items-center gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              className={cn(
                "h-3 w-3 rounded-full border border-black/20",
                c === "yellow" && "bg-amber-300",
                c === "pink" && "bg-pink-300",
                c === "blue" && "bg-sky-300",
                c === "green" && "bg-emerald-300",
                c === "purple" && "bg-violet-300",
                note.color === c && "ring-2 ring-foreground/40 ring-offset-1",
              )}
              onClick={() => onPatch(note.id, { color: c })}
            />
          ))}
        </div>
        <button
          type="button"
          className="rounded p-0.5 hover:bg-black/10"
          onClick={() => onPatch(note.id, { is_minimized: !note.is_minimized })}
          title={note.is_minimized ? "Expand" : "Minimize"}
        >
          {note.is_minimized ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
        </button>
        <button type="button" className="rounded p-0.5 hover:bg-destructive/20" onClick={onDelete} title="Delete">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {!note.is_minimized && (
        <textarea
          value={note.body}
          onChange={(e) => onPatch(note.id, { body: e.target.value })}
          placeholder="Write a note…"
          className="min-h-0 flex-1 resize-none bg-transparent p-2 text-sm leading-snug outline-none placeholder:text-foreground/45"
        />
      )}
    </div>
  );
}

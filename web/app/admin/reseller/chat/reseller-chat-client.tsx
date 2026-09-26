"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Plus, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspaceShell } from "@/components/workspace-shell-context";
import { isResellerRole, isStaffRole } from "@/lib/roles";
import { cn, formatDateTime, formatSupabaseError } from "@/lib/utils";
import {
  chatTitleFromMessage,
  parseResellerChat,
  parseResellerChatMessage,
  type ResellerChat,
  type ResellerChatMessage,
} from "@/lib/reseller-chat";

const textareaClass = cn(
  "min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm sm:text-sm",
  "placeholder:text-muted-foreground/70",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export function ResellerChatClient({
  initial,
  tableMissing,
}: {
  initial: ResellerChat[];
  tableMissing?: boolean;
}) {
  const supabase = createClient();
  const { role, userId, name } = useWorkspaceShell();
  const canStart = isResellerRole(role);
  const isStaff = isStaffRole(role);
  const [chats, setChats] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [messages, setMessages] = useState<ResellerChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [firstMessage, setFirstMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => chats.find((c) => c.id === selectedId) || null, [chats, selectedId]);

  async function loadChats() {
    const { data, error: loadErr } = await supabase
      .from("reseller_chats")
      .select("*, profiles!reseller_id(full_name,email)")
      .order("updated_at", { ascending: false });
    if (loadErr) {
      setError(formatSupabaseError(loadErr));
      return;
    }
    const next = (data || []).map((row) => parseResellerChat(row as Record<string, unknown>));
    setChats(next);
    setSelectedId((prev) => prev && next.some((c) => c.id === prev) ? prev : next[0]?.id ?? null);
  }

  async function loadMessages(chatId: string) {
    const { data, error: loadErr } = await supabase
      .from("reseller_chat_messages")
      .select("*, profiles!sender_id(full_name,email)")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });
    if (loadErr) {
      setError(formatSupabaseError(loadErr));
      return;
    }
    setMessages((data || []).map((row) => parseResellerChatMessage(row as Record<string, unknown>)));
  }

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedId);
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const t = window.setInterval(() => void loadMessages(selectedId), 5000);
    return () => window.clearInterval(t);
  }, [selectedId]);

  async function send() {
    const body = draft.trim();
    if (!body || !selectedId) return;
    setSaving(true);
    setError("");
    const { error: sendErr } = await supabase.from("reseller_chat_messages").insert({
      chat_id: selectedId,
      sender_id: userId,
      body,
    });
    if (!sendErr) {
      setDraft("");
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          chat_id: selectedId,
          sender_id: userId,
          sender_name: name,
          body,
          created_at: new Date().toISOString(),
        },
      ]);
      void loadChats();
    } else {
      setError(formatSupabaseError(sendErr));
    }
    setSaving(false);
  }

  async function startChat() {
    const body = firstMessage.trim();
    if (!body) {
      setError("Write a message to start the chat.");
      return;
    }
    setSaving(true);
    setError("");
    const { data, error: chatErr } = await supabase
      .from("reseller_chats")
      .insert({ reseller_id: userId, title: chatTitleFromMessage(body) })
      .select("id")
      .single();
    if (chatErr || !data) {
      setSaving(false);
      setError(formatSupabaseError(chatErr || "Could not start chat."));
      return;
    }
    const { error: msgErr } = await supabase.from("reseller_chat_messages").insert({
      chat_id: data.id,
      sender_id: userId,
      body,
    });
    setSaving(false);
    if (msgErr) {
      setError(formatSupabaseError(msgErr));
      return;
    }
    setFirstMessage("");
    setNewOpen(false);
    await loadChats();
    setSelectedId(data.id);
  }

  return (
    <div className="space-y-4">
      {tableMissing && (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Apply migration 113 (reseller account), then reload.
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {canStart && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New chat
          </Button>
        </div>
      )}

      {chats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <MessageCircle className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium text-muted-foreground">
              {canStart ? "No chats yet. Start one to message admin or manager." : "No reseller chats yet."}
            </p>
            {canStart && (
              <Button type="button" className="mt-4" onClick={() => setNewOpen(true)}>
                <Plus className="h-4 w-4" /> New chat
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <Card className={cn(selectedId && "max-lg:hidden")}>
            <CardContent className="divide-y p-0">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => setSelectedId(chat.id)}
                  className={cn(
                    "block w-full px-4 py-3 text-left hover:bg-accent",
                    selectedId === chat.id && "bg-primary/10",
                  )}
                >
                  <div className="truncate text-sm font-medium">{isStaff ? chat.reseller_name : chat.title || "Chat"}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {isStaff ? chat.title || "Chat" : formatDateTime(chat.updated_at)}
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>

          <Card className={cn(!selectedId && "max-lg:hidden")}>
            <CardContent className="flex min-h-[24rem] flex-col p-0">
              {selected ? (
                <>
                  <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {isStaff ? selected.reseller_name : selected.title || "Chat"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {isStaff ? selected.title || "Chat" : "Admin and manager can reply"}
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="ghost" className="lg:hidden" onClick={() => setSelectedId(null)}>
                      Back
                    </Button>
                  </div>
                  <div className="flex-1 space-y-2 overflow-y-auto p-4">
                    {messages.map((msg) => {
                      const mine = msg.sender_id === userId;
                      return (
                        <div key={msg.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                          <div
                            className={cn(
                              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                              mine ? "bg-primary text-primary-foreground" : "bg-muted",
                            )}
                          >
                            <div className={cn("mb-0.5 text-[11px]", mine ? "opacity-80" : "text-muted-foreground")}>
                              {mine ? "You" : msg.sender_name}
                            </div>
                            <div className="whitespace-pre-wrap">{msg.body}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={bottomRef} />
                  </div>
                  <div className="flex gap-2 border-t p-3">
                    <Input
                      value={draft}
                      placeholder="Write a message"
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <Button type="button" disabled={saving || !draft.trim()} onClick={() => void send()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
                  Select a chat.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog
        open={newOpen}
        onClose={() => !saving && setNewOpen(false)}
        title="New chat"
        description="Admin and manager will see this conversation."
        size="md"
      >
        <div className="space-y-3">
          <Label>Message</Label>
          <textarea
            className={textareaClass}
            value={firstMessage}
            placeholder="Write your first message"
            onChange={(e) => setFirstMessage(e.target.value)}
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="outline" disabled={saving} onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving || !firstMessage.trim()} onClick={() => void startChat()}>
              {saving ? "Starting…" : "Start chat"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

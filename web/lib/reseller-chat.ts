export type ResellerChat = {
  id: string;
  reseller_id: string;
  reseller_name: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ResellerChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
};

export function resellerChatTableMissing(message: string) {
  return /reseller_chats|reseller_chat_messages|schema cache|does not exist/i.test(message);
}

function profileName(value: unknown) {
  if (!value || typeof value !== "object") return "";
  const o = value as { full_name?: unknown; email?: unknown };
  if (typeof o.full_name === "string" && o.full_name.trim()) return o.full_name.trim();
  if (typeof o.email === "string" && o.email.trim()) return o.email.trim();
  return "";
}

export function parseResellerChat(row: Record<string, unknown>): ResellerChat {
  return {
    id: String(row.id || ""),
    reseller_id: String(row.reseller_id || ""),
    reseller_name: profileName(row.profiles) || "Reseller",
    title: typeof row.title === "string" ? row.title : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
    updated_at: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

export function parseResellerChatMessage(row: Record<string, unknown>): ResellerChatMessage {
  return {
    id: String(row.id || ""),
    chat_id: String(row.chat_id || ""),
    sender_id: String(row.sender_id || ""),
    sender_name: profileName(row.profiles) || "Someone",
    body: typeof row.body === "string" ? row.body : "",
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export function chatTitleFromMessage(body: string) {
  const t = body.trim().replace(/\s+/g, " ");
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

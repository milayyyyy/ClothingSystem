import { createClient, getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { ResellerNav } from "../reseller-nav";
import { ResellerChatClient } from "./reseller-chat-client";
import { parseResellerChat, resellerChatTableMissing } from "@/lib/reseller-chat";
import { isResellerRole } from "@/lib/roles";
import { formatSupabaseError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ResellerChatPage() {
  const supabase = createClient();
  const user = await getSessionUser();
  const { data, error } = await supabase
    .from("reseller_chats")
    .select("*, profiles!reseller_id(full_name,email)")
    .order("updated_at", { ascending: false });
  const missing = error ? resellerChatTableMissing(formatSupabaseError(error)) : false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reseller Chat"
        description={
          isResellerRole(user?.profile.role)
            ? "Start a chat. Admin, manager, and employees can read and reply."
            : "Chats started by reseller accounts."
        }
      />
      <ResellerNav />
      <ResellerChatClient
        initial={(data || []).map((row) => parseResellerChat(row as Record<string, unknown>))}
        tableMissing={missing}
      />
    </div>
  );
}

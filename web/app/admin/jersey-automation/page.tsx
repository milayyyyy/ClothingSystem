import { redirect } from "next/navigation";
import { createClient, requireStaff } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { JerseyAutomationClient } from "./jersey-automation-client";

export const dynamic = "force-dynamic";

export type JerseyTemplateSize = {
  id: string;
  template_id: string;
  size: string;
  pdf_path: string | null;
  name_x: number;
  name_y: number;
  name_font_size: number;
  name_cmyk_c: number;
  name_cmyk_m: number;
  name_cmyk_y: number;
  name_cmyk_k: number;
  number_x: number;
  number_y: number;
  number_font_size: number;
  number_cmyk_c: number;
  number_cmyk_m: number;
  number_cmyk_y: number;
  number_cmyk_k: number;
};

export type JerseyTemplate = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  sizes: JerseyTemplateSize[];
};

export default async function JerseyAutomationPage() {
  const me = await requireStaff();
  if (!me) redirect("/login");

  const supabase = createClient();
  const [{ data: templates }, { data: sizes }] = await Promise.all([
    supabase
      .from("jersey_templates")
      .select("id, name, description, created_at")
      .order("created_at", { ascending: false }),
    supabase.from("jersey_template_sizes").select("*"),
  ]);

  const sizesByTemplate = new Map<string, JerseyTemplateSize[]>();
  for (const s of sizes || []) {
    if (!sizesByTemplate.has(s.template_id)) sizesByTemplate.set(s.template_id, []);
    sizesByTemplate.get(s.template_id)!.push(s as JerseyTemplateSize);
  }

  const initialTemplates: JerseyTemplate[] = (templates || []).map((t) => ({
    ...(t as any),
    sizes: sizesByTemplate.get(t.id) || [],
  }));

  return (
    <div>
      <PageHeader
        title="Jersey Automation"
        description="Upload CMYK SWOP PDF templates per size, configure text placement, then generate a CMYK-safe batch PDF/ZIP for your roster."
      />
      <JerseyAutomationClient initialTemplates={initialTemplates} />
    </div>
  );
}

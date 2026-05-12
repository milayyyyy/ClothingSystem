import { getSessionUser } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { peso } from "@/lib/utils";
import { salaryTypeLabel } from "@/lib/payroll";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const p = user.profile;

  return (
    <div>
      <PageHeader title="My Profile" description="Read-only profile information" />
      <Card><CardContent className="p-6">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name" value={p.full_name || "—"} />
          <Field label="Email" value={p.email} />
          <Field label="Phone" value={p.phone || "—"} />
          <Field label="Position" value={p.position || "—"} />
          <Field label="Role"><Badge variant="blue">{p.role}</Badge></Field>
          <Field label="Status"><Badge variant={p.active ? "green" : "red"}>{p.active ? "Active" : "Inactive"}</Badge></Field>
          <Field label="Salary type" value={salaryTypeLabel(p.salary_type)} />
          <Field label="Rate" value={peso(p.salary_rate)} />
        </dl>
        <p className="mt-6 text-xs text-muted-foreground">To update your profile, contact an administrator.</p>
      </CardContent></Card>
    </div>
  );
}

function Field({ label, value, children }: { label: string; value?: string; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm capitalize">{children ?? value}</dd>
    </div>
  );
}

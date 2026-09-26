import Link from "next/link";
import { MessageCircle, Package, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResellerNav } from "./reseller-nav";

export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    href: "/admin/reseller/products",
    title: "Reseller Product",
    description: "Products available for resellers.",
    icon: Package,
  },
  {
    href: "/admin/reseller/orders",
    title: "Reseller Order",
    description: "Orders placed by resellers.",
    icon: ShoppingBag,
  },
  {
    href: "/admin/reseller/chat",
    title: "Reseller Chat",
    description: "Messages with resellers.",
    icon: MessageCircle,
  },
] as const;

export default function ResellerHubPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reseller" description="Open Product, Order, or Chat." />
      <ResellerNav />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link key={section.href} href={section.href} className="block rounded-lg transition-opacity hover:opacity-95">
              <Card className="h-full hover:border-muted-foreground/30">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle>{section.title}</CardTitle>
                  </div>
                  <CardDescription>{section.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="text-sm font-medium text-primary">Open →</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

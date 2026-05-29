import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PrintShop — Business Management",
    short_name: "PrintShop",
    description: "Printing shop orders, inventory, sales, and payroll",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#eef1f7",
    theme_color: "#4f46e5",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}

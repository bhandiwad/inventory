import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SMTC Inventory",
    short_name: "Inventory",
    description: "Mobile-first inventory for Indian car accessory shops",
    start_url: "/en",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#1f7a4d",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }
    ]
  };
}

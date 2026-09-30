import type { MetadataRoute } from "next";

// "Install app" / "Add to Home screen" support. Only makes the app open in its
// own window (no browser bar) with an icon; it does NOT work offline — every
// page still comes from the server, which is what a stock system needs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Invento — Atharva Nature Healthcare",
    short_name: "Invento",
    description: "Inventory, purchase, QC and manufacturing",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6f4e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

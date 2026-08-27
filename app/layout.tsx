import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invento — Ayurvedic Inventory & Manufacturing ERP",
  description: "Invento v2 — inventory, purchase, QC, MFR and finished-product ERP for Atharva Nature Healthcare.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

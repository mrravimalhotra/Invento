import type { Metadata } from "next";

// Browser-tab title for this screen (root layout adds " · Invento").
export const metadata: Metadata = { title: "Bulk Data Upload" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

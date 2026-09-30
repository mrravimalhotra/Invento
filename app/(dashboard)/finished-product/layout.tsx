import type { Metadata } from "next";

// Browser-tab title for this screen (root layout adds " · Invento").
export const metadata: Metadata = { title: "Finished Product" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

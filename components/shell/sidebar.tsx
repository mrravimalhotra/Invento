import Image from "next/image";
import { NavList } from "./nav-list";

/** Fixed left menu for screens 768 px and wider. Phones use MobileNav instead. */
export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-14 items-center border-b border-border px-5">
        <Image
          src="/atharva-logo.svg"
          alt="Atharva Nature Healthcare"
          width={1344}
          height={516}
          priority
          className="h-9 w-auto"
        />
      </div>
      <NavList />
    </aside>
  );
}

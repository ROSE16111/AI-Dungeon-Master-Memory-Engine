"use client";
import Link from "next/link";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sessions/1", label: "Session" },
  { href: "/graph", label: "Graph" },
];

export default function Sidebar() {
  return (
    <div className="h-full p-4 space-y-3">
      <div className="text-xl font-semibold">Dungeon Scribe</div>
      <nav className="space-y-1">
        {items.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="block px-3 py-2 rounded hover:bg-neutral-100"
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="text-xs text-neutral-400 absolute bottom-4">© 2025</div>
    </div>
  );
}

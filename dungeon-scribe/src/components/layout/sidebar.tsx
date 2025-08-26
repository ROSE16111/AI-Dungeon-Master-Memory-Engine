"use client";
import Link from "next/link";

const items = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/sessions/1", label: "Session" }, // 示例：跳到 id=1 的会话页
  { href: "/graph", label: "Graph" },
];
/**
 * items：一个数组，存放菜单的路由和文字
 * Link：Next.js 的内链组件，替代 <a>，支持预取/无刷新跳转
 * hover:bg-neutral-100：Tailwind 的悬停背景色
 */
export default function Sidebar() {
  return (
    <div className="h-full p-4 space-y-3">
      <div className="text-xl font-semibold">Dungeon Scribe</div>

       {/* 遍历菜单项并渲染链接 */}
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

      {/* 底部版权占位 */}
      <div className="text-xs text-neutral-400 absolute bottom-4">© 2025</div>
    </div>
  );
}

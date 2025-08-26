"use client";
import Sidebar from "./sidebar";
import Topbar from "./topbar";

/**
 * 网格布局解释：
 * - grid 有两列：左 240px 侧边栏，右侧自适应内容
 * - 两行：上 56px 顶栏，下方内容区
 * - 侧边栏占两行（row-span-2），形成典型后台框架
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] grid-rows-[56px_1fr]">
      <aside className="row-span-2 border-r bg-white">
        <Sidebar />
      </aside>
      <header className="border-b bg-white">
        <Topbar />
      </header>
      <main className="p-6 overflow-auto bg-white">{children}</main>
    </div>
  );
}

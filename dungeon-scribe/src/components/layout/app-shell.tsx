"use client"; //这段 UI 会包含交互（比如点击、折叠），放在客户端渲染
import Sidebar from "./sidebar";
import Topbar from "./topbar";

/**
 * 网格布局解释： 整体用 CSS Grid 划出“侧栏 + 顶栏 + 内容区”三块
 * grid-cols-[240px_1fr]：两列，左 240px，右自适应
 * grid-rows-[56px_1fr]：两行，上 56px，下面自适应
 * row-span-2：让侧栏纵向跨两行(占两行)，形成经典后台布局
 * {children}：由路由页面传进来的内容
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] grid-rows-[56px_1fr]">

         {/* 左边 240px 的侧栏，占两行（顶栏+内容） */}
      <aside className="row-span-2 border-r bg-white">
        <Sidebar />
      </aside>

      {/* 顶栏：高度 56px，在右侧第一行 */}
      <header className="border-b bg-white">
        <Topbar />
      </header>

      {/* 主内容区：右侧第二行，滚动区域 */}
      <main className="p-6 overflow-auto bg-white">{children}</main>
    </div>
  );
}

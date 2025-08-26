"use client";

/**
 * 顶栏：左侧放面包屑/标题，右侧放版本/用户信息/设置等
 * 这里先做个占位
 */
export default function Topbar() {
  return (
    <div className="h-full flex items-center px-4 justify-between">
      <div className="font-medium">Welcome</div>
      <div className="text-sm text-neutral-500">v0.1.0</div>
    </div>
  );
}

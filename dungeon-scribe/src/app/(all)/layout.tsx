'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import { TopBar } from '@/components/layout/topbar';

/**
 * 所有业务页共用外壳：
 * - 固定 TopBar
 * - 背景图铺满 + 暗化遮罩
 * - 主内容区域加顶部内边距，避免被 TopBar 遮挡
 */
export default function AllLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-white">
      {/* 背景图（固定、覆盖） */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/bacg2.png"      // 把你的背景图放到 public
          alt="background"
          fill
          priority
          className="object-cover"
        />
        {/* 暗化遮罩，保证前景可读 */}
        <div className="absolute inset-0 bg-black/50" />
      </div>

      {/* 顶栏 */}
      <TopBar />

      {/* 主体内容：留出 14 的高度空间给 fixed 顶栏；容器居中 */}
      <main className="pt-16 mx-auto max-w-6xl px-4 pb-10">
        {children}
      </main>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation'; // 拿当前 URL 路径，用于高亮当前导航
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // shadcn/ui 的头像组件
import { cn } from '@/lib/utils'; //合并 Tailwind class 的工具（避免冲突、便于条件样式）
import { User } from 'lucide-react';// 图标库，User 作为头像占位
import { cinzel } from '@/styles/fonts'; // 艺术字体

/**
 * 顶部导航：
 * - 完全透明（带轻微玻璃效果），只保留底部高光横线
 * - 中间三个“艺术字”导航，自动高亮
 * - 左侧自定义“录制按钮”（红点呼吸），点击打开 ?open=record
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  const items = [
    { label: 'DASHBOARD', href: '/dashboard' },
    { label: 'RESOURCE', href: '/resources' },
    { label: 'HISTORY', href: '/history' },
  ];

  return (
    <header
      className={cn(
        //一个 固定在顶部 的 <header>（fixed + inset-x-0 top-0），z-index 40 
        //透明 + 轻微玻璃（blur）；白字；底部边框作为分隔线；如果你要完全透明，可以去掉 backdrop-blur-sm
        'fixed inset-x-0 top-0 z-40 bg-transparent text-white',
        'backdrop-blur-[2px]'
      )}
    >

      {/**限宽 6xl，高 56px（h-14），左右留白，左右分布：左 logo / 中导航 / 右头像*/}
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-4">
        {/* 左：录制按钮（红点 + 外环 + 呼吸） */}
        <button
          aria-label="Start recording"
          onClick={() => router.push('/dashboard?open=record')}
          className="relative h-9 w-9 rounded-full grid place-items-center ring-1 ring-white/30 hover:ring-white/60 transition"
          title="Record"
        >
          {/* 外环（淡） */}
          <span className="absolute inset-0 rounded-full bg-white/5" />
          {/* 红点（核心） */}
          <span className="relative block h-3.5 w-3.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.7)]" />
          {/* 呼吸动画圈 */}
          <span className="absolute h-3.5 w-3.5 rounded-full border border-red-400 animate-ping" />
          <span className="sr-only">Record</span> {/**sr-only 是无障碍文本（屏幕阅读器可见）*/}
        </button>

        {/* 中：三个导航（艺术字） */}
        <nav className={cn('flex items-center gap-16 text-[16px] tracking-[0.18em]')}>
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  'px-2 py-1 uppercase transition-colors',
                  cinzel.className,                        // 应用艺术字字体
                  'drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]', // 文字阴影，增强可读性
                  active ? 'text-white' : 'text-neutral-200 hover:text-white'
                )}
                style={{
                  // 如果想要更“雕刻”感觉，可以开启文本描边（WebKit）
                  WebkitTextStroke: active ? '0.4px #fff' : '0.4px rgba(255,255,255,0.6)',
                }}
              >
                {it.label}
                {/* 底部高亮条 */}
                <span
                  className={cn(
                    'block h-[2px] mt-1 rounded transition-all duration-200',
                    active ? 'bg-neutral-200 w-full' : 'bg-transparent w-0 group-hover:w-full'
                  )}
                />
              </Link>
            );
          })}
        </nav>

        {/* 右：头像 */}
        <button className="rounded-full ring-1 ring-white/20 hover:ring-white/40 transition">
          <Avatar className="h-9 w-9">
            <AvatarImage src="" alt="avatar" />
            <AvatarFallback className="bg-neutral-900/60">
              <User className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>
        </button>
      </div>

      {/* 底部高光横线（和你图一致） */}
      <div className="h-[2px] w-full bg-gradient-to-r from-neutral-700/80 via-neutral-300 to-neutral-700/80" />
    </header>
  );
}

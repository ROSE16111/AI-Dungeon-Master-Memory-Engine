'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation'; // 拿当前 URL 路径，用于高亮当前导航
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // shadcn/ui 的头像组件
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'; // ← 头像下拉菜单
import { cn } from '@/lib/utils'; //合并 Tailwind class 的工具（避免冲突、便于条件样式）
import { User, LogOut } from 'lucide-react'; // 图标库
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

  // 读取当前战役（从后端接口 /api/current-campaign 获取，不能直接读 httpOnly Cookie）
  const [campaign, setCampaign] = React.useState<{ id: string; name: string } | null>(null);
  // 读取该战役下的角色名（用于头像弹出菜单展示）
  const [roleNames, setRoleNames] = React.useState<string[] | null>(null);

  // 拉取当前 Campaign
  React.useEffect(() => {
    fetch('/api/current-campaign', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok) setCampaign(d.item ?? null); // d.item 可能为 null
      })
      .catch(() => {});
  }, []);

  // 拉取角色名列表（依赖于 campaign.id）
  React.useEffect(() => {
    if (!campaign?.id) {
      setRoleNames(null);
      return;
    }
    fetch(`/api/data?type=roles&campaignId=${encodeURIComponent(campaign.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // 你的 /api/data?type=roles 返回 { roles: Array<{name:string,...}> }
        if (d?.roles?.length) {
          setRoleNames(d.roles.map((r: any) => r.name));
        } else {
          setRoleNames([]);
        }
      })
      .catch(() => setRoleNames([]));
  }, [campaign?.id]);

  const items = [
    { label: 'DASHBOARD', href: '/dashboard' },
    { label: 'RESOURCE', href: '/resources' },
    { label: 'HISTORY', href: '/history' },
    // SUMMARY 动态链接：如果有当前战役 id，则进入 /campaigns/:id/summary，否则退回到 /summary
    { label: 'SUMMARY', href: campaign ? `/campaigns/${campaign.id}/summary` : '/summary' },
  ];

  // 登出（此处的“登出”仅清掉当前战役选择；如果你有真实登录系统，可在这里一并清理登录态）
  async function onLogout() {
    try {
      await fetch('/api/current-campaign', { method: 'DELETE' });
    } catch {}
    router.push('/login'); // 如需回到 dashboard 改成 '/dashboard'
  }

  return (
    <header
      className={cn(
        //一个 固定在顶部 的 <header>（fixed + inset-x-0 top-0），z-index 40 
        //透明 + 轻微玻璃（blur）；白字；底部边框作为分隔线；如果你要完全透明，可以去掉 backdrop-blur-sm
        'fixed inset-x-0 top-0 z-40 bg-transparent text-white',
        'backdrop-blur-md bg-black/30'
      )}
    >

      {/**限宽 6xl，高 56px（h-14），左右留白，左右分布：左 logo / 中导航 / 右头像*/}
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-4">
        {/* 左：录制按钮（红点 + 外环 + 呼吸） */}
        <button
          aria-label="Start recording"
          onClick={() => router.push('/dashboard/record')}
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

        {/* 右：头像（点击显示当前 Campaign / Role / Logout） */}
        <div className="flex items-center gap-3">
          {/* 当前战役名（有就显示在头像左侧） */}
          {campaign && (
            <span
              className="text-sm px-2.5 py-1 rounded-full bg-white/10 ring-1 ring-white/20"
              title="Current campaign"
            >
              {campaign.name}
            </span>
          )}

          <DropdownMenu>
            {/* 只有触发器接收事件，避免影响其他区域 */}
            <DropdownMenuTrigger asChild>
              <button className="rounded-full ring-1 ring-white/20 hover:ring-white/40 transition focus:outline-none">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="" alt="avatar" />
                  <AvatarFallback className="bg-neutral-900/60">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>

            <DropdownMenuContent
              align="end"
              className="min-w-[220px] text-white bg-neutral-900/90 backdrop-blur border border-white/10"
            >
              <DropdownMenuLabel className="text-xs uppercase text-white/70">
                Profile
              </DropdownMenuLabel>
              <div className="px-3 py-2 text-sm space-y-1">
                <div className="opacity-80">
                  <span className="opacity-60">Campaign:</span>{' '}
                  <span className="font-medium">{campaign?.name ?? '—'}</span>
                </div>
                <div className="opacity-80">
                  <span className="opacity-60">Role:</span>{' '}
                  <span className="font-medium">
                    {roleNames
                      ? roleNames.length
                        ? roleNames.join(', ')
                        : '—'
                      : '…'}
                  </span>
                </div>
              </div>

              <DropdownMenuSeparator className="bg-white/10" />

              <DropdownMenuItem
                onClick={onLogout}
                className="cursor-pointer focus:bg-white/10"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        </div>
      </div>

      {/* 底部高光横线（和你图一致） */}
      <div className="h-[2px] w-full bg-gradient-to-r from-neutral-700/80 via-neutral-300 to-neutral-700/80" />
    </header>
  );
}

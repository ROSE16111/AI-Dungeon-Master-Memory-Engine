/*
shadcn apply：card/button/badge/Dialog/Input ；
filter near head: TitleWithFilter 

scroll：6 cards per page，keyboard ←/→ 也能控制。

data：示例里用 MOCK_SESSIONS 和 MOCK_CHARACTERS 两套数据；接入后端时只要把 data 换成 fetch 结果即可。

Add New：点击后弹出 Dialog；handleCreate 留了 TODO，按你现有 /api/data 的写法对接就行
*/
'use client';
//Next.js cmd: This file is a client-side component (can use browser hooks, such as useState/useEffect)
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react'; //React hooks
import { Plus } from 'lucide-react';

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

/* ----------------------------------- utils ----------------------------------- */
//简化 className 拼接：过滤掉假值后用空格连接
function cn(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* 全局：锁定 <body> 滚动 */
function useLockBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
}

/* --------------------------------- 标题旁 Filter --------------------------------- */
//下拉菜单 单项组件drop down menu single component； active 时背景更深； hover 有浅色背景
function MenuItem({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-2 cursor-pointer transition rounded-md',
        active ? 'bg-white/15' : 'hover:bg-white/10'
      )}
      style={{ fontFamily: '"Inter", sans-serif', fontSize: 14 }}
    >
      {children}
    </button>
  );
}
//标题组件 + 旁边的小下拉按钮
function TitleWithFilter({
  value,
  onChange,
}: {//value是当前选中的分类；onChange 用来通知父组件切换
  value: 'Map' | 'Background' | 'Others';
  onChange: (v: 'Map' | 'Background' | 'Others') => void;
}) {
  const [open, setOpen] = useState(false); // 控制下拉菜单显示
  const ref = useRef<HTMLDivElement>(null); //用于点击外部关闭

  //监听全局 mousedown，如果点击发生在组件外，关闭下拉菜单
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const label = value.toUpperCase();  // 转为大写展示； （当前值为标题）

  //外层容器固定高度 90px，水平居中
  return (
    <div className="relative flex items-center justify-center" style={{ height: 90 }} ref={ref}>
      <h1
        className="text-white font-bold select-none"
        style={{ fontFamily: '"Cinzel", serif', fontSize: 55, lineHeight: '74px' }}
      >
        {label}
      </h1>

      {/* 切换按钮（标题旁） */}
      {/*6×6 的小圆角方块，hover 有轻微高亮*/}
      <button
        aria-label="Toggle"
        onClick={() => setOpen((s) => !s)}
        className="ml-3 h-6 w-6 grid place-items-center rounded-md hover:bg-white/10 transition cursor-pointer"
        title="Switch"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <path d="M7 10l5 5 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/**黑色半透明背景、毛玻璃、白色文字；点选某项后：触发 onChange、关闭菜单 */}
      {open && (
        <div className="absolute top-[72px] z-50 min-w-[160px] rounded-md border border-white/20 bg-black/70 backdrop-blur shadow-lg text-white">
          <MenuItem
            active={value === 'Map'}
            onClick={() => {
               onChange('Map');
              setOpen(false);
            }}
          >
            Map
          </MenuItem>
          <MenuItem
            active={value === 'Background'}
            onClick={() => {
              onChange('Background');
              setOpen(false);
            }}
          >
            Background
          </MenuItem>
           <MenuItem
            active={value === 'Others'}
            onClick={() => {
              onChange('Others');
              setOpen(false);
            }}
          >
            Others
          </MenuItem>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------ data ------------------------------------ */
type Category = 'Map' | 'Background' | 'Others';

type CardItem = {
  id: string;
  title: string;
  subtitle?: string;
  img: string;
  tag?: string;       // 右上角小标签（可展示 Map/Background/NPC/Item 等）
  category: Category; // 用于标题旁筛选
};

const MOCK_RESOURCES: CardItem[] = [
  // Background
  { id: 'bg-1', title: "Baldur's Gate", subtitle: 'View Details', img: '/placeholders/bg-1.jpg', tag: 'Background', category: 'Background' },
  { id: 'bg-2', title: 'Forest Adventure', subtitle: 'View Details', img: '/placeholders/bg-2.jpg', tag: 'Background', category: 'Background' },
  { id: 'bg-3', title: 'Ancient Ruins',  subtitle: 'View Details', img: '/placeholders/bg-3.jpg', tag: 'Background', category: 'Background' },

  // Map
  { id: 'map-1', title: 'Northern Valley', subtitle: 'Region Map', img: '/placeholders/map-1.jpg', tag: 'Map', category: 'Map' },

  // Others（物品 / NPC 等你都归到 Others）
  { id: 'item-1', title: 'Moonblade', subtitle: 'Legendary Sword', img: '/placeholders/item-1.jpg', tag: 'Item', category: 'Others' },
  { id: 'npc-1',  title: 'Eldrin the Wise', subtitle: 'Archmage • LVL 9', img: '/placeholders/npc-1.jpg', tag: 'NPC', category: 'Others' },
];

/* --------------------------------- small pieces -------------------------------- */
//shadcn 的 Card 外壳，白底半透明 + 毛玻璃backdrop-blur
//Header 部分只放一张封面图cover image
// content内容区：左边是标题 + 可选副标题链接（跳详情页）；右上角是标签 Badge（比如 Map/Item/NPC 等）
//footer底部操作区：Open（跳详情）
function ResourceCard({ it }: { it: CardItem }) {
  return (
    <Card className="overflow-hidden rounded-2xl bg-white/90 backdrop-blur">
      <CardHeader className="p-0">
        <div className="relative h-36 w-full">
          <Image
            src={it.img}
            alt={it.title}
            fill
            className="object-cover"
            sizes="(min-width:1024px) 33vw, (min-width:640px) 50vw, 100vw"
          />
        </div>
      </CardHeader>

      <CardContent className="px-4 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{it.title}</CardTitle>
            {it.subtitle && (
              <Link href={`/resources/${it.id}`} className="text-sm text-sky-700 hover:underline">
                {it.subtitle}
              </Link>
            )}
          </div>
          {it.tag && (
            <Badge variant="secondary" className="capitalize">
              {it.tag}
            </Badge>
          )}
        </div>
      </CardContent>

      <CardFooter className="px-4 pb-4 pt-2 justify-end gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`/resources/${it.id}`}>Open</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

//新建卡片（占位）：大的虚线框按钮
function AddNewCard({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="outline"
      className="h-[212px] w-full rounded-2xl border-2 border-dashed bg-white/20 text-white/90 hover:bg白/30"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/60">
          <Plus className="h-6 w-6" />
        </div>
        <span className="text-sm">{label}</span>
      </div>
    </Button>
  );
}

/* ----------------------------------- page ----------------------------------- */
export default function ResourcesPage() {
  useLockBodyScroll();

  const [view, setView] = useState<Category>('Background');  // 默认显示 Background;view 保存当前标题筛选
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState(''); //绑定对话框里的输入框

  // 按当前分类过滤出要展示的卡片; Filter the cards to be displayed by the current category
  // useMemo 避免每次渲染都重新计算
  const data = useMemo(
    () => MOCK_RESOURCES.filter((it) => it.category === view),
    [view]
  );

  // 分页：每页 6（3×2），第一页附带 “Add New” 占位
  const pages: CardItem[][] = useMemo(() => {
    const arr = [...data];
    return Array.from({ length: Math.ceil((arr.length + 1) / 6) }, (_, i) => {
      const slice = arr.slice(i * 6, i * 6 + 6);
      if (i === 0) slice.push({ id: '__add__', title: '', img: '', category: view } as CardItem);
      return slice.slice(0, 6);
    });
  }, [data,view]);

  const [index, setIndex] = useState(0);
  const max = Math.max(0, pages.length - 1);
  const go = (dir: -1 | 1) => setIndex((i) => Math.min(max, Math.max(0, i + dir)));
  
//绑定键盘左右方向键控制翻页
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [max]);

  async function handleCreate() {
    // TODO: 按你的接口接入（/api/data 或 /api/resources）
     // await fetch('/api/resources', {
  //   method: 'POST',
  //   headers: { 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ category: view, name: createName }),
  // });
    setCreateOpen(false);
    setCreateName('');
  }

  return (
    <main className="min-h-screen w-full px-4 pb-16 pt-2 md:px-8">
      {/* 标题 + 标题旁 Filter（按照你提供的 API） */}
      <TitleWithFilter value={view} onChange={setView} />

      {/* 滑动容器（和 History 同样效果） */}
      <section className="relative mx-auto mt-2 max-w-6xl">
        <div
          className="flex transition-transform duration-300"
          style={{ transform: `translateX(-${index * 100}%)`, width: `${pages.length * 100}%` }}
        >
          {pages.map((page, pi) => (
            <div key={pi} className="w-full shrink-0 px-2 md:px-4">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {page.map((it, i) =>
                  it.id === '__add__' ? (
                    <AddNewCard
                      key={`add-${i}`}
                      onClick={() => setCreateOpen(true)}
                      label={view === 'Background' ? 'Add New Background' : view === 'Map' ? 'Add New Map' : 'Add New Resource'}
                    />
                  ) : (
                    <ResourceCard key={it.id} it={it} />
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 左右箭头 */}
        {index > 0 && (
          <Button
            aria-label="Prev"
            onClick={() => go(-1)}
            size="icon"
            className="absolute left-[-8px] top-1/2 -translate-y-1/2 rounded-full bg-black/50 text-white hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        )}
        {index < max && (
          <Button
            aria-label="Next"
            onClick={() => go(1)}
            size="icon"
            className="absolute right-[-8px] top-1/2 -translate-y-1/2 rounded-full bg黑/50 text-white hover:bg-black/60"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        )}

        {/* 圆点 */}
        <div className="mt-6 flex items-center justify-center gap-2">
          {pages.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to page ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn('h-2.5 w-2.5 rounded-full transition', i === index ? 'bg-white' : 'bg-white/50 hover:bg-white/70')}
            />
          ))}
        </div>
      </section>

      {/* Create 弹窗（shadcn Dialog） */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Create New {view === 'Background' ? 'Background' : view === 'Map' ? 'Map' : 'Resource'}</DialogTitle>
            <DialogDescription>Provide a name and confirm.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Enter name" value={createName} onChange={(e) => setCreateName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!createName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

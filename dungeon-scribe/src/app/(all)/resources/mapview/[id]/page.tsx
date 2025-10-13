// src/app/(all)/resources/mapview/[id]/page.tsx
// 页面作用(Page): Map 网格 + 有限可见光视图 (grid + limited visibility light)
// 关键词(Keywords): Dynamic Route(动态路由), params.id, Fog of War(雾层), Light Source(光源)

import MaskedMap from "@/components/MaskedMap";

// TODO：把这里替换成你的真实后端 fetch
async function getMapMeta(id: string) {
  // 你可以改成：
  // const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/maps/${id}`, { cache: "no-store" });
  // if (!res.ok) throw new Error("Map not found");
  // return await res.json();

  // 先用演示数据验证页面结构
  return {
    id,
    name: `Map #${id}`,
    imageUrl: "/paper.png", // 暂时用 public/paper.png 测试
    cols: 40,
    rows: 30,
  };
}

export default async function MapViewPage({
  params: { id },
}: {
  params: { id: string };
}) {
  // 这里拿到动态路由的值（id），据此请求后端
  const meta = await getMapMeta(id);

  return (
    <main className="p-4 space-y-3">
      <div className="text-2xl font-semibold text-white">{meta.name}</div>

      <div className="rounded-xl shadow border overflow-auto bg-black/30 p-2">
        <MaskedMap
          imageUrl={meta.imageUrl}
          cols={meta.cols}
          rows={meta.rows}
          initialLight={{ i: 5, j: 5, radiusTiles: 4, soft: 0.6 }}
          fogOpacity={0.92}
        />
      </div>

      <p className="text-sm text-white/80">
        Tip: Use Arrow Keys / WASD to move light by one tile
        （使用方向键或 WASD 按“格”移动光源）。
      </p>
    </main>
  );
}

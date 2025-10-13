// src/app/(all)/resources/mapview/[id]/page.tsx
// 页面作用(Page): Map 网格 + 有限可见光视图 (grid + limited visibility light)
// 关键词(Keywords): Dynamic Route(动态路由), params.id, Fog of War(雾层), Light Source(光源)

import MaskedMap from "@/components/MaskedMap";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

async function getMapMeta(id: string) {
    const h = await headers(); // headers() 拿主机名。Next15 要 await
    const host = h.get("host") || "localhost:3000";
  const proto = process.env.VERCEL ? "https" : "http";
  const base = `${proto}://${host}`;

   // ✅ 关键：把当前请求的 cookie 透传给内部 API
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(`${base}/api/resources/${encodeURIComponent(id)}`, 
    { cache: "no-store", headers: {
        cookie,                                           // ← 传 cookie
        // 如果你的接口还校验其他头，也在这里一并传过去：
        // "user-agent": h.get("user-agent") ?? "",
        // "accept-language": h.get("accept-language") ?? "",
      },
    });
  if (!res.ok) throw new Error(`Map not found: ${res.status}`);
  const data = await res.json();
  const item = data?.item ?? data;

  return {
    id: item.id,
    name: item.title ?? `Map #${id}`,
    imageUrl: item.fileUrl || item.previewUrl || "/paper.png",
    cols: item.gridCols ?? 40, // 没有字段时走默认
    rows: item.gridRows ?? 30,
    lightI: item.lightI ?? null,
    lightJ: item.lightJ ?? null,
    lightRadius: item.lightRadius ?? null,
  };
}

export default async function MapViewPage({ params: { id } }: { params: { id: string } }) {
  const meta = await getMapMeta(id);

  return (
    <main className="p-4 space-y-3">
      <div className="text-2xl font-semibold text-white">{meta.name}</div>
      <div className="rounded-xl shadow border overflow-auto bg-black/30 p-2">
        <MaskedMap
          resourceId={id} 
          imageUrl={meta.imageUrl}
          cols={meta.cols}
          rows={meta.rows}
          initialLight={{ i: 5, j: 5, radiusTiles: 4, soft: 0.6 }}
          fogOpacity={0.92}
        />
      </div>
      <p className="text-sm text-white/80">Use Arrow Keys / 'WASD'（按格移动光源）</p>
      <p className="text-sm text-white/80">Use 'h' to close/open Inspector</p>
    </main>
  );
}

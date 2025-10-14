// src/app/(all)/resources/mapview/[id]/page.tsx
// 页面作用(Page): Map 网格 + 有限可见光视图 (grid + limited visibility light)
// 关键词(Keywords): Dynamic Route(动态路由), params.id, Fog of War(雾层), Light Source(光源)

import MaskedMap from "@/components/MaskedMap";
import { headers } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getMapMeta(id: string) {
  const h = await headers(); // headers() 拿主机名。Next15 要 await
  const host = h.get("host") || "localhost:3000";
  const proto = process.env.VERCEL ? "https" : "http";
  const base = `${proto}://${host}`;

  // ✅ 关键：把当前请求的 cookie 透传给内部 API
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(`${base}/api/resources/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: {
      cookie, // ← 传 cookie
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

/** ✅ Next 15：params 是 Promise，不能同步解构
 *  旧：export default async function MapViewPage({ params: { id } }: { params: { id: string } })
 *  新：接 props，await props.params 再取 id
 */
export default async function MapViewPage(
  props: { params: Promise<{ id: string }> } // 👈 改这里：params 是 Promise
) {
  const { id } = await props.params;          // 👈 再改这里：await 后再用 id
  const meta = await getMapMeta(id);

  return (
    <main className="p-4 space-y-3">
      {/* 头部：左 Back / 中居中标题 / 右占位（保证真正居中） */}
      <header className="mb-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {/* 左侧 Back（去掉 absolute） */}
          <Link
            href="/resources" // 按你的资源页真实路径
            aria-label="Back to resources"
            className="px-3 py-2 rounded-md bg-black/60 hover:bg-black/80 text-white inline-flex items-center"
          >
            ← Back
          </Link>

          {/* 中间标题：居中显示 */}
          <h1 className="text-2xl font-semibold text-white text-center truncate">
            {meta.name}
          </h1>

          {/* 右侧占位：让标题真正居中。宽度 ≈ Back 按钮的视觉宽度 */}
          <div className="w-[72px]" aria-hidden />
        </div>
      </header>

      <div className="rounded-xl shadow border overflow-auto bg-black/30 p-2">
        <MaskedMap
          resourceId={id}
          imageUrl={meta.imageUrl}
          cols={meta.cols}
          rows={meta.rows}
          initialLight={{       // ✅ 用后端保存的光源，若没有则回退
            i: typeof meta.lightI === "number" ? meta.lightI : 0,
            j: typeof meta.lightJ === "number" ? meta.lightJ : 0,
            radiusTiles:
              typeof meta.lightRadius === "number" ? meta.lightRadius : 4,
            soft: 0.6,
          }}
          fogOpacity={0.92}
        />
      </div>

      <p className="text-sm text-white/80">
        Use Arrow Keys / 'WASD'（按格移动光源）
      </p>
      <p className="text-sm text-white/80">Use 'h' to close/open Inspector</p>
    </main>
  );
}

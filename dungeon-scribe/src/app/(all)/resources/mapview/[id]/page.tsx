// src/app/(all)/resources/mapview/[id]/page.tsx
// Page Purpose: Map grid + limited visibility light view (grid + light radius rendering)
// Keywords: Dynamic Route, params.id, Fog of War, Light Source

import MaskedMap from "@/components/MaskedMap";
import { headers } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function getMapMeta(id: string) {
  const h = await headers(); // headers() to get the hostname. Next15 requires await
  const host = h.get("host") || "localhost:3000";
  const proto = process.env.VERCEL ? "https" : "http";
  const base = `${proto}://${host}`;

  // ✅ Key: Forward the current request cookie to the internal API
  const cookie = h.get("cookie") ?? "";

  const res = await fetch(`${base}/api/resources/${encodeURIComponent(id)}`, {
    cache: "no-store",
    headers: {
      cookie, // ← Pass cookie
      // If your API validates other headers, include them here as well:
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
    cols: item.gridCols ?? 40, // Default if field missing
    rows: item.gridRows ?? 30,
    lightI: item.lightI ?? null,
    lightJ: item.lightJ ?? null,
    lightRadius: item.lightRadius ?? null,
  };
}

/** ✅ Next 15: params is a Promise, cannot destructure synchronously
 *  Old: export default async function MapViewPage({ params: { id } }: { params: { id: string } })
 *  New: accept props, await props.params, then extract id
 */
export default async function MapViewPage(
  props: { params: Promise<{ id: string }> } // 👈 Updated: params is a Promise
) {
  const { id } = await props.params;          // 👈 Updated: await before using id
  const meta = await getMapMeta(id);

  return (
    <main className="p-4 space-y-3">
      {/* Header: Left Back / Center Title / Right Spacer (for true centering) */}
      <header className="mb-2">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          {/* Left Back button (removed absolute positioning) */}
          <Link
            href="/resources" // Adjust to your actual resource page path
            aria-label="Back to resources"
            className="px-3 py-2 rounded-md bg-black/60 hover:bg-black/80 text-white inline-flex items-center"
          >
            ← Back
          </Link>

          {/* Center title: display centered */}
          <h1 className="text-2xl font-semibold text-white text-center truncate">
            {meta.name}
          </h1>

          {/* Right spacer: ensures true centering. Width ≈ Back button visual width */}
          <div className="w-[72px]" aria-hidden />
        </div>
      </header>

      <div className="rounded-xl shadow border overflow-auto bg-black/30 p-2">
        <MaskedMap
          resourceId={id}
          imageUrl={meta.imageUrl}
          cols={meta.cols}
          rows={meta.rows}
          initialLight={{       // ✅ Use backend-saved light source, fallback if missing
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
        Use Arrow Keys / 'WASD' (move light source by grid)
      </p>
      <p className="text-sm text-white/80">Use 'h' to toggle Inspector</p>
    </main>
  );
}


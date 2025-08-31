// src/app/(all)/resources/page.tsx
'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ResourcesPage() {
  return (
    <Tabs defaultValue="maps" className="w-full">
      <TabsList>
        <TabsTrigger value="maps">Maps</TabsTrigger>
        <TabsTrigger value="background">Background</TabsTrigger>
      </TabsList>

      <TabsContent value="maps" className="mt-4 grid gap-4 md:grid-cols-3">
        {/* TODO: 用 next/image 引入 /public 里的 map 资产 */}
        <div className="border rounded-2xl p-4">Map asset…</div>
        <div className="border rounded-2xl p-4">Map asset…</div>
      </TabsContent>

      <TabsContent value="background" className="mt-4 space-y-2">
        <div className="border rounded-2xl p-4">Background note…</div>
      </TabsContent>
    </Tabs>
  );
}

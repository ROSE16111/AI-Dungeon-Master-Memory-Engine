// src/app/(all)/history/page.tsx
'use client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function HistoryPage() {
  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList>
        <TabsTrigger value="all">All</TabsTrigger>
        <TabsTrigger value="completed">Completed</TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="mt-4">
        <div className="border rounded-2xl p-6">All records table…</div>
      </TabsContent>
      <TabsContent value="completed" className="mt-4">
        <div className="border rounded-2xl p-6">Completed records…</div>
      </TabsContent>
    </Tabs>
  );
}

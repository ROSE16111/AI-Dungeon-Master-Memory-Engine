// src/app/(all)/dashboard/page.tsx
'use client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';


export default function DashboardPage() {
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  // 支持从 Header 的 Quick Record 打开 ?open=record
  useEffect(() => {
    if (sp.get('open') === 'record') setOpen(true);
  }, [sp]);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ready to start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Start a new capture or upload your files to build the campaign summary.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setOpen(true)}>Record</Button>
            <Button variant="outline">Upload</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shortcuts</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <ul className="list-disc pl-6 space-y-1">
            <li>Resources → Maps, Background</li>
            <li>History → All, Completed</li>
            <li>Campaign Summary → Character, Session</li>
          </ul>
        </CardContent>
      </Card>


    </div>
  );
}

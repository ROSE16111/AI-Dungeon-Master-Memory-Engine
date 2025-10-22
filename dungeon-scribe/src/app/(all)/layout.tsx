'use client';

import { ReactNode } from 'react';
import Image from 'next/image';
import { TopBar } from '@/components/layout/topbar';

/**
 * Shared layout for all business pages:
 * - Fixed TopBar
 * - Full-screen background image with dark overlay
 * - Main content area with top padding to avoid overlap with TopBar
 */
export default function AllLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen text-white">
      {/* Background image (fixed and full coverage) */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/bacg2.png"      // Place your background image in /public
          alt="background"
          fill
          priority
          className="object-cover"
        />
        {/* Dark overlay for foreground readability */}
        <div className="absolute inset-0 bg-black/10" />
      </div>

      {/* Top bar */}
      <TopBar />

      {/* Main content: add vertical space for the fixed TopBar; center container */}
      <main className="pt-20 mx-auto max-w-6xl px-4 pb-10">
        {children}
      </main>
    </div>
  );
}

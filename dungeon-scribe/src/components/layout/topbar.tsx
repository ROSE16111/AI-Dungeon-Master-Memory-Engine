'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation'; // Get current URL path for active nav highlight
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'; // shadcn/ui avatar component
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'; // ← avatar dropdown menu
import { cn } from '@/lib/utils'; // Utility to merge Tailwind classes (avoid conflicts, support conditional styles)
import { User, LogOut } from 'lucide-react'; // icon library
import { cinzel } from '@/styles/fonts'; // artistic font

/**
 * Top navigation bar:
 * - Fully transparent (slight glass blur effect) with bottom highlight line
 * - Three centered “artistic text” nav links, auto highlight
 * - Left side: custom "record button" (pulsing red dot), opens ?open=record on click
 */
export function TopBar() {
  const pathname = usePathname();
  const router = useRouter();

  // Read current campaign (from /api/current-campaign; cannot read httpOnly cookie directly)
  const [campaign, setCampaign] = React.useState<{ id: string; name: string } | null>(null);
  // Read role names under this campaign (for avatar dropdown display)
  const [roleNames, setRoleNames] = React.useState<string[] | null>(null);

  // Fetch current campaign
  React.useEffect(() => {
    fetch('/api/current-campaign', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.ok) setCampaign(d.item ?? null); // d.item may be null
      })
      .catch(() => {});
  }, []);

  // Fetch role name list (depends on campaign.id)
  React.useEffect(() => {
    if (!campaign?.id) {
      setRoleNames(null);
      return;
    }
    fetch(`/api/data?type=roles&campaignId=${encodeURIComponent(campaign.id)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Your /api/data?type=roles returns { roles: Array<{name:string,...}> }
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
    // SUMMARY dynamic link: if current campaign id exists, go to /campaigns/:id/summary, else /summary
    { label: 'SUMMARY', href: campaign ? `/campaigns/${campaign.id}/summary` : '/summary' },
  ];

  // Logout (this “logout” only clears current campaign; if you have a real login system, also clear session)
  async function onLogout() {
    try {
      await fetch('/api/current-campaign', { method: 'DELETE' });
    } catch {}
    router.push('/login'); // change to '/dashboard' if needed
  }

  return (
    <header
      className={cn(
        // A fixed <header> at top (fixed + inset-x-0 top-0), z-index 40 
        // Transparent + light glass blur; white text; bottom border as separator
        // To make fully transparent, remove backdrop-blur-sm
        'fixed inset-x-0 top-0 z-40 bg-transparent text-white',
        'backdrop-blur-md bg-black/30'
      )}
    >

      {/** Max width 6xl, height 56px (h-14), padding sides; layout: left logo / center nav / right avatar */}
      <div className="mx-auto max-w-6xl h-16 flex items-center justify-between px-4">
        {/* Left: record button (red dot + outer ring + pulsing animation) */}
        <button
          aria-label="Start recording"
          onClick={() => router.push('/dashboard/record')}
          className="relative h-9 w-9 rounded-full grid place-items-center ring-1 ring-white/30 hover:ring-white/60 transition"
          title="Record"
        >
          {/* Outer faint ring */}
          <span className="absolute inset-0 rounded-full bg-white/5" />
          {/* Red core dot */}
          <span className="relative block h-3.5 w-3.5 rounded-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.7)]" />
          {/* Breathing animation ring */}
          <span className="absolute h-3.5 w-3.5 rounded-full border border-red-400 animate-ping" />
          <span className="sr-only">Record</span> {/** sr-only = screen reader accessible text */}
        </button>

        {/* Center: three artistic font navigation links */}
        <nav className={cn('flex items-center gap-16 text-[16px] tracking-[0.18em]')}>
          {items.map((it) => {
            const active = pathname === it.href || pathname.startsWith(`${it.href}/`);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  'px-2 py-1 uppercase transition-colors',
                  cinzel.className,                        // Apply artistic font
                  'drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]', // Text shadow for readability
                  active ? 'text-white' : 'text-neutral-200 hover:text-white'
                )}
                style={{
                  // For an engraved effect, enable text stroke (WebKit)
                  WebkitTextStroke: active ? '0.4px #fff' : '0.4px rgba(255,255,255,0.6)',
                }}
              >
                {it.label}
                {/* Bottom highlight bar */}
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

        {/* Right: avatar (click to show Campaign / Role / Logout) */}
        <div className="flex items-center gap-3">
          {/* Current campaign name (shown left of avatar if exists) */}
          {campaign && (
            <span
              className="text-sm px-2.5 py-1 rounded-full bg-white/10 ring-1 ring-white/20"
              title="Current campaign"
            >
              {campaign.name}
            </span>
          )}

          <DropdownMenu>
            {/* Trigger only (avoid affecting outer areas) */}
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

      {/* Bottom highlight line (matches your design) */}
      <div className="h-[2px] w-full bg-gradient-to-r from-neutral-700/80 via-neutral-300 to-neutral-700/80" />
    </header>
  );
}

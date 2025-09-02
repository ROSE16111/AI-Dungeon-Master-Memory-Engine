// src/app/(auth)/login/page.tsx
"use client";

import Image from "next/image";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

export default function LoginPage() {
  const router = useRouter();

  const campaigns = ["Moon Castle", "Shadow Valley", "Dragon’s Lair"];
  const roles = ["Wizard", "Ranger", "Paladin", "Bard"];

  const [campaign, setCampaign] = useState<string>();
  const [role, setRole] = useState<string>();
  const [remember, setRemember] = useState(false);

  const canSubmit = !!(campaign && role);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    router.push("/dashboard");
  }

  return (
    <div className="h-screen w-screen grid grid-cols-1 md:grid-cols-2">
      {/* 左侧全屏图 */}
      <div className="relative">
        <Image
          src="/login-hero.png" // 确认放在 public/login-hero.jpg
          alt="Castle"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* 右侧全高面板 */}
      <div className="bg-[#121a22] text-white flex items-center justify-center p-4 md:p-6">
        <form className="w-full max-w-[650px]" onSubmit={onSubmit}>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight text-center">
            <span className="block">Welcome!</span>
            <span className="inline-block whitespace-nowrap bg-gradient-to-r from-rose-200 to-amber-200 bg-clip-text text-transparent mt-4">
              Enjoy your discovery
            </span>
          </h1>

          <div className="mt-10 space-y-6">
            <div className="space-y-2">
              <Label className="text-sm text-neutral-300">
                Choose your Campaign
              </Label>
              <Select value={campaign} onValueChange={setCampaign}>
                <SelectTrigger className="bg-white/95 text-black">
                  <SelectValue placeholder="Enter your campaign name to search" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm text-neutral-300">
                Choose your role
              </Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger className="bg-white/95 text-black">
                  <SelectValue placeholder="Enter your character name to search" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(Boolean(v))}
              />
              <Label htmlFor="remember" className="text-neutral-300">
                Remember me
              </Label>
            </div>

            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full h-12 text-base rounded-full
                         bg-neutral-400 hover:bg-neutral-300 text-black
                         disabled:opacity-60"
            >
              Log in
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

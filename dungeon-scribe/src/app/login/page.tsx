"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, FormEvent } from "react"; 
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

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";

type CampaignDTO = { title: string; roles: { name: string }[] };
type DataDTO = { campaigns: CampaignDTO[] };

function CreateModal({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  onCreate,
  disabled,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  onCreate: (name: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  //create button
  async function handleCreate() {
    const name = value.trim();
    setErr(null);
    if (!name) {
      setErr("Name cannot be empty");
      return;
    }
    try {
      setBusy(true);
      await onCreate(name);
      setValue("");
      onOpenChange(false);
    } catch (e: any) {
      setErr(e?.message || "Create failed");
    } finally {
      setBusy(false);
    }
  }

  //return JSX element
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy || disabled}
        />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={busy}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={busy || disabled}
            className="bg-neutral-200 text-black hover:bg-neutral-100"
          >
            {busy ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LoginPage() {
  const router = useRouter();
  //use state
  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [rolesByCampaign, setRolesByCampaign] = useState<
    Record<string, string[]>
  >({});

  const [campaign, setCampaign] = useState<string>();
  const [role, setRole] = useState<string>();
  const [remember, setRemember] = useState(false);

  const [openCreateCampaign, setOpenCreateCampaign] = useState(false);
  const [openCreateRole, setOpenCreateRole] = useState(false);

  const canSubmit = !!(campaign && role);

  // useEffect：首次加载时调用 GET /api/data，从数据库中拉取所有 Campaign 和 Role
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/data");
      const data: DataDTO = await res.json();
      const titles = data.campaigns.map((c) => c.title);
      const map: Record<string, string[]> = {};
      data.campaigns.forEach((c) => {
        map[c.title] = c.roles.map((r) => r.name);
      });

      setCampaigns(titles);
      setRolesByCampaign(map);
    })();
  }, []);

  // roles in current campaing
  const roles = useMemo(() => {
    return campaign ? rolesByCampaign[campaign] ?? [] : [];
  }, [campaign, rolesByCampaign]);

  // clear roles when campaign changed
  useEffect(() => {
    setRole(undefined);
  }, [campaign]);

  //create a Campaign 调用 POST /api/data
  async function createCampaignLocal(name: string) {
  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "campaign",
      title: name,
    }),
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || "Failed to create campaign");

  // 更新前端状态
  setCampaigns((prev) => [...prev, name]);
  setRolesByCampaign((prev) => ({ ...prev, [name]: [] }));
  setCampaign(name);
}

  //create a Role用 POST /api/data
  async function createRoleLocal(name: string) {
  if (!campaign) throw new Error("Please select a campaign first");

  const res = await fetch("/api/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "role",
      campaignTitle: campaign,
      name,
    }),
  });

  const data = await res.json();

  if (!res.ok) throw new Error(data.error || "Failed to create role");

  // 更新前端状态
  setRolesByCampaign((prev) => ({
    ...prev,
    [campaign]: [...(prev[campaign] || []), name],
  }));
  setRole(name);
}
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    router.push("/dashboard");
  }

  return (
    <div className="h-screen w-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left Image */}
      <div className="relative">
        <Image
          src="/login-hero.png"
          alt="Castle"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* Right Panel */}
      <div className="bg-[#121a22] text-white flex items-center justify-center p-4 md:p-6">
        <form className="w-full max-w-[650px]" onSubmit={onSubmit}>
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight text-center">
            <span className="block">Welcome!</span>
            <span className="inline-block whitespace-nowrap bg-gradient-to-r from-rose-200 to-amber-200 bg-clip-text text-transparent mt-4">
              Enjoy your discovery
            </span>
          </h1>

          <div className="mt-10 space-y-6">
            {/* Campaign */}
            <div className="space-y-2">
              <Label className="text-sm text-neutral-300">
                Choose your Campaign
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={campaign} onValueChange={setCampaign}>
                    <SelectTrigger className="bg-white/95 text-black">
                      <SelectValue placeholder="Enter your campaign name" />
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

                {/* Create Campaign */}
                <Dialog
                  open={openCreateCampaign}
                  onOpenChange={setOpenCreateCampaign}
                >
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-full px-3 h-10"
                      title="Create new campaign"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </DialogTrigger>
                </Dialog>

                <CreateModal
                  open={openCreateCampaign}
                  onOpenChange={setOpenCreateCampaign}
                  title="Create New Campaign"
                  description="Add a new campaign to the list."
                  placeholder="Enter campaign name"
                  onCreate={createCampaignLocal}
                />
              </div>
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label className="text-sm text-neutral-300">
                Choose your Role
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={role}
                    onValueChange={setRole}
                    disabled={!campaign}
                  >
                    <SelectTrigger className="bg-white/95 text-black">
                      <SelectValue placeholder="Enter your role name" />
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

                {/* Create Role */}
                <Dialog open={openCreateRole} onOpenChange={setOpenCreateRole}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-full px-3 h-10"
                      title="Create new role"
                      disabled={!campaign}
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </DialogTrigger>
                </Dialog>

                <CreateModal
                  open={openCreateRole}
                  onOpenChange={setOpenCreateRole}
                  title="Create New Role"
                  description="Add a new role under the selected campaign."
                  placeholder="Enter role name"
                  onCreate={createRoleLocal}
                  disabled={!campaign}
                />
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="remember"
                checked={remember}
                onCheckedChange={(v) => setRemember(Boolean(v))}
                className="border-white data-[state=checked]:bg-white data-[state=checked]:text-black"
              />
              <Label htmlFor="remember" className="text-neutral-300">
                Remember me
              </Label>
            </div>

            {/* Submit */}
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

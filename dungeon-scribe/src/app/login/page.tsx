"use client";

import Image from "next/image";
import { useState, FormEvent, useEffect } from "react";
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

export default function LoginPage() {
  const router = useRouter();

  const [campaigns, setCampaigns] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  const [campaign, setCampaign] = useState<string>();
  const [role, setRole] = useState<string>();
  const [remember, setRemember] = useState(false);

  // === State for Create Role ===
  const [openCreateRole, setOpenCreateRole] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);
  const [createRoleError, setCreateRoleError] = useState<string | null>(null);

  // === State for Create Campaign ===
  const [openCreateCampaign, setOpenCreateCampaign] = useState(false);
  const [newCampaign, setNewCampaign] = useState("");
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [createCampaignError, setCreateCampaignError] = useState<string | null>(
    null
  );

  const canSubmit = !!(campaign && role);

  // load campaigns and first roles
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/data");
      const data: DataDTO = await res.json();

      const campaignTitles = data.campaigns.map((c) => c.title);
      const firstRoles = data.campaigns[0]?.roles.map((r) => r.name) || [];

      setCampaigns(campaignTitles);
      setRoles(firstRoles);
    })();
  }, []);

  // when campaign changes, load its roles
  useEffect(() => {
    if (!campaign) return;
    (async () => {
      try {
        const res = await fetch(
          `/api/data?campaign=${encodeURIComponent(campaign)}`
        );
        const data: DataDTO | { roles: { name: string }[] } = await res.json();

        const roleArr =
          "campaigns" in data
            ? (data as DataDTO).campaigns.find((c) => c.title === campaign)
                ?.roles ?? []
            : (data as { roles: { name: string }[] }).roles;

        setRoles(roleArr.map((r) => r.name));
        setRole(undefined);
      } catch {}
    })();
  }, [campaign]);

  // === Create new campaign ===
  async function onCreateCampaign() {
    setCreateCampaignError(null);
    const name = newCampaign.trim();
    if (!name) {
      setCreateCampaignError("Campaign name cannot be empty");
      return;
    }
    if (campaigns.includes(name)) {
      setCreateCampaignError("This campaign already exists");
      return;
    }
    try {
      setCreatingCampaign(true);
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ title: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setCampaigns((prev) => [...prev, name]);
      setCampaign(name);
      setNewCampaign("");
      setOpenCreateCampaign(false);
    } catch (err: any) {
      setCreateCampaignError(err?.message || "Failed to create campaign");
    } finally {
      setCreatingCampaign(false);
    }
  }

  // === Create new role ===
  async function onCreateRole() {
    setCreateRoleError(null);
    if (!campaign) {
      setCreateRoleError("Please select a campaign first");
      return;
    }
    const name = newRole.trim();
    if (!name) {
      setCreateRoleError("Role name cannot be empty");
      return;
    }
    if (roles.includes(name)) {
      setCreateRoleError("This role already exists");
      return;
    }

    try {
      setCreatingRole(true);
      const res = await fetch("/api/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ campaignTitle: campaign, roleName: name }),
      });
      if (!res.ok) throw new Error(await res.text());
      setRoles((prev) => [...prev, name]);
      setRole(name);
      setNewRole("");
      setOpenCreateRole(false);
    } catch (err: any) {
      setCreateRoleError(err?.message || "Failed to create role");
    } finally {
      setCreatingRole(false);
    }
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
            {/* Campaign select with create */}
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

                {/* Create Campaign Button */}
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

                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle>Create New Campaign</DialogTitle>
                      <DialogDescription>
                        Add a new campaign to the list.
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      placeholder="Enter campaign name"
                      value={newCampaign}
                      onChange={(e) => setNewCampaign(e.target.value)}
                      disabled={creatingCampaign}
                    />
                    {createCampaignError && (
                      <p className="text-sm text-red-400">
                        {createCampaignError}
                      </p>
                    )}
                    <DialogFooter className="mt-4">
                      <DialogClose asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={creatingCampaign}
                        >
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        type="button"
                        onClick={onCreateCampaign}
                        disabled={creatingCampaign}
                        className="bg-neutral-200 text-black hover:bg-neutral-100"
                      >
                        {creatingCampaign ? "Creating…" : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Role select with create */}
            <div className="space-y-2">
              <Label className="text-sm text-neutral-300">
                Choose your Role
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={role} onValueChange={setRole}>
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
                <Dialog open={openCreateRole} onOpenChange={setOpenCreateRole}>
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      className="rounded-full px-3 h-10"
                      title="Create new role"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="sm:max-w-[420px]">
                    <DialogHeader>
                      <DialogTitle>Create New Role</DialogTitle>
                      <DialogDescription>
                        Add a new role under the selected campaign.
                      </DialogDescription>
                    </DialogHeader>
                    <Input
                      placeholder="Enter role name"
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      disabled={creatingRole}
                    />
                    {createRoleError && (
                      <p className="text-sm text-red-400">{createRoleError}</p>
                    )}
                    <DialogFooter className="mt-4">
                      <DialogClose asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={creatingRole}
                        >
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        type="button"
                        onClick={onCreateRole}
                        disabled={creatingRole}
                        className="bg-neutral-200 text-black hover:bg-neutral-100"
                      >
                        {creatingRole ? "Creating…" : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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

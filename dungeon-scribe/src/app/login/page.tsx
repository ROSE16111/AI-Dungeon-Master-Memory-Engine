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
//for the combobox
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { ChevronsUpDown, Check } from "lucide-react";

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
type SearchableSelectProps = {
  value?: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string; // default "(No role)"
};

function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Type to search...",
  disabled,
  allowEmpty,
  emptyLabel = "(No role)",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  // local filtering (case-insensitive). For very large lists, you can debounce here.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Trigger looks like SelectTrigger */}
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            "w-full h-10 rounded-md border border-input bg-white/95 px-3 text-left text-black",
            "flex items-center justify-between gap-2",
            disabled && "opacity-60 cursor-not-allowed"
          )}
          aria-haspopup="listbox"
        >
          <span className={cn("truncate", !value && "text-neutral-500")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </button>
      </PopoverTrigger>

      {/* The dropdown; width matches trigger; max height prevents overflow */}
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        collisionPadding={8}
        // width：clamp to a comfortable range
        className="p-0 w-[min(650px,calc(100vw-2rem))]"
      >
        <Command shouldFilter={false}>
          {/* Typing here filters the list below */}
          <CommandInput
            autoFocus
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-80 overflow-auto">
            <CommandEmpty>No results</CommandEmpty>
            {allowEmpty && (
            <CommandItem
              value="__none__"
              onSelect={() => {
                onChange("");    // ← 设为空字符串
                setOpen(false);
                setQuery("");
              }}
              className="truncate"
            >
              {/* 左侧对勾：当前 value 为空则高亮 */}
              <Check className={cn("mr-2 h-4 w-4", value ? "opacity-0" : "opacity-100")} />
              <span className="truncate">{emptyLabel}</span>
            </CommandItem>
          )}

            <CommandGroup>
              {filtered.map((opt) => {
                const selected = value === opt;
                return (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => {
                      onChange(opt);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="truncate"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selected ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span className="truncate">{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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

  //const canSubmit = !!(campaign && role);
  // Only campaign is required now
  const canSubmit = !!campaign;
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

  // update front end
  setCampaigns((prev) => [...prev, name]);
  setRolesByCampaign((prev) => ({ ...prev, [name]: [] }));
  setCampaign(name);
}

  //create a Role ues POST /api/data
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

  // update front end
  setRolesByCampaign((prev) => ({
    ...prev,
    [campaign]: [...(prev[campaign] || []), name],
  }));
  setRole(name);
}

//write Campaign  httpOnly Cookie
  async function setCurrentCampaignCookie(campaignTitle: string, remember: boolean) {
    const res = await fetch("/api/current-campaign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: campaignTitle, remember }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to set current campaign");
    }
}

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || !campaign) return;
    try {
      await setCurrentCampaignCookie(campaign, remember);
      // After cookie is set, read back the current campaign id/title and persist to localStorage
      try {
        const res = await fetch('/api/current-campaign');
        if (res.ok) {
          const json = await res.json();
          const item = json?.item;
          if (typeof window !== "undefined" && item) {
            if (item.id) localStorage.setItem("currentCampaignId", item.id);
            if (item.name) localStorage.setItem("currentCampaignTitle", item.name);

            if (role) {
              try {
                localStorage.setItem(`preferredRole:${item.id}`, role);
              } catch {}
            } else {
              // Optional: if no role chosen this time, you may clear previous memory
               try { localStorage.removeItem(`preferredRole:${item.id}`) } catch {}
            }
          }
        }
      } catch (err) {
        // Not fatal — pages will still read cookie via server API where supported
        console.warn('Failed to persist current campaign to localStorage', err);
      }
      router.push("/dashboard");
    } catch (err: any) {
      alert(err?.message || "Login failed");
    }
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
                  <SearchableSelect
                    value={campaign}
                    onChange={setCampaign}
                    options={campaigns}
                    placeholder="Enter your campaign name"
                  />
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
                <strong>Optional</strong>: Choose your Character (if already captured)
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <SearchableSelect
                    value={role}
                    onChange={setRole}
                    options={roles}
                    placeholder="Character name"
                    disabled={!campaign}
                    allowEmpty
                    emptyLabel="(No role)"
                  />
                </div>

                {/* Create Role */}
                {/*<Dialog open={openCreateRole} onOpenChange={setOpenCreateRole}>
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
                />*/}
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
            // When campaign is selected, make the button pop; otherwise keep the greyed look
            className={`w-full h-12 text-base rounded-full text-black transition-all duration-200
              ${canSubmit
                ? 'bg-amber-400 hover:bg-amber-300 shadow-[0_8px_20px_rgba(245,158,11,0.35)] hover:scale-[1.01] active:scale-[0.99]'
                : 'bg-neutral-400 hover:bg-neutral-300 opacity-60 cursor-not-allowed'
              }`}
          >
            Log in
          </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

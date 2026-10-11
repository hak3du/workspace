"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import { Check, ImageOff, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { post } from "@/lib/api";
import { LAUNCH_FEE_SOL } from "@/lib/bonding";
import { sol } from "@/lib/format";
import type { TokenDTO } from "@/lib/types";

const PRESETS = [
  { src: "/media/token-quantum-cat.jpg", label: "Quantum Cat" },
  { src: "/media/token-space-doge.jpg", label: "Space Doge" },
  { src: "/media/token-neon-ape.jpg", label: "Neon Ape" },
  { src: "/media/token-wizard.jpg", label: "Wizard" },
] as const;

const MAX_DESCRIPTION = 280;

export function CreateTokenDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (t: TokenDTO) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 32;
  const symbolOk = /^[A-Z0-9]{2,10}$/.test(symbol);
  const descOk = description.length <= MAX_DESCRIPTION;
  const canSubmit = nameOk && symbolOk && descOk && !pending;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    try {
      const data = await post<{ token: TokenDTO }>("/api/tokens", {
        name: name.trim(),
        symbol,
        description: description.trim(),
        imageUrl: imageUrl,
      });
      toast({
        title: "Launch confirmed",
        description: `${data.token.name} (${data.token.symbol}) is live on the bonding curve. Fee ${sol(LAUNCH_FEE_SOL)} settled.`,
      });
      setName("");
      setSymbol("");
      setDescription("");
      setImageUrl(null);
      onCreated(data.token);
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Launch failed",
        description: err instanceof Error ? err.message : "Something went wrong on the simulated route.",
        variant: "destructive",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] gap-5 overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="size-5 text-violet-400" />
            Launch a Token
          </DialogTitle>
          <DialogDescription>
            Mint a simulated SPL-style token on the bonding curve. Everything is devnet-grade simulation — no real funds.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="token-name">Name</Label>
            <Input
              id="token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Quantum Cat"
              maxLength={32}
              autoComplete="off"
              required
              minLength={2}
            />
            {!nameOk && name.length > 0 && (
              <p className="text-xs text-red-400">Name must be 2-32 characters.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="token-symbol">Symbol</Label>
            <Input
              id="token-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              placeholder="QCAT"
              maxLength={10}
              autoComplete="off"
              required
              className="font-mono tracking-widest uppercase"
            />
            {!symbolOk && symbol.length > 0 && (
              <p className="text-xs text-red-400">2-10 characters, uppercase A-Z and 0-9 only.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="token-description">Description</Label>
            <Textarea
              id="token-description"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
              placeholder="What does your token do? Why does it matter?"
              rows={3}
              className="resize-none"
            />
            <p className={`text-right text-xs ${description.length > MAX_DESCRIPTION ? "text-red-400" : "text-muted-foreground"}`}>
              {description.length}/{MAX_DESCRIPTION}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Cover image</Label>
            <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label="Cover image preset">
              {PRESETS.map((p) => {
                const selected = imageUrl === p.src;
                return (
                  <button
                    key={p.src}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={p.label}
                    onClick={() => setImageUrl(p.src)}
                    className={`relative h-14 overflow-hidden rounded-lg border transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      selected ? "border-transparent ring-2 ring-violet-400" : "border-white/10 hover:border-violet-400/50"
                    }`}
                  >
                    <Image src={p.src} alt="" fill sizes="120px" className="object-cover" />
                    {selected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-violet-600/40">
                        <Check className="size-4 text-white drop-shadow" />
                      </span>
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                role="radio"
                aria-checked={imageUrl === null}
                aria-label="No image"
                onClick={() => setImageUrl(null)}
                className={`flex h-14 flex-col items-center justify-center gap-1 rounded-lg border text-[10px] text-muted-foreground transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  imageUrl === null ? "border-transparent bg-violet-500/15 text-violet-200 ring-2 ring-violet-400" : "border-white/10 hover:border-violet-400/50"
                }`}
              >
                <ImageOff className="size-4" />
                None
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2.5 text-xs text-violet-200">
            <Rocket className="mt-0.5 size-3.5 shrink-0" />
            <span>Launch fee: {sol(LAUNCH_FEE_SOL)} (simulated, itemized receipt in your wallet page).</span>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending} className="h-11">
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit} className="glow-violet h-11 min-w-36">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
              {pending ? "Launching…" : "Launch Token"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

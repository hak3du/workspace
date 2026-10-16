"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ImageOff, Rocket } from "lucide-react";
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (t: TokenDTO) => void;
}) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const nameOk = name.trim().length >= 2 && name.trim().length <= 32;
  const symbolOk = /^[A-Z0-9]{2,10}$/.test(symbol);
  const descOk = description.length <= MAX_DESCRIPTION;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] gap-5 overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Rocket className="size-5 text-violet-400" />
            Launch a Token
          </DialogTitle>
          <DialogDescription>
            Real Pump.fun token creation is not integrated yet. This form is a preview only: it will not create a token, upload metadata, request a wallet signature, or charge a fee.
          </DialogDescription>
        </DialogHeader>


        <form onSubmit={(event) => event.preventDefault()} className="space-y-5">
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

          <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100">
            <Rocket className="mt-0.5 size-3.5 shrink-0" />
            <span>Unavailable: the production launch adapter, metadata hosting, transaction confirmation, and fee settlement must be implemented before launch can be enabled.</span>
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11">
              Cancel
            </Button>
            <Button type="button" disabled className="h-11 min-w-36">
              <Rocket className="size-4" />
              Launch unavailable
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



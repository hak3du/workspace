"use client";

import { create } from "zustand";
import type { SessionUser, View } from "@/lib/types";
import { post } from "@/lib/api";

interface WalletState {
  address: string | null;
  provider: string | null;
}

interface AppState {
  view: View;
  history: View[];
  contextOpen: boolean;
  searchOpen: boolean;
  aiOpen: boolean;
  notifOpen: boolean;
  user: SessionUser | null;
  wallet: WalletState;
  hydrated: boolean;
  navigate: (v: View) => void;
  back: () => void;
  toggleContext: () => void;
  setSearchOpen: (open: boolean) => void;
  setAiOpen: (open: boolean) => void;
  setNotifOpen: (open: boolean) => void;
  setUser: (u: SessionUser | null) => void;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  hydrate: () => void;
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function randomAddress(): string {
  let s = "";
  for (let i = 0; i < 44; i++) s += B58[Math.floor(Math.random() * B58.length)];
  return s;
}

export const useApp = create<AppState>((set, get) => ({
  view: { name: "discover" },
  history: [],
  contextOpen: true,
  searchOpen: false,
  aiOpen: false,
  notifOpen: false,
  user: null,
  wallet: { address: null, provider: null },
  hydrated: false,

  navigate: (v) => {
    const cur = get().view;
    set({ view: v, history: [...get().history.slice(-20), cur], notifOpen: false });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  },
  back: () => {
    const h = [...get().history];
    const prev = h.pop();
    if (prev) set({ view: prev, history: h });
    else set({ view: { name: "discover" }, history: [] });
  },
  toggleContext: () => set({ contextOpen: !get().contextOpen }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setAiOpen: (open) => set({ aiOpen: open }),
  setNotifOpen: (open) => set({ notifOpen: open }),
  setUser: (u) => set({ user: u }),

  connectWallet: async () => {
    // Simulated wallet connection. We never request seed phrases or private keys.
    const address = randomAddress();
    const provider = "Phantom (simulated)";
    set({ wallet: { address, provider } });
    if (typeof window !== "undefined") {
      localStorage.setItem("ql_wallet", JSON.stringify({ address, provider }));
    }
    try {
      await post("/api/wallet/connect", { address, provider });
    } catch {
      // Non-fatal: wallet works locally even if sync fails
    }
  },

  disconnectWallet: () => {
    set({ wallet: { address: null, provider: null } });
    if (typeof window !== "undefined") localStorage.removeItem("ql_wallet");
  },

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    set({ hydrated: true });
    try {
      const raw = localStorage.getItem("ql_wallet");
      if (raw) set({ wallet: JSON.parse(raw) });
    } catch {
      // ignore
    }
    fetch("/api/bootstrap", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => set({ user: d.user }))
      .catch(() => undefined);
  },
}));

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Command, Loader2, Search, Sparkles, Wallet, X } from "lucide-react";
import { useApp } from "@/store/app-store";
import { api, patch } from "@/lib/api";
import { shortAddr, timeAgo } from "@/lib/format";
import type { NotificationDTO, SearchResultGroup } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmojiAvatar } from "./avatar";

/* ---------------- Notifications popover ---------------- */

function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationDTO[]>([]);
  const [unread, setUnread] = useState(0);
  const refresh = useCallback(async () => {
    try {
      const d = await api<{ notifications: NotificationDTO[]; unread: number }>("/api/notifications");
      setNotifications(d.notifications);
      setUnread(d.unread);
    } catch {
      /* silent */
    }
  }, []);
  useEffect(() => {
    let alive = true;
    const load = () => {
      api<{ notifications: NotificationDTO[]; unread: number }>("/api/notifications")
        .then((d) => {
          if (alive) {
            setNotifications(d.notifications);
            setUnread(d.unread);
          }
        })
        .catch(() => undefined);
    };
    const initial = setTimeout(load, 150);
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearTimeout(initial);
      clearInterval(t);
    };
  }, []);
  return { notifications, unread, refresh };
}

function NotificationsMenu() {
  const { notifOpen, setNotifOpen } = { notifOpen: useApp((s) => s.notifOpen), setNotifOpen: useApp((s) => s.setNotifOpen) };
  const { notifications, unread, refresh } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setNotifOpen(false);
    }
    if (notifOpen) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [notifOpen, setNotifOpen]);

  const markAll = async () => {
    await patch("/api/notifications", {});
    refresh();
  };

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        className="relative h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
        onClick={() => setNotifOpen(!notifOpen)}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread}
          </span>
        )}
      </Button>
      <AnimatePresence>
        {notifOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong absolute right-0 top-13 z-50 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground">
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</p>}
              {notifications.map((n) => (
                <div key={n.id} className={cn("border-b border-white/5 px-4 py-3 transition hover:bg-white/5", !n.read && "bg-primary/5")}>
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                        n.kind === "SECURITY" && "bg-cyan-400",
                        n.kind === "LAUNCH" && "bg-primary",
                        n.kind === "SOCIAL" && "bg-pink-400",
                        n.kind === "TRADE" && "bg-emerald-400",
                        n.kind === "SYSTEM" && "bg-muted-foreground"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>}
                      <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- Global search overlay ---------------- */

function SearchOverlay() {
  const { searchOpen, setSearchOpen, navigate } = useApp();
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchResultGroup[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!searchOpen) {
      setQ("");
      setGroups([]);
    }
  }, [searchOpen]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setGroups([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const d = await api<{ groups: SearchResultGroup[] }>(`/api/search?q=${encodeURIComponent(q)}`);
        setGroups(d.groups);
      } catch {
        setGroups([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/70 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={() => setSearchOpen(false)}>
      <motion.div
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.18 }}
        className="glass-strong w-full max-w-2xl overflow-hidden rounded-2xl shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Global search"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search everything — tokens, media, Spaces, creators, docs…"
            className="h-14 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
            onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
          />
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <button onClick={() => setSearchOpen(false)} aria-label="Close search" className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {q.trim().length < 2 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              <p className="mb-3 font-medium text-foreground">Try searching for</p>
              <div className="flex flex-wrap justify-center gap-2">
                {["QCAT", "AHE", "Arena", "Dylan", "launch"].map((s) => (
                  <button key={s} onClick={() => setQ(s)} className="glass rounded-full px-3 py-1.5 text-xs transition hover:border-primary/50">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {q.trim().length >= 2 && groups.length === 0 && !loading && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No results for &ldquo;{q}&rdquo;</p>
          )}
          {groups.map((g) => (
            <div key={g.kind} className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.label}</p>
              {g.items.map((item) => (
                <button
                  key={g.kind + item.id}
                  onClick={() => {
                    setSearchOpen(false);
                    navigate(item.target);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
                >
                  {item.image ? (
                     
                    <img src={item.image} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ---------------- Top bar ---------------- */

export function TopBar() {
  const { user, wallet, connectWallet, disconnectWallet, setSearchOpen, setAiOpen, navigate } = useApp();

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <button onClick={() => navigate({ name: "discover" })} className="flex items-center gap-2.5 focus:outline-none" aria-label="Quantum Launchpad home">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-400 text-white shadow-[0_0_18px_rgba(139,92,246,0.5)]">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="hidden text-lg font-extrabold tracking-tight sm:block">
            QUANTUM<span className="text-gradient"> LAUNCHPAD</span>
          </span>
        </button>

        <button
          onClick={() => setSearchOpen(true)}
          className="glass group ml-2 hidden h-11 w-full max-w-md items-center gap-3 rounded-xl px-4 text-sm text-muted-foreground transition hover:border-primary/40 md:flex"
          aria-label="Open global search"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">Search everything…</span>
          <kbd className="flex items-center gap-0.5 rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-medium">
            <Command className="h-3 w-3" /> K
          </kbd>
        </button>

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground md:hidden"
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
        >
          <Search className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="hidden h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground sm:flex"
          onClick={() => setAiOpen(true)}
          aria-label="Ask the Quantum Guide"
        >
          <Sparkles className="h-5 w-5" />
        </Button>

        <NotificationsMenu />

        {wallet.address ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate({ name: "portfolio" })}
              className="glass hidden h-11 items-center gap-2 rounded-xl px-3 text-xs font-medium transition hover:border-primary/40 sm:flex"
              aria-label="Open portfolio"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {shortAddr(wallet.address)}
            </button>
            <Button variant="ghost" size="sm" className="hidden h-11 rounded-xl px-2 text-xs text-muted-foreground lg:block" onClick={disconnectWallet}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button onClick={() => connectWallet()} className="glow-violet h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Wallet className="mr-2 h-4 w-4" /> Connect
          </Button>
        )}

        <button
          onClick={() => navigate({ name: "portfolio" })}
          className="ml-1 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Your profile"
        >
          <EmojiAvatar emoji={user?.avatarEmoji ?? "🛸"} color={user?.avatarColor ?? "#8b5cf6"} size={38} ring />
        </button>
      </div>
      <SearchOverlay />
      <KeyboardShortcut />
    </header>
  );
}

function KeyboardShortcut() {
  const setSearchOpen = useApp((s) => s.setSearchOpen);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);
  return null;
}

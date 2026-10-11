"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Bot, Loader2, Send, Sparkles, X } from "lucide-react";
import { useApp } from "@/store/app-store";
import { post } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTIONS = [
  "How does the bonding curve work?",
  "What is AHE and is it post-quantum?",
  "How do I launch a token?",
  "What are the platform fees?",
];

// Quantum Guide — speaking AI agent with safe interaction boundaries
// (spec §11): explains the platform, never fabricates verification or
// returns, never signs anything.
export function AiGuide() {
  const { aiOpen, setAiOpen } = useApp();
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hey, I'm the Quantum Guide 🛸 I can explain the platform, Spaces, Launch Arena mechanics, AHE crypto, and developer APIs. What would you like to explore?",
    },
  ]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiOpen]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setPending(true);
    try {
      const d = await post<{ reply: string }>("/api/chat", { messages: next.slice(-12) });
      setMessages([...next, { role: "assistant", content: d.reply }]);
    } catch (e) {
      setMessages([...next, { role: "assistant", content: e instanceof Error ? e.message : "Something went wrong." }]);
    } finally {
      setPending(false);
    }
  };

  if (!aiOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-end bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-6" onMouseDown={() => setAiOpen(false)}>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="glass-strong flex h-[min(78vh,640px)] w-full flex-col overflow-hidden rounded-t-3xl border shadow-2xl sm:h-[640px] sm:max-w-lg sm:rounded-3xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Quantum Guide chat"
      >
        <div className="flex items-center gap-3 border-b border-white/8 px-4 py-3.5">
          <span className="glow-violet flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-cyan-400 text-white">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <p className="text-sm font-semibold">Quantum Guide</p>
            <p className="text-[11px] text-muted-foreground">Platform guide · explains, never trades</p>
          </div>
          <button onClick={() => setAiOpen(false)} aria-label="Close guide" className="rounded-lg p-2 text-muted-foreground hover:bg-white/5 hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                  m.role === "user"
                    ? "rounded-br-md bg-primary text-primary-foreground"
                    : "glass rounded-bl-md text-foreground"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {pending && (
            <div className="flex justify-start">
              <div className="glass flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
              </div>
            </div>
          )}
          {messages.length <= 1 && !pending && (
            <div className="flex flex-wrap gap-2 pt-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} className="glass rounded-full px-3 py-1.5 text-xs transition hover:border-primary/50 hover:text-foreground">
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          className="flex items-center gap-2 border-t border-white/8 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about launches, AHE, Spaces…"
            aria-label="Message the Quantum Guide"
            className="h-11 flex-1 rounded-xl border border-white/10 bg-white/5 px-3.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/60"
          />
          <Button type="submit" disabled={pending || !input.trim()} className="glow-violet h-11 w-11 rounded-xl bg-primary p-0 text-primary-foreground" aria-label="Send message">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <p className="border-t border-white/5 px-4 py-2 text-center text-[10px] text-muted-foreground/70">
          <Bot className="mr-1 inline h-3 w-3" />
          The guide explains the platform — it can&apos;t verify projects, promise returns, or sign transactions.
        </p>
      </motion.div>
    </div>
  );
}

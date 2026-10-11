"use client";

// Quantum Labs — AHE v1 encrypt/decrypt playground.
// Honest crypto: HKDF-SHA256 + AES-256-GCM over versioned envelopes.
// The tamper-demo button flips one ciphertext char to demonstrate GCM auth.
import { useCallback, useEffect, useState } from "react";
import { Copy, Lock, Unlock, AlertTriangle, RotateCcw, Eraser, KeyRound, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { api, post } from "@/lib/api";
import type { ApiKeyDTO, AheEnvelope } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";

interface EncryptResponse {
  envelope: AheEnvelope;
  ciphertextBytes: number;
  latencyMs: number;
}

interface DecryptResponse {
  plaintext: string;
  latencyMs: number;
}

interface DecryptFailure {
  ok: false;
  code?: string;
  message: string;
}

const SAMPLE_PLAINTEXT =
  "Quantum Launchpad 🛸 — hello from the Labs console. AHE v1 sample payload (HKDF-SHA256 → AES-256-GCM).";

/** POST that preserves structured error codes (the generic api() helper only keeps messages). */
async function postWithCode<T>(
  path: string,
  body: unknown
): Promise<{ ok: true; data: T } | DecryptFailure> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        code: typeof data.code === "string" ? data.code : undefined,
        message: typeof data.error === "string" ? data.error : `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, message: "Network error — is the service reachable?" };
  }
}

/** Flip one character of a base64url string — guaranteed to corrupt the ciphertext. */
function flipOneChar(s: string): string {
  if (!s) return s;
  const i = Math.min(2, s.length - 1);
  const ch = s[i];
  const replaced = ch === "A" ? "B" : "A";
  return s.slice(0, i) + replaced + s.slice(i + 1);
}

export function AheConsole() {
  const { toast } = useToast();

  const [keys, setKeys] = useState<ApiKeyDTO[]>([]);
  const [keysLoading, setKeysLoading] = useState(true);
  const [keyId, setKeyId] = useState<string>("");

  const [plaintext, setPlaintext] = useState(SAMPLE_PLAINTEXT);
  const [encrypting, setEncrypting] = useState(false);
  const [encResult, setEncResult] = useState<EncryptResponse | null>(null);

  const [envelopeText, setEnvelopeText] = useState("");
  const [decrypting, setDecrypting] = useState(false);
  const [decResult, setDecResult] = useState<DecryptResponse | null>(null);
  const [decFailure, setDecFailure] = useState<DecryptFailure | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await api<{ keys: ApiKeyDTO[] }>("/api/ahe/keys");
      setKeys(data.keys);
      setKeyId((cur) => {
        if (cur && data.keys.some((k) => k.id === cur && !k.revoked)) return cur;
        return data.keys.find((k) => !k.revoked)?.id ?? "";
      });
    } catch (err) {
      toast({ title: "Could not load keys", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
    } finally {
      setKeysLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadKeys();
    // ApiKeysCard dispatches this when keys are created/revoked elsewhere.
    const onChange = () => void loadKeys();
    window.addEventListener("ahe:keys-changed", onChange);
    return () => window.removeEventListener("ahe:keys-changed", onChange);
  }, [loadKeys]);

  const selectedKey = keys.find((k) => k.id === keyId);

  async function handleEncrypt() {
    if (!plaintext.trim()) {
      toast({ title: "Enter a plaintext to encrypt", variant: "destructive" });
      return;
    }
    setEncrypting(true);
    try {
      const data = await post<EncryptResponse>("/api/ahe/encrypt", {
        keyId: keyId || undefined,
        plaintext,
      });
      setEncResult(data);
      setEnvelopeText(JSON.stringify(data.envelope, null, 2));
      setDecResult(null);
      setDecFailure(null);
      void loadKeys(); // refresh used/quota
      toast({ title: "Encrypted", description: `${data.ciphertextBytes} bytes · ${data.latencyMs} ms` });
    } catch (err) {
      toast({
        title: "Encrypt failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setEncrypting(false);
    }
  }

  async function handleDecrypt() {
    setDecResult(null);
    setDecFailure(null);
    let envelope: unknown;
    try {
      envelope = JSON.parse(envelopeText);
    } catch {
      const failure: DecryptFailure = { ok: false, code: "AHE_MALFORMED_ENVELOPE", message: "Envelope is not valid JSON." };
      setDecFailure(failure);
      return;
    }
    setDecrypting(true);
    const result = await postWithCode<DecryptResponse>("/api/ahe/decrypt", { envelope });
    setDecrypting(false);
    if (result.ok) {
      setDecResult(result.data);
      void loadKeys();
      toast({ title: "Decrypted", description: `Authenticated · ${result.data.latencyMs} ms` });
    } else {
      setDecFailure(result);
    }
  }

  function loadTamperedSample() {
    if (!encResult) {
      toast({ title: "Encrypt something first", description: "The tamper demo needs a real envelope to corrupt." });
      return;
    }
    try {
      const env = JSON.parse(envelopeText) as AheEnvelope;
      env.ct = flipOneChar(env.ct);
      setEnvelopeText(JSON.stringify(env, null, 2));
      setDecResult(null);
      setDecFailure(null);
      toast({ title: "Tampered envelope loaded", description: "One ciphertext character was flipped — decrypt will fail auth." });
    } catch {
      toast({ title: "Cannot tamper — envelope is not valid JSON", variant: "destructive" });
    }
  }

  function clearAll() {
    setEncResult(null);
    setDecResult(null);
    setDecFailure(null);
    setEnvelopeText("");
    setPlaintext(SAMPLE_PLAINTEXT);
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: `${what} copied to clipboard` });
    } catch {
      toast({ title: "Clipboard unavailable", variant: "destructive" });
    }
  }

  return (
    <Card className="glass card-hover">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">AHE console</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={clearAll} className="gap-1.5 text-muted-foreground">
            <Eraser className="size-3.5" aria-hidden /> Clear
          </Button>
        </div>
        <CardDescription>
          Encrypt and decrypt with your own keys. Envelopes are versioned (v, alg, kdf, kid, iv, ct, tag) — no key
          material ever leaves the server.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Key selector */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={keyId} onValueChange={setKeyId}>
            <SelectTrigger className="w-full sm:w-[280px]" aria-label="API key">
              <SelectValue placeholder={keysLoading ? "Loading keys…" : "Select an API key"} />
            </SelectTrigger>
            <SelectContent>
              {keys
                .filter((k) => !k.revoked)
                .map((k) => (
                  <SelectItem key={k.id} value={k.id}>
                    <span className="font-mono text-xs">{k.prefix}</span>
                    <span className="ml-2">{k.label}</span>
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {selectedKey && (
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={
                  selectedKey.environment === "PRODUCTION"
                    ? "border-primary/50 text-primary-foreground"
                    : "border-cyan-400/50 text-cyan-300"
                }
              >
                {selectedKey.environment}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {selectedKey.used}/{selectedKey.quota} calls used
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Encrypt column */}
          <section className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4" aria-label="Encrypt">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Lock className="size-4 text-violet-400" aria-hidden /> Encrypt
              </h3>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => copy(plaintext, "Plaintext")} aria-label="Copy plaintext">
                <Copy className="size-3.5" />
              </Button>
            </div>
            <Textarea
              value={plaintext}
              onChange={(e) => setPlaintext(e.target.value)}
              rows={6}
              maxLength={8000}
              className="font-mono text-xs bg-black/40"
              placeholder="Type the plaintext to encrypt…"
              aria-label="Plaintext"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleEncrypt}
                disabled={encrypting || !keyId}
                className="gap-2 glow-violet flex-1 sm:flex-none"
              >
                <Lock className="size-4" aria-hidden />
                {encrypting ? "Encrypting…" : "Encrypt"}
              </Button>
              {encResult && (
                <>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Zap className="size-3 text-cyan-300" aria-hidden /> {encResult.latencyMs} ms
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {encResult.ciphertextBytes} bytes ct
                  </Badge>
                </>
              )}
            </div>
          </section>

          {/* Decrypt column */}
          <section className="space-y-3 rounded-xl border border-white/5 bg-black/20 p-4" aria-label="Decrypt">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Unlock className="size-4 text-cyan-300" aria-hidden /> Decrypt
              </h3>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-7" onClick={loadTamperedSample} aria-label="Load tampered sample">
                  <AlertTriangle className="size-3.5 text-amber-400" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => copy(envelopeText, "Envelope")}
                  aria-label="Copy envelope"
                  disabled={!envelopeText}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <Textarea
              value={envelopeText}
              onChange={(e) => setEnvelopeText(e.target.value)}
              rows={6}
              className="font-mono text-xs bg-black/40"
              placeholder='{"v":"AHE-1","alg":"A256GCM",…} — encrypt once and it lands here, or paste your own envelope'
              aria-label="Envelope JSON"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleDecrypt}
                disabled={decrypting || !envelopeText.trim()}
                variant="secondary"
                className="gap-2 glow-cyan flex-1 sm:flex-none"
              >
                <Unlock className="size-4" aria-hidden />
                {decrypting ? "Decrypting…" : "Decrypt"}
              </Button>
              {decResult && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Zap className="size-3 text-cyan-300" aria-hidden /> {decResult.latencyMs} ms
                </Badge>
              )}
            </div>
          </section>
        </div>

        {/* Decrypt failure */}
        {decFailure && (
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>{decFailure.code ?? "Decrypt failed"}</AlertTitle>
            <AlertDescription>
              {decFailure.message}
              {decFailure.code === "AHE_AUTH_FAILED" && " — this is tamper detection doing its job."}
            </AlertDescription>
          </Alert>
        )}

        {/* Plaintext output */}
        {decResult && (
          <section className="space-y-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4" aria-label="Decrypted plaintext">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-cyan-300">Plaintext recovered</h3>
              <Button variant="ghost" size="icon" className="size-7" onClick={() => copy(decResult.plaintext, "Plaintext")} aria-label="Copy recovered plaintext">
                <Copy className="size-3.5" />
              </Button>
            </div>
            <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-black/40 p-3 font-mono text-xs text-foreground">
              {decResult.plaintext}
            </pre>
          </section>
        )}

        {/* Envelope output */}
        {encResult && (
          <>
            <Separator className="opacity-40" />
            <section className="space-y-2" aria-label="Envelope">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-violet-300">Envelope (v1)</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  onClick={loadTamperedSample}
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Load tampered sample
                </Button>
              </div>
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-black/40 p-3 font-mono text-xs text-cyan-100/90">
                {JSON.stringify(encResult.envelope, null, 2)}
              </pre>
              <p className="text-[11px] text-muted-foreground">
                Paste this envelope into the decrypt panel (or edit it) to round-trip. Post-quantum roadmap: the
                envelope&apos;s versioned header is the ML-KEM integration point (planned stage) — v1 itself does not
                claim post-quantum security.
              </p>
            </section>
          </>
        )}

        {keysLoading && <Skeleton className="h-10 w-full" />}
      </CardContent>
    </Card>
  );
}

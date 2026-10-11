// AHE — Adaptive Hashing Encryption (v1) — SERVER ONLY.
//
// Honest engineering notes (per product spec section 9):
// - v1 uses HKDF-SHA256 for key derivation and AES-256-GCM for authenticated
//   encryption, implemented with Node's audited `node:crypto` primitives.
// - The envelope is versioned so a post-quantum KEM (ML-KEM) can be added as a
//   later stage without breaking existing ciphertexts. v1 does NOT claim to be
//   post-quantum; UI copy must reflect that.
// - Master key material never leaves the server and is never logged.

import crypto from "crypto";
import { db } from "@/lib/db";

export const AHE_VERSION = "AHE-1";
export const AHE_ALG = "A256GCM";
export const AHE_KDF = "HKDF-SHA256";

const CONFIG_KEY = "ahe_master_secret_v1";

/** Lazily provision the server master secret (never exposed via API). */
async function masterSecret(): Promise<Buffer> {
  const found = await db.config.findUnique({ where: { key: CONFIG_KEY } });
  if (found) return Buffer.from(found.value, "base64");
  const secret = crypto.randomBytes(48);
  await db.config.create({ data: { key: CONFIG_KEY, value: secret.toString("base64") } });
  return secret;
}

/** Derive a 32-byte content key for a given API key id using HKDF-SHA256. */
async function deriveKey(kid: string): Promise<Buffer> {
  const ikm = await masterSecret();
  return crypto.hkdfSync("sha256", ikm, Buffer.from(`ahe:salt:${kid}`), Buffer.from(`ahe:info:${AHE_VERSION}:aes-256-gcm`), 32) as unknown as Buffer;
}

function b64u(buf: Buffer): string {
  return buf.toString("base64url");
}

export interface EncryptResult {
  envelope: Record<string, string>;
  ciphertextBytes: number;
  latencyMs: number;
}

export async function aheEncrypt(kid: string, plaintext: string): Promise<EncryptResult> {
  const t0 = Date.now();
  const key = await deriveKey(kid);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    envelope: {
      v: AHE_VERSION,
      alg: AHE_ALG,
      kdf: AHE_KDF,
      kid,
      iv: b64u(iv),
      ct: b64u(ct),
      tag: b64u(tag),
    },
    ciphertextBytes: ct.length,
    latencyMs: Date.now() - t0,
  };
}

export interface DecryptResult {
  plaintext: string;
  latencyMs: number;
}

export class AheError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function aheDecrypt(envelope: Record<string, string>): Promise<DecryptResult> {
  const t0 = Date.now();
  if (envelope.v !== AHE_VERSION) throw new AheError("AHE_UNSUPPORTED_VERSION", `Unsupported envelope version: ${envelope.v}`);
  if (envelope.alg !== AHE_ALG || envelope.kdf !== AHE_KDF) throw new AheError("AHE_UNSUPPORTED_ALG", "Unsupported algorithm or KDF");
  if (!envelope.kid || !envelope.iv || !envelope.ct || !envelope.tag) throw new AheError("AHE_MALFORMED_ENVELOPE", "Envelope is missing required fields");
  let key: Buffer;
  try {
    key = await deriveKey(envelope.kid);
  } catch {
    throw new AheError("AHE_KEY_UNAVAILABLE", "Content key for this kid could not be derived");
  }
  let iv: Buffer, ct: Buffer, tag: Buffer;
  try {
    iv = Buffer.from(envelope.iv, "base64url");
    ct = Buffer.from(envelope.ct, "base64url");
    tag = Buffer.from(envelope.tag, "base64url");
  } catch {
    throw new AheError("AHE_MALFORMED_ENVELOPE", "Envelope fields are not valid base64url");
  }
  if (iv.length !== 12) throw new AheError("AHE_MALFORMED_ENVELOPE", "IV must be 12 bytes");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  let pt: Buffer;
  try {
    pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  } catch {
    throw new AheError("AHE_AUTH_FAILED", "Authentication failed — ciphertext, tag, or key does not match (tamper detected)");
  }
  return { plaintext: pt.toString("utf8"), latencyMs: Date.now() - t0 };
}

export interface SelfTestResult {
  name: string;
  status: "PASS" | "FAIL";
  detail: string;
}

/** Runs the AHE v1 test suite against a scratch kid (not a real API key). */
export async function aheSelfTest(): Promise<SelfTestResult[]> {
  const kid = "selftest-" + crypto.randomBytes(6).toString("hex");
  const results: SelfTestResult[] = [];

  // 1. Roundtrip
  const msg = "Quantum Launchpad self-test 🛸 —Ünïcødé ✓";
  const enc = await aheEncrypt(kid, msg);
  const dec = await aheDecrypt(enc.envelope);
  results.push({
    name: "Encrypt → decrypt roundtrip",
    status: dec.plaintext === msg ? "PASS" : "FAIL",
    detail: dec.plaintext === msg ? "UTF-8 content preserved" : "Plaintext mismatch",
  });

  // 2. Unique nonces
  const e1 = await aheEncrypt(kid, msg);
  const e2 = await aheEncrypt(kid, msg);
  results.push({
    name: "Unique nonce per encryption",
    status: e1.envelope.iv !== e2.envelope.iv && e1.envelope.ct !== e2.envelope.ct ? "PASS" : "FAIL",
    detail: "Same plaintext produces different ciphertext (random IV)",
  });

  // 3. Tamper detection
  const tampered = { ...enc.envelope, ct: flipByte(enc.envelope.ct) };
  try {
    await aheDecrypt(tampered);
    results.push({ name: "Tamper detection (GCM auth)", status: "FAIL", detail: "Modified ciphertext was accepted" });
  } catch (err) {
    const ok = err instanceof AheError && err.code === "AHE_AUTH_FAILED";
    results.push({ name: "Tamper detection (GCM auth)", status: ok ? "PASS" : "FAIL", detail: "Modified ciphertext rejected with AHE_AUTH_FAILED" });
  }

  // 4. Wrong kid rejection
  try {
    await aheDecrypt({ ...enc.envelope, kid: "other-kid" });
    results.push({ name: "Wrong key rejection", status: "FAIL", detail: "Ciphertext opened under a different kid" });
  } catch (err) {
    const ok = err instanceof AheError && err.code === "AHE_AUTH_FAILED";
    results.push({ name: "Wrong key rejection", status: ok ? "PASS" : "FAIL", detail: "Decrypt under different derived key fails authentication" });
  }

  // 5. Unsupported version
  try {
    await aheDecrypt({ ...enc.envelope, v: "AHE-9" });
    results.push({ name: "Envelope version guard", status: "FAIL", detail: "Unknown version accepted" });
  } catch (err) {
    const ok = err instanceof AheError && err.code === "AHE_UNSUPPORTED_VERSION";
    results.push({ name: "Envelope version guard", status: ok ? "PASS" : "FAIL", detail: "Unknown envelope version rejected" });
  }

  // 6. Key material secrecy (structural)
  const master = (await masterSecret()).toString("hex");
  const serialized = JSON.stringify(enc.envelope);
  results.push({
    name: "No key material in envelope",
    status: !serialized.includes(master) && !serialized.toLowerCase().includes("secret") ? "PASS" : "FAIL",
    detail: "Envelope contains only public fields (v, alg, kdf, kid, iv, ct, tag)",
  });

  return results;
}

function flipByte(b64url: string): string {
  const buf = Buffer.from(b64url, "base64url");
  buf[0] = buf[0] ^ 0x01;
  return b64u(buf);
}

/** Generate a new API key pair: returns full key once, stores sha256 hash. */
export async function generateApiKey(environment: "SANDBOX" | "PRODUCTION"): Promise<{ fullKey: string; prefix: string; hash: string }> {
  const raw = crypto.randomBytes(24).toString("base64url");
  const prefix = `ahe_${environment.toLowerCase()}_${raw.slice(0, 4)}`;
  const fullKey = `${prefix}.${raw}`;
  const hash = crypto.createHash("sha256").update(fullKey).digest("hex");
  return { fullKey, prefix, hash };
}

export function hashKey(fullKey: string): string {
  return crypto.createHash("sha256").update(fullKey).digest("hex");
}

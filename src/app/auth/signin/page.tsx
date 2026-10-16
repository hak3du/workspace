"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-4xl" aria-hidden="true">🔐</div>
      <h1 className="text-3xl font-semibold tracking-tight">Sign in to AHE Market</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Use your GitHub account to create a personal AHE Market profile. Signing in does not connect a wallet or authorize a blockchain transaction.
      </p>
      <button
        type="button"
        onClick={() => signIn("github", { callbackUrl: "/" })}
        className="rounded-xl border px-5 py-3 text-sm font-medium transition hover:bg-muted"
      >
        Continue with GitHub
      </button>
      <p className="max-w-md text-xs text-muted-foreground">
        OAuth sign-in must be configured by the site operator. Never enter a wallet seed phrase or private key into this site.
      </p>
    </main>
  );
}

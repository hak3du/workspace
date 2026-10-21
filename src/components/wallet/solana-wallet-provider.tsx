"use client";

import { createAppKit } from "@reown/appkit/react";
import { SolanaAdapter } from "@reown/appkit-adapter-solana/react";
import { solana, solanaDevnet, solanaTestnet } from "@reown/appkit/networks";
import { ConnectionProvider } from "@solana/wallet-adapter-react";
import { clusterApiUrl, type Cluster } from "@solana/web3.js";
import { useMemo, type ReactNode } from "react";

const configuredCluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER;
const cluster: Cluster =
  configuredCluster === "mainnet-beta" ? "mainnet-beta" :
  configuredCluster === "testnet" ? "testnet" : "devnet";

const appKitNetwork =
  cluster === "mainnet-beta" ? solana :
  cluster === "testnet" ? solanaTestnet : solanaDevnet;

// Keep AppKit's signing network aligned with the RPC used by the Pump SDK.
// Network switching stays unavailable until RPC and wallet can switch atomically.
const networks = [appKitNetwork] as [typeof appKitNetwork];
const projectId = process.env.NEXT_PUBLIC_PROJECT_ID;
if (!projectId) {
  throw new Error("NEXT_PUBLIC_PROJECT_ID is required to initialize Reown AppKit.");
}

createAppKit({
    adapters: [new SolanaAdapter()],
    projectId,
    networks,
    metadata: {
      name: "AHE Market",
      description: "Quantum Launchpad token discovery and market access",
      url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      icons: [],
    },
    features: { analytics: false, email: false, socials: [] },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#8b5cf6",
      "--w3m-border-radius-master": "12px",
    },
});

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const endpoint = useMemo(() => clusterApiUrl(cluster), []);

  return <ConnectionProvider endpoint={endpoint}>{children}</ConnectionProvider>;
}

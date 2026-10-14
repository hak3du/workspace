import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SolanaWalletProvider } from "@/components/wallet/solana-wallet-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quantum Launchpad V2.5 â€” Discover. Create. Connect. Launch. Build.",
  description:
    "A media-first digital universe: discover content, build communities in Spaces, launch tokens on the Launch Arena, and explore AHE cryptography in Quantum Labs.",
  keywords: ["Quantum Launchpad", "media platform", "launchpad", "AHE", "post-quantum", "creator economy", "Spaces"],
  authors: [{ name: "Quantum Launchpad" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Quantum Launchpad V2.5",
    description: "Discover, create, connect, launch and build â€” one coherent universe.",
    siteName: "Quantum Launchpad",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <SolanaWalletProvider>
          {children}
          <Toaster />
        </SolanaWalletProvider>
      </body>
    </html>
  );
}


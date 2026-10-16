-- Durable state for PQC identity registration, one-time leaf allocation,
-- and exact-lamport fee reconciliation. Apply only after configuring the target DB.
-- Replace simulated/implicitly-trusted wallet rows with explicitly unverified rows.
 ALTER TABLE "Wallet" RENAME TO "Wallet_old";
CREATE TABLE "Wallet" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'Unverified',
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "Wallet" ("id", "userId", "address", "provider", "verified", "createdAt")
SELECT "id", "userId", "address", 'Unverified', 0, "createdAt" FROM "Wallet_old";
DROP TABLE "Wallet_old";
CREATE UNIQUE INDEX "Wallet_address_key" ON "Wallet"("address");

CREATE TABLE "WalletChallenge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "nonce" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WalletChallenge_nonce_key" ON "WalletChallenge"("nonce");
CREATE INDEX "WalletChallenge_userId_address_idx" ON "WalletChallenge"("userId", "address");

CREATE TABLE "PqIdentity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "walletAddress" TEXT NOT NULL,
  "pqAddress" TEXT NOT NULL,
  "root" TEXT NOT NULL,
  "pubSeed" TEXT NOT NULL,
  "height" INTEGER NOT NULL DEFAULT 8,
  "scheme" TEXT NOT NULL DEFAULT 'WOTS(w=16,SHA-256)+Merkle',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "PqIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PqIdentity_userId_key" ON "PqIdentity"("userId");
CREATE UNIQUE INDEX "PqIdentity_walletAddress_key" ON "PqIdentity"("walletAddress");
CREATE UNIQUE INDEX "PqIdentity_pqAddress_key" ON "PqIdentity"("pqAddress");

CREATE TABLE "PqLeafUse" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identityId" TEXT NOT NULL,
  "leaf" INTEGER NOT NULL,
  "messageDigest" TEXT NOT NULL,
  "mint" TEXT NOT NULL,
  "canonicalJson" TEXT NOT NULL,
  "signatureJson" TEXT,
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signedAt" DATETIME,
  "anchoredAt" DATETIME,
  CONSTRAINT "PqLeafUse_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "PqIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PqLeafUse_identityId_leaf_key" ON "PqLeafUse"("identityId", "leaf");
CREATE UNIQUE INDEX "PqLeafUse_messageDigest_key" ON "PqLeafUse"("messageDigest");
CREATE UNIQUE INDEX "PqLeafUse_mint_key" ON "PqLeafUse"("mint");

CREATE TABLE "CreatorFeeSettlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "txSignature" TEXT NOT NULL,
  "tokenMint" TEXT NOT NULL,
  "creatorWallet" TEXT NOT NULL,
  "platformWallet" TEXT NOT NULL,
  "totalObservedLamports" BIGINT NOT NULL,
  "creatorLamports" BIGINT NOT NULL,
  "platformLamports" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OBSERVED',
  "slot" BIGINT,
  "blockTime" DATETIME,
  "observedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" DATETIME,
  "reconciledAt" DATETIME
);

CREATE UNIQUE INDEX "CreatorFeeSettlement_txSignature_key" ON "CreatorFeeSettlement"("txSignature");


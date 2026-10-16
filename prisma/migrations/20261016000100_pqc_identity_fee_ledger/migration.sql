-- Durable state for PQC identity registration, one-time leaf allocation,
-- and exact-lamport fee reconciliation. Apply only after configuring the target DB.
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
  "grossLamports" BIGINT NOT NULL,
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

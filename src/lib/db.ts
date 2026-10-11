import { createClient } from "@libsql/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { TURSO_SCHEMA_SQL } from "@/lib/turso-schema";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  tursoSchemaReady: Promise<void> | undefined;
  tursoSchemaClient: ReturnType<typeof createClient> | undefined;
};

const tursoUrl = process.env.TURSO_DATABASE_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;
const useTurso = Boolean(tursoUrl && tursoToken);

function ensureTursoSchema(): Promise<void> {
  if (!useTurso) return Promise.resolve();
  if (!globalForPrisma.tursoSchemaReady) {
    const client =
      globalForPrisma.tursoSchemaClient ??
      createClient({ url: tursoUrl!, authToken: tursoToken! });
    globalForPrisma.tursoSchemaClient = client;
    globalForPrisma.tursoSchemaReady = client.executeMultiple(TURSO_SCHEMA_SQL);
  }
  return globalForPrisma.tursoSchemaReady;
}

const prismaOptions = useTurso
  ? {
      adapter: new PrismaLibSQL({
        url: tursoUrl!,
        authToken: tursoToken!,
      }),
      log: ["error", "warn"] as ("error" | "warn")[],
    }
  : { log: ["error", "warn"] as ("error" | "warn")[] };

const prisma =
  globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * A fresh Turso database is initialized idempotently before the first Prisma
 * model operation. Local development/CI continue to use DATABASE_URL/SQLite.
 * The schema bootstrap never enables real blockchain transactions.
 */
export const db = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        await ensureTursoSchema();
        return query(args);
      },
    },
  },
});

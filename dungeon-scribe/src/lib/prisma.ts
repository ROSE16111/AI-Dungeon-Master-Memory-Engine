import { PrismaClient } from '@prisma/client';

// 1) Declare a reusable "singleton slot" on globalThis
//    TypeScript requires us to define a type (optional)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// 2) Reuse existing Prisma instance if available, otherwise create a new one
export const prisma =
  globalForPrisma.prisma ??
  // new PrismaClient({ log: ['warn', 'error'] });
  new PrismaClient({ log: ['query', 'info', 'warn', 'error'] });

// 3) In development mode, attach instance to globalThis for reuse across hot reloads
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Create a Prisma singleton to avoid repeatedly instantiating PrismaClient,
// which can cause connection exhaustion.
//
// In Next.js development mode with Hot Module Replacement (HMR),
// files like route.ts, server components, and lib files are re-executed
// on each save. Every reload would create a new PrismaClient instance
// while old ones remain connected, leading to too many open connections.
//
// By storing the instance in a process-level global variable (globalThis),
// subsequent reloads reuse the existing PrismaClient instead of creating new ones.

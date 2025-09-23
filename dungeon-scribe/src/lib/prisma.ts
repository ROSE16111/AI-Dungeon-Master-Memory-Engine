import { PrismaClient } from '@prisma/client';

// 1) 在 globalThis 上声明一个可复用的“单例槽位”
//    TypeScript 需要我们给它一个类型（可选）
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// 2) 如果全局上已有 prisma，就直接用；否则 new 一个
export const prisma =
  globalForPrisma.prisma ??
//new PrismaClient({ log: ['warn', 'error'] });
  new PrismaClient({ log: ['query','info','warn','error'] });
 
  // 3) 只有在开发环境下，把实例挂回 globalThis，供下次热更复用
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

//建一个 Prisma 单例（singleton） 避免反复 new PrismaClient() 导致连接爆掉
//Next.js 的开发模式/热更新 (HMR) 下，在 Next.js（尤其是 App Router）开发模式中，每次保存文件都会触发 热更新
// route.ts、server components、lib 文件会被 重新执行
// 每次热更都会 再 new 一个 PrismaClient（旧的还活着），连接数越堆越多
//把实例放到一个 进程级全局变量 里（globalThis），这样下次热更再执行到这段代码时，
// 我们就复用已经创建的实例，不再 new 新的
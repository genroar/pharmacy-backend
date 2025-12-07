import './config/database.init';
import { PrismaClient } from '@prisma/client';
declare const app: import("express-serve-static-core").Express;
export declare function getPrismaClient(): Promise<PrismaClient>;
export default app;
//# sourceMappingURL=server.d.ts.map
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getSales: (req: AuthRequest, res: Response) => Promise<void>;
export declare const createSale: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getCustomers: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getSalesReport: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=example-isolation.controller.d.ts.map
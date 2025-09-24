import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getSales: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getSale: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSaleByReceiptNumber: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAvailableReceiptNumbers: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createSale: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=sale.controller.d.ts.map
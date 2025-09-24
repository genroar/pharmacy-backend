import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getSuppliers: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSupplier: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createSupplier: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateSupplier: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteSupplier: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=supplier.controller.d.ts.map
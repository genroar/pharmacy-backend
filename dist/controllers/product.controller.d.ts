import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getProduct: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createProduct: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateProduct: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteProduct: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateStock: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const bulkImportProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAllProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const activateAllProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const bulkDeleteProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getStockMovements: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=product.controller.d.ts.map
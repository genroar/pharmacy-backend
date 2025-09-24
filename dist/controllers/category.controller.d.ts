import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getCategories: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateCategory: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteCategory: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=category.controller.d.ts.map
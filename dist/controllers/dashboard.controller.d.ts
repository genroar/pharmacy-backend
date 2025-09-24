import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getDashboardStats: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSalesChart: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAdminDashboardStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getTopSellingProducts: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSalesByPaymentMethod: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=dashboard.controller.d.ts.map
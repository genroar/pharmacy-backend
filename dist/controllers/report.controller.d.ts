import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getSalesReport: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getInventoryReport: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getCustomerReport: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getProductPerformanceReport: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getTopSellingProducts: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getSalesByPaymentMethod: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getDashboardData: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=report.controller.d.ts.map
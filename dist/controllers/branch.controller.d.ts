import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getBranches: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getBranch: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const createBranch: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateBranch: (req: AuthRequest, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const deleteBranch: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=branch.controller.d.ts.map
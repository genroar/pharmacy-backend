import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getAdmins: (req: Request, res: Response) => Promise<void>;
export declare const getAdmin: (req: Request, res: Response) => Promise<void>;
export declare const createAdmin: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateAdmin: (req: Request, res: Response) => Promise<void>;
export declare const deleteAdmin: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAdminUsers: (req: Request, res: Response) => Promise<void>;
export declare const getSuperAdminStats: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=admin.controller.d.ts.map
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getRoles: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getRolePermissions: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getUserPermissions: (req: AuthRequest, res: Response) => Promise<void>;
export declare const checkPermission: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getAllowedActions: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateUserRole: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=role.controller.d.ts.map
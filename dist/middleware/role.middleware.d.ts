import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
export declare const requirePermission: (resource: string, action: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireRead: (resource: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireCreate: (resource: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireUpdate: (resource: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireDelete: (resource: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireManage: (resource: string) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireRole: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireBranchAccess: (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const requireOwnership: (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export interface PermissionContext {
    resource: string;
    action: string;
    userRole: string;
    userBranchId?: string;
    targetBranchId?: string;
    isOwnData: boolean;
}
declare global {
    namespace Express {
        interface Request {
            permissionContext?: PermissionContext;
        }
    }
}
//# sourceMappingURL=role.middleware.d.ts.map
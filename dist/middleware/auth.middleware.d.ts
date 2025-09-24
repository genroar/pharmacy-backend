import { Request, Response, NextFunction } from 'express';
export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: string;
        branchId?: string;
        createdBy?: string;
    };
}
export declare const authenticate: (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
export declare const authorize: (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => void | Response<any, Record<string, any>>;
export declare const buildAdminWhereClause: (req: AuthRequest, baseWhere?: any) => any;
export declare const buildBranchWhereClause: (req: AuthRequest, baseWhere?: any) => any;
export declare const buildBranchWhereClauseForRelation: (req: AuthRequest, baseWhere?: any) => any;
export declare const validateResourceOwnership: (resourceType: string) => (req: AuthRequest, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=auth.middleware.d.ts.map
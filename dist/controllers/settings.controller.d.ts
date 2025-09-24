import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const getSettings: (req: AuthRequest, res: Response) => Promise<void>;
export declare const updateSettings: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getTaxRate: (req: AuthRequest, res: Response) => Promise<void>;
//# sourceMappingURL=settings.controller.d.ts.map
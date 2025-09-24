import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
export declare const createRefund: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getRefunds: (req: AuthRequest, res: Response) => Promise<void>;
export declare const getRefundById: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=refund.controller.d.ts.map
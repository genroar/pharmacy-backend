import { Request, Response } from 'express';
export declare const startShift: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const endShift: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getShifts: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getActiveShift: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateShift: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getShiftStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=shift.controller.d.ts.map
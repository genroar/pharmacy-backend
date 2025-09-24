import { Request, Response } from 'express';
export declare const checkIn: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const checkOut: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAttendance: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getTodayAttendance: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const updateAttendance: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
export declare const getAttendanceStats: (req: Request, res: Response) => Promise<Response<any, Record<string, any>>>;
//# sourceMappingURL=attendance.controller.d.ts.map
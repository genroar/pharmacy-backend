import { Request, Response } from 'express';
export declare const getSubscription: (req: Request, res: Response) => Promise<void>;
export declare const updateSubscription: (req: Request, res: Response) => Promise<void>;
export declare const addPaymentMethod: (req: Request, res: Response) => Promise<void>;
export declare const setDefaultPaymentMethod: (req: Request, res: Response) => Promise<void>;
export declare const deletePaymentMethod: (req: Request, res: Response) => Promise<void>;
export declare const getBillingHistory: (req: Request, res: Response) => Promise<void>;
export declare const processPayment: (req: Request, res: Response) => Promise<void>;
export declare const getPaymentMethods: (req: Request, res: Response) => Promise<void>;
export declare const downloadInvoice: (req: Request, res: Response) => Promise<void>;
//# sourceMappingURL=subscription.controller.d.ts.map
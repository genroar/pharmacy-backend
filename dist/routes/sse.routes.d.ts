declare const router: import("express-serve-static-core").Router;
export declare const notifyUserDeactivation: (userId: string) => void;
export declare const notifyUserReactivation: (userId: string) => void;
export declare const notifyAdminGroup: (createdBy: string, eventType: string, data: any) => void;
export declare const notifyProductChange: (createdBy: string, action: "created" | "updated" | "deleted", product: any) => void;
export declare const notifySaleChange: (createdBy: string, action: "created" | "updated" | "deleted", sale: any) => void;
export declare const notifyRefundChange: (createdBy: string, action: "created" | "updated" | "deleted", refund: any) => void;
export declare const notifyCustomerChange: (createdBy: string, action: "created" | "updated" | "deleted", customer: any) => void;
export declare const notifyInventoryChange: (createdBy: string, action: "stock_updated" | "product_added" | "product_removed", data: any) => void;
export default router;
//# sourceMappingURL=sse.routes.d.ts.map
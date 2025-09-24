export interface Permission {
    resource: string;
    actions: string[];
    conditions?: {
        branchId?: boolean;
        ownData?: boolean;
        limit?: number;
    };
}
export interface RolePermissions {
    role: string;
    permissions: Permission[];
    description: string;
}
export declare const RESOURCES: {
    readonly USERS: "users";
    readonly EMPLOYEES: "employees";
    readonly BRANCHES: "branches";
    readonly PRODUCTS: "products";
    readonly CATEGORIES: "categories";
    readonly SUPPLIERS: "suppliers";
    readonly STOCK_MOVEMENTS: "stock_movements";
    readonly SALES: "sales";
    readonly RECEIPTS: "receipts";
    readonly REFUNDS: "refunds";
    readonly REPORTS: "reports";
    readonly DASHBOARD: "dashboard";
    readonly ANALYTICS: "analytics";
    readonly SETTINGS: "settings";
    readonly INTEGRATIONS: "integrations";
    readonly BACKUP: "backup";
    readonly PRESCRIPTIONS: "prescriptions";
    readonly CUSTOMERS: "customers";
    readonly MEDICATION_HISTORY: "medication_history";
    readonly COMMISSIONS: "commissions";
    readonly PAYMENTS: "payments";
    readonly BILLING: "billing";
};
export declare const ACTIONS: {
    readonly CREATE: "create";
    readonly READ: "read";
    readonly UPDATE: "update";
    readonly DELETE: "delete";
    readonly APPROVE: "approve";
    readonly REJECT: "reject";
    readonly EXPORT: "export";
    readonly IMPORT: "import";
    readonly MANAGE: "manage";
};
export declare const ROLE_PERMISSIONS: RolePermissions[];
export declare function getRolePermissions(role: string): Permission[];
export declare function hasPermission(userRole: string, resource: string, action: string, userBranchId?: string, targetBranchId?: string, isOwnData?: boolean): boolean;
export declare function getAccessibleResources(role: string): string[];
export declare function getAllowedActions(role: string, resource: string): string[];
//# sourceMappingURL=permissions.d.ts.map
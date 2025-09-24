"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROLE_PERMISSIONS = exports.ACTIONS = exports.RESOURCES = void 0;
exports.getRolePermissions = getRolePermissions;
exports.hasPermission = hasPermission;
exports.getAccessibleResources = getAccessibleResources;
exports.getAllowedActions = getAllowedActions;
exports.RESOURCES = {
    USERS: 'users',
    EMPLOYEES: 'employees',
    BRANCHES: 'branches',
    PRODUCTS: 'products',
    CATEGORIES: 'categories',
    SUPPLIERS: 'suppliers',
    STOCK_MOVEMENTS: 'stock_movements',
    SALES: 'sales',
    RECEIPTS: 'receipts',
    REFUNDS: 'refunds',
    REPORTS: 'reports',
    DASHBOARD: 'dashboard',
    ANALYTICS: 'analytics',
    SETTINGS: 'settings',
    INTEGRATIONS: 'integrations',
    BACKUP: 'backup',
    PRESCRIPTIONS: 'prescriptions',
    CUSTOMERS: 'customers',
    MEDICATION_HISTORY: 'medication_history',
    COMMISSIONS: 'commissions',
    PAYMENTS: 'payments',
    BILLING: 'billing'
};
exports.ACTIONS = {
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    APPROVE: 'approve',
    REJECT: 'reject',
    EXPORT: 'export',
    IMPORT: 'import',
    MANAGE: 'manage'
};
exports.ROLE_PERMISSIONS = [
    {
        role: 'PRODUCT_OWNER',
        description: 'Product Owner / Subscription Admin - Full control of the POS product itself',
        permissions: [
            { resource: exports.RESOURCES.USERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.BRANCHES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.SETTINGS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.INTEGRATIONS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.BACKUP, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.ANALYTICS, actions: [exports.ACTIONS.READ], conditions: { branchId: false } },
            { resource: exports.RESOURCES.BILLING, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: false } },
            { resource: exports.RESOURCES.PRODUCTS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.SALES, actions: [], conditions: {} },
            { resource: exports.RESOURCES.PRESCRIPTIONS, actions: [], conditions: {} }
        ]
    },
    {
        role: 'SUPER_ADMIN',
        description: 'Super Admin - Full access across all branches of their pharmacy',
        permissions: [
            { resource: exports.RESOURCES.USERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.EMPLOYEES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.BRANCHES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.PRODUCTS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CATEGORIES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SUPPLIERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SALES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REPORTS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.DASHBOARD, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SETTINGS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.INTEGRATIONS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.BACKUP, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.COMMISSIONS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CUSTOMERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REFUNDS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } }
        ]
    },
    {
        role: 'MANAGER',
        description: 'Manager - Manages one store/branch operations',
        permissions: [
            { resource: exports.RESOURCES.USERS, actions: [exports.ACTIONS.CREATE, exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.EMPLOYEES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.PRODUCTS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CATEGORIES, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SUPPLIERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SALES, actions: [exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REPORTS, actions: [exports.ACTIONS.READ, exports.ACTIONS.EXPORT], conditions: { branchId: true } },
            { resource: exports.RESOURCES.DASHBOARD, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REFUNDS, actions: [exports.ACTIONS.APPROVE, exports.ACTIONS.REJECT], conditions: { branchId: true, limit: 1000 } },
            { resource: exports.RESOURCES.CUSTOMERS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.COMMISSIONS, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SETTINGS, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.INTEGRATIONS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.BACKUP, actions: [], conditions: {} }
        ]
    },
    {
        role: 'PHARMACIST',
        description: 'Pharmacist - Ensures prescriptions and medicine sales are compliant',
        permissions: [
            { resource: exports.RESOURCES.PRODUCTS, actions: [exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.PRESCRIPTIONS, actions: [exports.ACTIONS.MANAGE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CUSTOMERS, actions: [exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.MEDICATION_HISTORY, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.SALES, actions: [exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.STOCK_MOVEMENTS, actions: [exports.ACTIONS.READ, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.DASHBOARD, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REPORTS, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CATEGORIES, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.USERS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.EMPLOYEES, actions: [], conditions: {} },
            { resource: exports.RESOURCES.COMMISSIONS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.SETTINGS, actions: [], conditions: {} }
        ]
    },
    {
        role: 'CASHIER',
        description: 'Cashier - Handles customer checkout and frontend sales',
        permissions: [
            { resource: exports.RESOURCES.SALES, actions: [exports.ACTIONS.CREATE, exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.RECEIPTS, actions: [exports.ACTIONS.CREATE, exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REFUNDS, actions: [exports.ACTIONS.CREATE, exports.ACTIONS.READ], conditions: { branchId: true, limit: 100 } },
            { resource: exports.RESOURCES.PRODUCTS, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CUSTOMERS, actions: [exports.ACTIONS.READ, exports.ACTIONS.CREATE, exports.ACTIONS.UPDATE], conditions: { branchId: true } },
            { resource: exports.RESOURCES.CATEGORIES, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.DASHBOARD, actions: [exports.ACTIONS.READ], conditions: { branchId: true } },
            { resource: exports.RESOURCES.REPORTS, actions: [exports.ACTIONS.READ], conditions: { branchId: true, ownData: true } },
            { resource: exports.RESOURCES.USERS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.EMPLOYEES, actions: [], conditions: {} },
            { resource: exports.RESOURCES.SETTINGS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.SUPPLIERS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.STOCK_MOVEMENTS, actions: [], conditions: {} },
            { resource: exports.RESOURCES.COMMISSIONS, actions: [], conditions: {} }
        ]
    }
];
function getRolePermissions(role) {
    const roleConfig = exports.ROLE_PERMISSIONS.find(r => r.role === role);
    return roleConfig ? roleConfig.permissions : [];
}
function hasPermission(userRole, resource, action, userBranchId, targetBranchId, isOwnData = false) {
    const permissions = getRolePermissions(userRole);
    const permission = permissions.find(p => p.resource === resource);
    if (!permission)
        return false;
    if (!permission.actions.includes(action))
        return false;
    if (permission.conditions) {
        const { branchId, ownData, limit } = permission.conditions;
        if (branchId === true && userBranchId && targetBranchId && userBranchId !== targetBranchId) {
            return false;
        }
        if (ownData === true && !isOwnData) {
            return false;
        }
        if (limit && action === exports.ACTIONS.CREATE) {
        }
    }
    return true;
}
function getAccessibleResources(role) {
    const permissions = getRolePermissions(role);
    return permissions
        .filter(p => p.actions.length > 0)
        .map(p => p.resource);
}
function getAllowedActions(role, resource) {
    const permissions = getRolePermissions(role);
    const permission = permissions.find(p => p.resource === resource);
    return permission ? permission.actions : [];
}
//# sourceMappingURL=permissions.js.map
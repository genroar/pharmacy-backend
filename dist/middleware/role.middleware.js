"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOwnership = exports.requireBranchAccess = exports.requireRole = exports.requireManage = exports.requireDelete = exports.requireUpdate = exports.requireCreate = exports.requireRead = exports.requirePermission = void 0;
const permissions_1 = require("../config/permissions");
const requirePermission = (resource, action) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No user found.'
            });
        }
        const { role, branchId } = req.user;
        const targetBranchId = req.params.branchId || req.body.branchId || req.query.branchId;
        const isOwnData = req.params.userId === req.user.id || req.body.userId === req.user.id;
        const hasAccess = (0, permissions_1.hasPermission)(role, resource, action, branchId, targetBranchId, isOwnData);
        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Insufficient permissions for ${action} on ${resource}.`,
                required: { resource, action },
                user: { role, branchId }
            });
        }
        req.permissionContext = {
            resource,
            action,
            userRole: role,
            userBranchId: branchId,
            targetBranchId,
            isOwnData
        };
        return next();
    };
};
exports.requirePermission = requirePermission;
const requireRead = (resource) => (0, exports.requirePermission)(resource, permissions_1.ACTIONS.READ);
exports.requireRead = requireRead;
const requireCreate = (resource) => (0, exports.requirePermission)(resource, permissions_1.ACTIONS.CREATE);
exports.requireCreate = requireCreate;
const requireUpdate = (resource) => (0, exports.requirePermission)(resource, permissions_1.ACTIONS.UPDATE);
exports.requireUpdate = requireUpdate;
const requireDelete = (resource) => (0, exports.requirePermission)(resource, permissions_1.ACTIONS.DELETE);
exports.requireDelete = requireDelete;
const requireManage = (resource) => (0, exports.requirePermission)(resource, permissions_1.ACTIONS.MANAGE);
exports.requireManage = requireManage;
const requireRole = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No user found.'
            });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}`,
                required: roles,
                user: { role: req.user.role }
            });
        }
        return next();
    };
};
exports.requireRole = requireRole;
const requireBranchAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No user found.'
        });
    }
    const { role, branchId } = req.user;
    const targetBranchId = req.params.branchId || req.body.branchId || req.query.branchId;
    if (role === 'SUPER_ADMIN' || role === 'PRODUCT_OWNER') {
        return next();
    }
    if (targetBranchId && targetBranchId !== branchId) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. You can only access your own branch data.',
            user: { role, branchId },
            target: { branchId: targetBranchId }
        });
    }
    return next();
};
exports.requireBranchAccess = requireBranchAccess;
const requireOwnership = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No user found.'
        });
    }
    const { role, id: userId } = req.user;
    const targetUserId = req.params.userId || req.body.userId;
    if (role === 'SUPER_ADMIN' || role === 'PRODUCT_OWNER') {
        return next();
    }
    if (targetUserId && targetUserId !== userId) {
        return res.status(403).json({
            success: false,
            message: 'Access denied. You can only access your own data.',
            user: { role, id: userId },
            target: { userId: targetUserId }
        });
    }
    return next();
};
exports.requireOwnership = requireOwnership;
//# sourceMappingURL=role.middleware.js.map
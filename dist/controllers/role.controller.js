"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateUserRole = exports.getAllowedActions = exports.checkPermission = exports.getUserPermissions = exports.getRolePermissions = exports.getRoles = void 0;
const client_1 = require("@prisma/client");
const permissions_1 = require("../config/permissions");
const prisma = new client_1.PrismaClient();
const getRoles = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        if (!['SUPER_ADMIN', 'PRODUCT_OWNER'].includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.'
            });
            return;
        }
        res.json({
            success: true,
            data: permissions_1.ROLE_PERMISSIONS
        });
    }
    catch (error) {
        console.error('Get roles error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getRoles = getRoles;
const getRolePermissions = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const { role } = req.params;
        if (!['SUPER_ADMIN', 'PRODUCT_OWNER'].includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.'
            });
            return;
        }
        const permissions = (0, permissions_1.getRolePermissions)(role);
        const accessibleResources = (0, permissions_1.getAccessibleResources)(role);
        res.json({
            success: true,
            data: {
                role,
                permissions,
                accessibleResources
            }
        });
    }
    catch (error) {
        console.error('Get role permissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getRolePermissions = getRolePermissions;
const getUserPermissions = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const { role, branchId } = req.user;
        const permissions = (0, permissions_1.getRolePermissions)(role);
        const accessibleResources = (0, permissions_1.getAccessibleResources)(role);
        res.json({
            success: true,
            data: {
                user: {
                    role,
                    branchId
                },
                permissions,
                accessibleResources
            }
        });
    }
    catch (error) {
        console.error('Get user permissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getUserPermissions = getUserPermissions;
const checkPermission = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const { resource, action } = req.query;
        const { role, branchId } = req.user;
        const targetBranchId = req.query.targetBranchId;
        const isOwnData = req.query.isOwnData === 'true';
        if (!resource || !action) {
            res.status(400).json({
                success: false,
                message: 'Resource and action parameters are required'
            });
            return;
        }
        const hasAccess = (0, permissions_1.hasPermission)(role, resource, action, branchId, targetBranchId, isOwnData);
        res.json({
            success: true,
            data: {
                hasAccess,
                user: { role, branchId },
                permission: { resource, action, targetBranchId, isOwnData }
            }
        });
    }
    catch (error) {
        console.error('Check permission error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.checkPermission = checkPermission;
const getAllowedActions = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        const { resource } = req.params;
        const { role } = req.user;
        const allowedActions = (0, permissions_1.getAllowedActions)(role, resource);
        res.json({
            success: true,
            data: {
                resource,
                userRole: role,
                allowedActions
            }
        });
    }
    catch (error) {
        console.error('Get allowed actions error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAllowedActions = getAllowedActions;
const updateUserRole = async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
            return;
        }
        if (!['SUPER_ADMIN', 'PRODUCT_OWNER'].includes(req.user.role)) {
            res.status(403).json({
                success: false,
                message: 'Access denied. Insufficient permissions.'
            });
            return;
        }
        const { userId } = req.params;
        const { role } = req.body;
        if (!['PRODUCT_OWNER', 'SUPER_ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER'].includes(role)) {
            res.status(400).json({
                success: false,
                message: 'Invalid role. Must be one of: PRODUCT_OWNER, SUPER_ADMIN, MANAGER, PHARMACIST, CASHIER'
            });
            return;
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role },
            select: {
                id: true,
                username: true,
                name: true,
                role: true,
                branchId: true,
                isActive: true
            }
        });
        res.json({
            success: true,
            data: updatedUser,
            message: 'User role updated successfully'
        });
    }
    catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateUserRole = updateUserRole;
//# sourceMappingURL=role.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateResourceOwnership = exports.buildBranchWhereClauseForRelation = exports.buildBranchWhereClause = exports.buildAdminWhereClause = exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                role: true,
                branchId: true,
                createdBy: true,
                isActive: true
            }
        });
        if (!user) {
            return res.status(401).json({
                message: 'Invalid token or user not found.',
                code: 'USER_NOT_FOUND'
            });
        }
        if (!user.isActive) {
            return res.status(401).json({
                message: 'Your account has been deactivated. Please contact your administrator.',
                code: 'ACCOUNT_DEACTIVATED'
            });
        }
        let createdBy = user.createdBy;
        if (user.role === 'ADMIN' && (!createdBy || createdBy === '')) {
            createdBy = user.id;
        }
        req.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branchId || undefined,
            createdBy: createdBy || undefined
        };
        return next();
    }
    catch (error) {
        return res.status(401).json({ message: 'Invalid token.' });
    }
};
exports.authenticate = authenticate;
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'Access denied. No user found.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: 'Access denied. Insufficient permissions.'
            });
        }
        return next();
    };
};
exports.authorize = authorize;
const buildAdminWhereClause = (req, baseWhere = {}) => {
    if (req.user?.role === 'SUPERADMIN') {
        return baseWhere;
    }
    if (req.user?.createdBy) {
        return {
            ...baseWhere,
            createdBy: req.user.createdBy
        };
    }
    return {
        ...baseWhere,
        createdBy: 'non-existent-admin-id'
    };
};
exports.buildAdminWhereClause = buildAdminWhereClause;
const buildBranchWhereClause = (req, baseWhere = {}) => {
    if (req.user?.role === 'SUPERADMIN') {
        return baseWhere;
    }
    if (req.user?.role === 'ADMIN') {
        return (0, exports.buildAdminWhereClause)(req, baseWhere);
    }
    if (req.user?.role === 'MANAGER' && req.user?.branchId) {
        return {
            ...baseWhere,
            createdBy: req.user.createdBy,
            branchId: req.user.branchId
        };
    }
    if (req.user?.role === 'CASHIER' && req.user?.createdBy) {
        return (0, exports.buildAdminWhereClause)(req, baseWhere);
    }
    return {
        ...baseWhere,
        createdBy: 'non-existent-admin-id'
    };
};
exports.buildBranchWhereClause = buildBranchWhereClause;
const buildBranchWhereClauseForRelation = (req, baseWhere = {}) => {
    if (req.user?.role === 'SUPERADMIN') {
        return baseWhere;
    }
    if (req.user?.role === 'ADMIN') {
        return (0, exports.buildAdminWhereClause)(req, baseWhere);
    }
    if (req.user?.role === 'MANAGER' && req.user?.branchId) {
        return {
            ...baseWhere,
            createdBy: req.user.createdBy
        };
    }
    if (req.user?.role === 'CASHIER' && req.user?.createdBy) {
        return (0, exports.buildAdminWhereClause)(req, baseWhere);
    }
    return {
        ...baseWhere,
        createdBy: 'non-existent-admin-id'
    };
};
exports.buildBranchWhereClauseForRelation = buildBranchWhereClauseForRelation;
const validateResourceOwnership = (resourceType) => {
    return async (req, res, next) => {
        try {
            if (req.user?.role === 'SUPERADMIN') {
                return next();
            }
            const resourceId = req.params.id;
            if (!resourceId) {
                return res.status(400).json({
                    success: false,
                    message: 'Resource ID required'
                });
            }
            const resource = await prisma[resourceType].findFirst({
                where: {
                    id: resourceId,
                    createdBy: req.user?.createdBy
                },
                select: { id: true }
            });
            if (!resource) {
                return res.status(404).json({
                    success: false,
                    message: 'Resource not found or access denied'
                });
            }
            next();
        }
        catch (error) {
            console.error('Resource ownership validation error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    };
};
exports.validateResourceOwnership = validateResourceOwnership;
//# sourceMappingURL=auth.middleware.js.map
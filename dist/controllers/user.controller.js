"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activateUser = exports.deleteUser = exports.updateUser = exports.createUser = exports.getUser = exports.getUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_util_1 = require("../utils/db.util");
const sync_helper_1 = require("../utils/sync-helper");
const joi_1 = __importDefault(require("joi"));
const createUserSchema = joi_1.default.object({
    username: joi_1.default.string().min(3).max(30).required(),
    email: joi_1.default.string().pattern(/^[^\s@]+@[^\s@]+$/).required().messages({
        'string.pattern.base': 'Email must contain @ symbol'
    }),
    password: joi_1.default.string().min(6).required(),
    name: joi_1.default.string().required(),
    role: joi_1.default.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER').required(),
    branchId: joi_1.default.string().allow(null, '').optional()
});
const updateUserSchema = joi_1.default.object({
    username: joi_1.default.string().min(3).max(30),
    email: joi_1.default.string().email({ tlds: { allow: false } }),
    password: joi_1.default.string().min(6),
    name: joi_1.default.string(),
    role: joi_1.default.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER'),
    branchId: joi_1.default.string(),
    isActive: joi_1.default.boolean()
});
const getUsers = async (req, res) => {
    try {
        await (0, sync_helper_1.pullLatestFromLive)('user').catch(err => console.log('[Sync] Pull users:', err.message));
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 10, search = '', role = '', branchId = '', isActive = true } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        const selectedCompanyId = req.headers['x-company-id'] || req.user?.selectedCompanyId;
        const selectedBranchId = req.headers['x-branch-id'] || req.user?.selectedBranchId;
        console.log('🔍 getUsers - User context:', {
            userId: req.user?.id,
            role: req.user?.role,
            headerCompanyId: req.headers['x-company-id'],
            headerBranchId: req.headers['x-branch-id'],
            selectedCompanyId,
            selectedBranchId,
            createdBy: req.user?.createdBy
        });
        if (req.user?.role === 'SUPERADMIN') {
            if (selectedCompanyId) {
                where.branch = { companyId: selectedCompanyId };
            }
            if (selectedBranchId) {
                where.branchId = selectedBranchId;
            }
        }
        else if (req.user?.role === 'ADMIN') {
            if (selectedBranchId) {
                where.branchId = selectedBranchId;
                console.log('🏢 Admin filtering users by selected branch:', selectedBranchId);
            }
            else if (selectedCompanyId) {
                where.branch = { companyId: selectedCompanyId };
                console.log('🏢 Admin filtering users by selected company:', selectedCompanyId);
            }
            else {
                where.createdBy = req.user?.id;
            }
        }
        else if (req.user?.role === 'MANAGER' || req.user?.role === 'CASHIER') {
            if (req.user?.branchId) {
                where.branchId = req.user.branchId;
            }
            else {
                where.branchId = 'no-access';
            }
        }
        if (isActive !== 'all') {
            where.isActive = isActive === 'true' || isActive === true;
        }
        if (branchId) {
            where.branchId = branchId;
        }
        if (role) {
            where.role = role;
        }
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { username: { contains: search } },
                { email: { contains: search } }
            ];
        }
        console.log('🔍 getUsers - Final where clause:', JSON.stringify(where, null, 2));
        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take,
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);
        const usersWithoutPassword = users.map(user => {
            const { password, ...userWithoutPassword } = user;
            return userWithoutPassword;
        });
        return res.json({
            success: true,
            data: {
                users: usersWithoutPassword,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            }
        });
    }
    catch (error) {
        console.error('Get users error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getUsers = getUsers;
const getUser = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const where = { id };
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.createdBy) {
            where.createdBy = req.user.createdBy;
        }
        else {
            where.createdBy = req.user?.id;
        }
        const user = await prisma.user.findFirst({
            where,
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found or access denied'
            });
        }
        const { password, ...userWithoutPassword } = user;
        return res.json({
            success: true,
            data: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Get user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getUser = getUser;
const createUser = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        console.log('=== CREATE USER REQUEST ===');
        console.log('Request body:', req.body);
        console.log('User context:', { role: req.user?.role, createdBy: req.user?.createdBy, branchId: req.user?.branchId });
        const { error } = createUserSchema.validate(req.body);
        if (error) {
            console.log('Validation errors:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const userData = req.body;
        const branchId = userData.branchId && userData.branchId.trim() !== '' ? userData.branchId : null;
        const existingUserByUsername = await prisma.user.findFirst({
            where: {
                username: userData.username,
                branchId: branchId
            }
        });
        if (existingUserByUsername) {
            console.log('❌ User with username already exists in this branch:', userData.username);
            return res.status(400).json({
                success: false,
                message: `User with username "${userData.username}" already exists in this branch`,
                field: 'username',
                code: 'USER_EXISTS'
            });
        }
        const existingUserByEmail = await prisma.user.findFirst({
            where: {
                email: userData.email,
                branchId: branchId
            }
        });
        if (existingUserByEmail) {
            console.log('❌ User with email already exists in this branch:', userData.email);
            return res.status(400).json({
                success: false,
                message: `User with email "${userData.email}" already exists in this branch`,
                field: 'email',
                code: 'USER_EXISTS'
            });
        }
        if (userData.branchId && userData.branchId.trim() !== '') {
            const branch = await prisma.branch.findUnique({
                where: { id: userData.branchId }
            });
            if (!branch) {
                return res.status(400).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
        }
        const hashedPassword = await bcryptjs_1.default.hash(userData.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
        const currentUserId = req.user?.id;
        const currentUserAdminId = req.user?.createdBy;
        const currentUserCompanyId = req.user?.companyId;
        const createdByValue = currentUserAdminId || currentUserId;
        let companyIdValue = currentUserCompanyId;
        const branchIdValue = userData.branchId && userData.branchId.trim() !== '' ? userData.branchId : null;
        if (branchIdValue && !companyIdValue) {
            const branch = await prisma.branch.findUnique({
                where: { id: branchIdValue },
                select: { companyId: true }
            });
            if (branch) {
                companyIdValue = branch.companyId;
            }
        }
        console.log('Creating user with isolation data:', {
            createdBy: createdByValue,
            companyId: companyIdValue,
            branchId: branchIdValue,
            currentUserId,
            currentUserAdminId,
            currentUserCompanyId
        });
        const user = await prisma.user.create({
            data: {
                username: userData.username,
                email: userData.email,
                password: hashedPassword,
                name: userData.name,
                role: userData.role,
                branchId: branchIdValue,
                companyId: companyIdValue,
                createdBy: createdByValue,
                isActive: true
            },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        const { password, ...userWithoutPassword } = user;
        (0, sync_helper_1.syncAfterOperation)('user', 'create', userWithoutPassword).catch(err => {
            console.error('[Sync] User create sync failed:', err.message);
        });
        return res.status(201).json({
            success: true,
            data: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Create user error:', error);
        console.error('Error details:', {
            message: error?.message,
            code: error?.code,
            meta: error?.meta
        });
        if (error?.code === 'P2002') {
            const field = error?.meta?.target?.[0] || 'field';
            return res.status(400).json({
                success: false,
                message: `A user with this ${field} already exists`,
                code: 'USER_EXISTS',
                field
            });
        }
        return res.status(500).json({
            success: false,
            message: error?.message || 'Internal server error'
        });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const { error } = updateUserSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingUser = await prisma.user.findUnique({
            where: { id }
        });
        if (!existingUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        if (updateData.username || updateData.email) {
            const where = { id: { not: id } };
            if (updateData.username) {
                where.username = updateData.username;
            }
            if (updateData.email) {
                where.email = updateData.email;
            }
            const userExists = await prisma.user.findFirst({ where });
            if (userExists) {
                return res.status(400).json({
                    success: false,
                    message: 'User with this username or email already exists'
                });
            }
        }
        if (updateData.password) {
            updateData.password = await bcryptjs_1.default.hash(updateData.password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
        }
        const user = await prisma.user.update({
            where: { id },
            data: updateData,
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        const { password, ...userWithoutPassword } = user;
        (0, sync_helper_1.syncAfterOperation)('user', 'update', userWithoutPassword).catch(err => {
            console.error('[Sync] User update sync failed:', err.message);
        });
        return res.json({
            success: true,
            data: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Update user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateUser = updateUser;
const deleteUser = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const user = await prisma.user.findUnique({
            where: { id }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        await prisma.user.delete({
            where: { id }
        });
        return res.json({
            success: true,
            message: 'User deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteUser = deleteUser;
const activateUser = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const { isActive } = req.body;
        const user = await prisma.user.findUnique({
            where: { id }
        });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        const updatedUser = await prisma.user.update({
            where: { id },
            data: { isActive },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        const { password, ...userWithoutPassword } = updatedUser;
        return res.json({
            success: true,
            data: userWithoutPassword,
            message: `User ${isActive ? 'activated' : 'deactivated'} successfully`
        });
    }
    catch (error) {
        console.error('Activate user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.activateUser = activateUser;
//# sourceMappingURL=user.controller.js.map
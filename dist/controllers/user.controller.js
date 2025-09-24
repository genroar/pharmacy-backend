"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getUser = exports.getUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
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
        const { page = 1, limit = 10, search = '', role = '', branchId = '', isActive = true } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.createdBy) {
            where.createdBy = req.user.createdBy;
        }
        else {
            where.createdBy = req.user?.id;
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
                { name: { contains: search, mode: 'insensitive' } },
                { username: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
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
                        address: true
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
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: userData.username },
                    { email: userData.email }
                ]
            }
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User with this username or email already exists'
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
        const hashedPassword = await bcryptjs_1.default.hash(userData.password, 12);
        const currentUserId = req.user?.id;
        const currentUserAdminId = req.user?.createdBy;
        const user = await prisma.user.create({
            data: {
                ...userData,
                password: hashedPassword,
                createdBy: currentUserAdminId || currentUserId,
                branchId: userData.branchId && userData.branchId.trim() !== '' ? userData.branchId : 'temp'
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
        return res.status(201).json({
            success: true,
            data: userWithoutPassword
        });
    }
    catch (error) {
        console.error('Create user error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createUser = createUser;
const updateUser = async (req, res) => {
    try {
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
            updateData.password = await bcryptjs_1.default.hash(updateData.password, 12);
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
//# sourceMappingURL=user.controller.js.map
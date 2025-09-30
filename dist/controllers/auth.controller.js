"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.changePassword = exports.getProfile = exports.register = exports.login = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const loginSchema = joi_1.default.object({
    usernameOrEmail: joi_1.default.string().required(),
    password: joi_1.default.string().required()
});
const registerSchema = joi_1.default.object({
    username: joi_1.default.string().min(3).max(30).required(),
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string().min(6).required(),
    name: joi_1.default.string().required(),
    role: joi_1.default.string().valid('PRODUCT_OWNER', 'SUPERADMIN', 'ADMIN', 'MANAGER', 'PHARMACIST', 'CASHIER').required(),
    branchId: joi_1.default.string().optional(),
    branchData: joi_1.default.object({
        name: joi_1.default.string().required(),
        address: joi_1.default.string().required(),
        phone: joi_1.default.string().required()
    }).optional()
});
const login = async (req, res) => {
    try {
        console.log('🔍 Login attempt - Request body:', req.body);
        const { error } = loginSchema.validate(req.body);
        if (error) {
            console.log('❌ Validation error:', error.details);
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const { usernameOrEmail, password } = req.body;
        console.log('🔍 Login attempt - Username/Email:', usernameOrEmail);
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: usernameOrEmail },
                    { email: usernameOrEmail }
                ],
                isActive: true
            },
            include: {
                branch: true
            }
        });
        if (!user) {
            console.log('❌ User not found for username/email:', usernameOrEmail);
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
        const isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
        console.log('🔐 Password check - Valid:', isPasswordValid);
        if (!isPasswordValid) {
            console.log('❌ Invalid password for user:', usernameOrEmail);
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branchId,
            createdBy: user.createdBy
        }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    branchId: user.branchId,
                    createdBy: user.createdBy
                },
                token
            }
        });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.login = login;
const register = async (req, res) => {
    try {
        const { error } = registerSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const { username, email, password, name, role, branchId, branchData } = req.body;
        const existingUser = await prisma.user.findFirst({
            where: {
                OR: [
                    { username },
                    { email }
                ]
            }
        });
        if (existingUser) {
            res.status(400).json({
                success: false,
                message: 'User with this username or email already exists'
            });
            return;
        }
        let finalBranchId = branchId;
        let branch;
        let user;
        if (branchData && (role === 'ADMIN' || role === 'SUPERADMIN')) {
            const hashedPassword = await bcryptjs_1.default.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    name,
                    role,
                    branchId: 'temp',
                    createdBy: null
                }
            });
            user = await prisma.user.update({
                where: { id: user.id },
                data: { createdBy: user.id }
            });
            branch = await prisma.branch.create({
                data: {
                    name: branchData.name,
                    address: branchData.address,
                    phone: branchData.phone,
                    email: email,
                    isActive: true
                }
            });
            finalBranchId = branch.id;
            user = await prisma.user.update({
                where: { id: user.id },
                data: { branchId: finalBranchId },
                include: { branch: true }
            });
        }
        else if (branchId) {
            branch = await prisma.branch.findUnique({
                where: { id: branchId }
            });
            if (!branch) {
                res.status(400).json({
                    success: false,
                    message: 'Branch not found'
                });
                return;
            }
            const hashedPassword = await bcryptjs_1.default.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    name,
                    role,
                    branchId: finalBranchId,
                    createdBy: (role === 'ADMIN' || role === 'SUPERADMIN') ? null : undefined
                },
                include: {
                    branch: true
                }
            });
        }
        else {
            res.status(400).json({
                success: false,
                message: 'Either branchId or branchData must be provided'
            });
            return;
        }
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branchId,
            createdBy: user.createdBy
        }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        res.status(201).json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    branchId: user.branchId,
                    createdBy: user.createdBy
                },
                token
            }
        });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.register = register;
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        res.json({
            success: true,
            data: user
        });
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getProfile = getProfile;
const changePasswordSchema = joi_1.default.object({
    currentPassword: joi_1.default.string().required(),
    newPassword: joi_1.default.string().min(6).required()
});
const changePassword = async (req, res) => {
    try {
        const { error } = changePasswordSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const userId = req.user.id;
        const { currentPassword, newPassword } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        const isCurrentPasswordValid = await bcryptjs_1.default.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
            return;
        }
        const hashedNewPassword = await bcryptjs_1.default.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
        await prisma.user.update({
            where: { id: userId },
            data: { password: hashedNewPassword }
        });
        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    }
    catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.changePassword = changePassword;
const updateProfileSchema = joi_1.default.object({
    name: joi_1.default.string().optional(),
    email: joi_1.default.string().email().optional()
});
const updateProfile = async (req, res) => {
    try {
        const { error } = updateProfileSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const userId = req.user.id;
        const { name, email } = req.body;
        if (email) {
            const existingUser = await prisma.user.findFirst({
                where: {
                    email,
                    id: { not: userId }
                }
            });
            if (existingUser) {
                res.status(400).json({
                    success: false,
                    message: 'Email is already taken by another user'
                });
                return;
            }
        }
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
                ...(name && { name }),
                ...(email && { email })
            }
        });
        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                username: updatedUser.username,
                role: updatedUser.role
            }
        });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateProfile = updateProfile;
//# sourceMappingURL=auth.controller.js.map
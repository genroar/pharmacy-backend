"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfile = exports.changePassword = exports.getProfile = exports.register = exports.login = void 0;
require("../config/database.init");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const db_util_1 = require("../utils/db.util");
const joi_1 = __importDefault(require("joi"));
const generateSessionToken = () => {
    return crypto_1.default.randomBytes(32).toString('hex');
};
const loginSchema = joi_1.default.object({
    usernameOrEmail: joi_1.default.string().required(),
    password: joi_1.default.string().required()
});
const registerSchema = joi_1.default.object({
    username: joi_1.default.string().min(3).max(30).required(),
    email: joi_1.default.string().email().required(),
    password: joi_1.default.string()
        .min(8)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/)
        .required()
        .messages({
        'string.min': 'Password must be at least 8 characters long',
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
    name: joi_1.default.string().required(),
    role: joi_1.default.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER').required(),
    branchId: joi_1.default.string().allow('', null).optional(),
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
        const prisma = await (0, db_util_1.getPrisma)();
        const user = await prisma.user.findFirst({
            where: {
                OR: [
                    { username: usernameOrEmail },
                    { email: usernameOrEmail }
                ]
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
        const isOfflineMode = process.env.DATABASE_URL?.startsWith('file:') || false;
        if (!user.isActive && !isOfflineMode) {
            console.log('❌ User account is disabled:', usernameOrEmail);
            res.status(403).json({
                success: false,
                message: 'Account is disabled. Please contact support at +923107100663 to activate your account.',
                accountDisabled: true
            });
            return;
        }
        if (!user.isActive && isOfflineMode) {
            console.log('🔓 Offline mode: Auto-activating user account:', usernameOrEmail);
            const prisma = await (0, db_util_1.getPrisma)();
            await prisma.user.update({
                where: { id: user.id },
                data: { isActive: true }
            });
            user.isActive = true;
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
        const sessionToken = generateSessionToken();
        await prisma.user.update({
            where: { id: user.id },
            data: {
                sessionToken,
                lastLoginAt: new Date()
            }
        });
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not defined');
        }
        const token = jsonwebtoken_1.default.sign({
            userId: user.id,
            username: user.username,
            role: user.role,
            branchId: user.branchId,
            createdBy: user.createdBy,
            sessionToken
        }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
        console.log('✅ Login successful for user:', usernameOrEmail);
        res.json({
            success: true,
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    branchId: user.branchId,
                    createdBy: user.createdBy,
                    isActive: user.isActive,
                    email: user.email
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
        const prisma = await (0, db_util_1.getPrisma)();
        const processedBranchId = (branchId === '' || branchId === null || branchId === undefined) ? null : branchId;
        const existingUsername = await prisma.user.findUnique({
            where: { username }
        });
        if (existingUsername) {
            res.status(400).json({
                success: false,
                message: 'Username already exists',
                field: 'username'
            });
            return;
        }
        const existingEmail = await prisma.user.findUnique({
            where: { email }
        });
        if (existingEmail) {
            res.status(400).json({
                success: false,
                message: 'Email already exists',
                field: 'email'
            });
            return;
        }
        let user;
        const hashedPassword = await bcryptjs_1.default.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
        const isOfflineMode = process.env.DATABASE_URL?.startsWith('file:') || false;
        const shouldBeActive = isOfflineMode;
        if (role === 'ADMIN' || role === 'SUPERADMIN') {
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    name,
                    role,
                    branchId: null,
                    companyId: null,
                    isActive: shouldBeActive,
                    createdBy: null
                }
            });
            user = await prisma.user.update({
                where: { id: user.id },
                data: { createdBy: user.id }
            });
        }
        else {
            if (!processedBranchId) {
                res.status(400).json({
                    success: false,
                    message: 'Branch ID is required for non-admin users'
                });
                return;
            }
            const branch = await prisma.branch.findUnique({
                where: { id: processedBranchId }
            });
            if (!branch) {
                res.status(400).json({
                    success: false,
                    message: 'Branch not found'
                });
                return;
            }
            user = await prisma.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    name,
                    role,
                    branchId: processedBranchId,
                    companyId: branch.companyId,
                    isActive: shouldBeActive,
                    createdBy: null
                },
                include: {
                    branch: true,
                    company: true
                }
            });
        }
        if (shouldBeActive) {
            console.log('✅ Account created and activated (offline mode):', username);
            const sessionToken = crypto_1.default.randomBytes(32).toString('hex');
            await prisma.user.update({
                where: { id: user.id },
                data: { sessionToken, lastLoginAt: new Date() }
            });
            const token = jsonwebtoken_1.default.sign({
                userId: user.id,
                username: user.username,
                role: user.role,
                branchId: user.branchId,
                createdBy: user.createdBy,
                sessionToken
            }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
            res.status(201).json({
                success: true,
                pendingActivation: false,
                message: 'Account created successfully! You can now login.',
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role,
                        isActive: true,
                        email: user.email
                    },
                    token
                }
            });
        }
        else {
            console.log('✅ Account created (pending activation):', username);
            res.status(201).json({
                success: true,
                pendingActivation: true,
                message: 'Account created successfully! Please contact SuperAdmin to activate your account before you can login.',
                data: {
                    user: {
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role,
                        isActive: user.isActive,
                        email: user.email
                    }
                }
            });
        }
    }
    catch (error) {
        console.error('Register error:', error);
        console.error('Error details:', {
            message: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            name: error instanceof Error ? error.name : 'Unknown'
        });
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : 'Unknown error') : undefined
        });
    }
};
exports.register = register;
const getProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
    email: joi_1.default.string().email().optional(),
    profileImage: joi_1.default.string().uri().optional()
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
        const { name, email, profileImage } = req.body;
        const prisma = await (0, db_util_1.getPrisma)();
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
                ...(email && { email }),
                ...(profileImage !== undefined && { profileImage })
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
                profileImage: updatedUser.profileImage,
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
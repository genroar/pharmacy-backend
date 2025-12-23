"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAccountStatus = exports.resetPassword = exports.forgotPassword = exports.updateProfile = exports.changePassword = exports.getProfile = exports.register = exports.login = void 0;
require("../config/database.init");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const db_util_1 = require("../utils/db.util");
const sync_helper_1 = require("../utils/sync-helper");
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
        let prisma;
        try {
            prisma = await (0, db_util_1.getPrisma)();
        }
        catch (dbError) {
            console.error('[Auth] ❌ Database connection failed:', dbError.message);
            const { isDatabaseInitialized } = await Promise.resolve().then(() => __importStar(require('../utils/db-initializer')));
            const isInitialized = await isDatabaseInitialized().catch(() => false);
            if (!isInitialized) {
                console.log('[Auth] ⚠️ Database not initialized - this appears to be first-time install');
                try {
                    const { initializeSQLiteDatabase } = await Promise.resolve().then(() => __importStar(require('../utils/db-initializer')));
                    const initResult = await initializeSQLiteDatabase();
                    if (initResult.success) {
                        console.log('[Auth] ✅ Database initialized successfully - retrying login...');
                        prisma = await (0, db_util_1.getPrisma)();
                    }
                    else {
                        res.status(503).json({
                            success: false,
                            message: 'Database initialization failed. Please restart the application.',
                            code: 'DATABASE_INIT_FAILED',
                            error: initResult.error,
                            requiresRestart: true
                        });
                        return;
                    }
                }
                catch (initError) {
                    console.error('[Auth] ❌ Database initialization error:', initError.message);
                    res.status(503).json({
                        success: false,
                        message: 'Database not initialized. Please restart the application to complete setup.',
                        code: 'DATABASE_NOT_INITIALIZED',
                        error: initError.message,
                        requiresRestart: true
                    });
                    return;
                }
            }
            else {
                res.status(500).json({
                    success: false,
                    message: 'Database connection failed. Please try again or contact support.',
                    code: 'DATABASE_CONNECTION_ERROR',
                    error: dbError.message
                });
                return;
            }
        }
        const isSQLite = process.env.DATABASE_URL?.startsWith('file:');
        let userCount = 0;
        if (isSQLite) {
            try {
                userCount = await prisma.user.count();
                console.log('[Auth] 📊 Current user count in SQLite:', userCount);
            }
            catch (countError) {
                console.error('[Auth] ⚠️ Could not count users:', countError.message);
            }
        }
        const { getSyncService } = await Promise.resolve().then(() => __importStar(require('../services/sync.service')));
        const syncService = getSyncService();
        const { getDatabaseService } = await Promise.resolve().then(() => __importStar(require('../services/database.service')));
        const dbService = getDatabaseService();
        const pgAvailable = await dbService.checkPostgreSQLConnectivity();
        if (isSQLite && userCount === 0 && !pgAvailable) {
            console.log('[Auth] ❌ First-time login requires internet connection');
            res.status(503).json({
                success: false,
                message: 'Internet connection required for first-time login. Please connect to the internet and try again.',
                code: 'FIRST_LOGIN_REQUIRES_INTERNET',
                requiresInternet: true
            });
            return;
        }
        if (pgAvailable) {
            console.log('[Auth] 🔄 Syncing users from PostgreSQL before login...');
            try {
                await syncService.syncUsersFromPostgreSQL();
                console.log('[Auth] ✅ User sync completed');
            }
            catch (syncErr) {
                console.log('[Auth] ⚠️ User sync warning:', syncErr.message);
            }
        }
        else if (isSQLite && userCount === 0) {
            console.log('[Auth] ❌ No users in database and PostgreSQL unavailable');
            res.status(503).json({
                success: false,
                message: 'Internet connection required for first-time login.',
                code: 'FIRST_LOGIN_REQUIRES_INTERNET',
                requiresInternet: true
            });
            return;
        }
        else {
            console.log('[Auth] ℹ️ PostgreSQL unavailable - using local SQLite data only');
        }
        const normalizedInput = usernameOrEmail.toLowerCase().trim();
        console.log('[Auth] Normalized input:', normalizedInput);
        let user;
        if (isSQLite) {
            const allUsers = await prisma.user.findMany({
                include: {
                    branch: true
                }
            });
            user = allUsers.find(u => u.email.toLowerCase() === normalizedInput ||
                u.username.toLowerCase() === normalizedInput);
            if (user) {
                console.log('[Auth] ✅ User found in SQLite:', user.email, 'isActive:', user.isActive);
            }
        }
        else {
            try {
                const users = await prisma.$queryRaw `
          SELECT * FROM users
          WHERE LOWER(email) = LOWER(${usernameOrEmail})
             OR LOWER(username) = LOWER(${usernameOrEmail})
          LIMIT 1
        `;
                if (users && users.length > 0) {
                    const userId = users[0].id;
                    user = await prisma.user.findUnique({
                        where: { id: userId },
                        include: {
                            branch: true
                        }
                    });
                }
                if (user) {
                    console.log('[Auth] ✅ User found in PostgreSQL:', user.email, 'isActive:', user.isActive);
                }
            }
            catch (pgError) {
                console.log('[Auth] Raw query failed, using regular query:', pgError.message);
                const allUsers = await prisma.user.findMany({
                    include: {
                        branch: true
                    }
                });
                user = allUsers.find(u => u.email.toLowerCase() === normalizedInput ||
                    u.username.toLowerCase() === normalizedInput);
            }
        }
        if (!user) {
            console.log('❌ User not found for username/email:', usernameOrEmail);
            console.log('[Auth] Searched in:', isSQLite ? 'SQLite' : 'PostgreSQL');
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
        if (!user.isActive) {
            console.log('❌ User account is not activated:', usernameOrEmail);
            res.status(403).json({
                success: false,
                message: 'Your account is not activated yet. Please contact SuperAdmin at +923107100663 to activate your account.',
                accountDisabled: true,
                pendingActivation: true
            });
            return;
        }
        console.log('[Auth] 🔐 Checking password for user:', user.email);
        console.log('[Auth] Password hash exists:', !!user.password);
        console.log('[Auth] Password hash length:', user.password?.length || 0);
        if (!user.password) {
            console.error('[Auth] ❌ User has no password hash:', user.email);
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
        let isPasswordValid = false;
        try {
            isPasswordValid = await bcryptjs_1.default.compare(password, user.password);
            console.log('[Auth] 🔐 Password check - Valid:', isPasswordValid);
        }
        catch (bcryptError) {
            console.error('[Auth] ❌ Bcrypt comparison error:', bcryptError.message);
            console.error('[Auth] ❌ Bcrypt error stack:', bcryptError.stack);
            res.status(500).json({
                success: false,
                message: 'Error validating password. Please try again.',
                code: 'PASSWORD_VALIDATION_ERROR',
                ...(process.env.NODE_ENV === 'development' && { details: bcryptError.message })
            });
            return;
        }
        if (!isPasswordValid && isSQLite) {
            try {
                const { getSyncService } = await Promise.resolve().then(() => __importStar(require('../services/sync.service')));
                const syncService = getSyncService();
                const { getDatabaseService } = await Promise.resolve().then(() => __importStar(require('../services/database.service')));
                const dbService = getDatabaseService();
                const pgAvailable = await dbService.checkPostgreSQLConnectivity();
                if (pgAvailable) {
                    console.log('[Auth] 🔄 Password mismatch - re-syncing user from PostgreSQL...');
                    await syncService.syncUsersFromPostgreSQL().catch(err => {
                        console.log('[Auth] Re-sync warning:', err.message);
                    });
                    const allUsers = await prisma.user.findMany({
                        include: {
                            branch: true
                        }
                    });
                    const syncedUser = allUsers.find(u => u.email.toLowerCase() === normalizedInput ||
                        u.username.toLowerCase() === normalizedInput);
                    if (syncedUser && syncedUser.password) {
                        console.log('[Auth] 🔄 Retrying password check after sync...');
                        try {
                            isPasswordValid = await bcryptjs_1.default.compare(password, syncedUser.password);
                            if (isPasswordValid) {
                                console.log('[Auth] ✅ Password valid after re-sync!');
                                user = syncedUser;
                            }
                        }
                        catch (bcryptError) {
                            console.error('[Auth] ❌ Bcrypt comparison error after sync:', bcryptError.message);
                        }
                    }
                }
            }
            catch (syncErr) {
                console.log('[Auth] Re-sync failed:', syncErr.message);
            }
        }
        if (!isPasswordValid) {
            console.log('❌ Invalid password for user:', usernameOrEmail);
            console.log('[Auth] User ID:', user.id);
            console.log('[Auth] User email:', user.email);
            console.log('[Auth] User username:', user.username);
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
        console.log('[Auth] 🔑 Checking JWT_SECRET:', process.env.JWT_SECRET ? 'Present' : 'Missing');
        if (!process.env.JWT_SECRET) {
            console.error('[Auth] ❌ JWT_SECRET is not defined in process.env');
            console.error('[Auth] ❌ Available env vars:', Object.keys(process.env).filter(k => k.includes('JWT')));
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
        console.error('Login error stack:', error.stack);
        console.error('Login error details:', {
            message: error.message,
            name: error.name,
            code: error.code,
            cause: error.cause
        });
        let errorMessage = 'Internal server error';
        let errorCode = 'INTERNAL_ERROR';
        if (error.message?.includes('database') || error.message?.includes('SQLite')) {
            errorMessage = 'Database connection error. Please restart the application.';
            errorCode = 'DATABASE_ERROR';
        }
        else if (error.message?.includes('Prisma')) {
            errorMessage = 'Database initialization error. Please restart the application.';
            errorCode = 'PRISMA_ERROR';
        }
        else if (error.message?.includes('bcrypt') || error.message?.includes('password')) {
            errorMessage = 'Error validating password. Please try again.';
            errorCode = 'PASSWORD_VALIDATION_ERROR';
        }
        else if (error.message?.includes('JWT_SECRET')) {
            errorMessage = 'Server configuration error. Please contact support.';
            errorCode = 'CONFIGURATION_ERROR';
        }
        res.status(500).json({
            success: false,
            message: errorMessage,
            code: errorCode,
            ...(process.env.NODE_ENV === 'development' && {
                details: error.message,
                stack: error.stack,
                name: error.name
            })
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
        const shouldBeActive = false;
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
        console.log('✅ Account created (pending SuperAdmin activation):', username);
        (0, sync_helper_1.syncAfterOperation)('user', 'create', user).catch(err => {
            console.error('[Sync] User registration sync failed:', err.message);
        });
        res.status(201).json({
            success: true,
            pendingActivation: true,
            message: 'Account created successfully! Please contact SuperAdmin at +923107100663 to activate your account before you can login.',
            data: {
                user: {
                    id: user.id,
                    username: user.username,
                    name: user.name,
                    role: user.role,
                    isActive: false,
                    email: user.email
                }
            }
        });
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
        (0, sync_helper_1.syncAfterOperation)('user', 'update', updatedUser).catch(err => {
            console.error('[Sync] Profile update sync failed:', err.message);
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
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            res.status(400).json({
                success: false,
                message: 'Email is required'
            });
            return;
        }
        const prisma = await (0, db_util_1.getPrisma)();
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() }
        });
        if (user) {
            console.log(`🔐 Forgot password request for user: ${email} (ID: ${user.id})`);
        }
        else {
            console.log(`🔐 Forgot password request for unknown email: ${email}`);
        }
        res.json({
            success: true,
            message: 'If an account with that email exists, we have logged your password reset request. Please contact SuperAdmin for assistance.',
            contactNumber: '+923107100663'
        });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.forgotPassword = forgotPassword;
const resetPassword = async (req, res) => {
    try {
        const { userId, newPassword } = req.body;
        const requestingUser = req.user;
        if (!requestingUser || (requestingUser.role !== 'SUPERADMIN' && requestingUser.role !== 'ADMIN')) {
            res.status(403).json({
                success: false,
                message: 'Only SuperAdmin or Admin can reset passwords'
            });
            return;
        }
        if (!userId || !newPassword) {
            res.status(400).json({
                success: false,
                message: 'User ID and new password are required'
            });
            return;
        }
        if (newPassword.length < 6) {
            res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
            return;
        }
        const prisma = await (0, db_util_1.getPrisma)();
        const targetUser = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!targetUser) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        const hashedPassword = await bcryptjs_1.default.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
        await prisma.user.update({
            where: { id: userId },
            data: {
                password: hashedPassword,
                sessionToken: null
            }
        });
        console.log(`🔐 Password reset for user: ${targetUser.email} by ${requestingUser.username}`);
        res.json({
            success: true,
            message: `Password has been reset for ${targetUser.name || targetUser.email}`
        });
    }
    catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.resetPassword = resetPassword;
const checkAccountStatus = async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                isActive: false,
                message: 'User not authenticated',
                shouldLogout: true
            });
            return;
        }
        const prisma = await (0, db_util_1.getPrisma)();
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                isActive: true,
                sessionToken: true,
                username: true
            }
        });
        if (!user) {
            res.status(404).json({
                success: false,
                isActive: false,
                message: 'User not found',
                shouldLogout: true
            });
            return;
        }
        const requestSessionToken = req.user?.sessionToken;
        if (requestSessionToken && user.sessionToken !== requestSessionToken) {
            res.status(401).json({
                success: false,
                isActive: false,
                message: 'Session expired - logged in from another device',
                shouldLogout: true
            });
            return;
        }
        if (!user.isActive) {
            console.log(`❌ Account deactivated for user: ${user.username}`);
            res.status(403).json({
                success: false,
                isActive: false,
                message: 'Your account has been deactivated. Please contact SuperAdmin at +923107100663 to reactivate.',
                shouldLogout: true,
                accountDeactivated: true
            });
            return;
        }
        res.json({
            success: true,
            isActive: true,
            message: 'Account is active',
            shouldLogout: false
        });
    }
    catch (error) {
        console.error('Check account status error:', error);
        res.status(500).json({
            success: false,
            isActive: true,
            message: 'Could not verify account status',
            shouldLogout: false
        });
    }
};
exports.checkAccountStatus = checkAccountStatus;
//# sourceMappingURL=auth.controller.js.map
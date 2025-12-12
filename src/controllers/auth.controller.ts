// CRITICAL: Import database initialization FIRST to ensure DATABASE_URL is set
// This prevents Prisma schema validation errors when PrismaClient is imported
import '../config/database.init';

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { LoginData, CreateUserData } from '../models/user.model';
import { validate } from '../middleware/validation.middleware';
import { getPrisma } from '../utils/db.util';
import Joi from 'joi';

// Generate unique session token
const generateSessionToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

// Validation schemas
const loginSchema = Joi.object({
  usernameOrEmail: Joi.string().required(),
  password: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).*$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }),
  name: Joi.string().required(),
  role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER').required(),
  branchId: Joi.string().allow('', null).optional(),
  branchData: Joi.object({
    name: Joi.string().required(),
    address: Joi.string().required(),
    phone: Joi.string().required()
  }).optional()
});

export const login = async (req: Request, res: Response): Promise<void> => {
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

    const { usernameOrEmail, password }: { usernameOrEmail: string; password: string } = req.body;
    console.log('🔍 Login attempt - Username/Email:', usernameOrEmail);

    // Get database client (works with SQLite or PostgreSQL)
    const prisma = await getPrisma();

    // Find user by username or email (check both active and inactive users)
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

    // Check if user account is active
    // In offline/SQLite mode, allow login even if account is not "officially" activated
    // This is for local installations where there's no SuperAdmin to activate accounts
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

    // In offline mode, auto-activate the user on first login
    if (!user.isActive && isOfflineMode) {
      console.log('🔓 Offline mode: Auto-activating user account:', usernameOrEmail);
      const prisma = await getPrisma();
      await prisma.user.update({
        where: { id: user.id },
        data: { isActive: true }
      });
      user.isActive = true;
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('🔐 Password check - Valid:', isPasswordValid);
    if (!isPasswordValid) {
      console.log('❌ Invalid password for user:', usernameOrEmail);
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }

    // Generate unique session token for single-session enforcement
    const sessionToken = generateSessionToken();

    // Update user with new session token (invalidates any previous sessions)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionToken,
        lastLoginAt: new Date()
      }
    });

    // Generate JWT token with session token included
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    const token = (jwt.sign as any)(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        createdBy: user.createdBy,
        sessionToken // Include session token in JWT for validation
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const register = async (req: Request, res: Response): Promise<void> => {
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

    // Get database client (works with SQLite or PostgreSQL)
    const prisma = await getPrisma();

    // Convert empty branchId to null for ADMIN and SUPERADMIN users
    const processedBranchId = (branchId === '' || branchId === null || branchId === undefined) ? null : branchId;

    // Check if username already exists
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

    // Check if email already exists
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    // Check if we're in offline/SQLite mode
    // In offline mode, users are created as ACTIVE (no SuperAdmin needed)
    const isOfflineMode = process.env.DATABASE_URL?.startsWith('file:') || false;
    const shouldBeActive = isOfflineMode; // Auto-activate in offline mode

    // For ADMIN and SUPERADMIN users, create user without branch/company initially
    // They will create companies and branches from the dashboard
    // In offline mode: Account is ACTIVE immediately
    // In online mode: Account needs activation by SuperAdmin
    if (role === 'ADMIN' || role === 'SUPERADMIN') {
      user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          name,
          role,
          branchId: null, // No branch initially
          companyId: null, // No company initially
          isActive: shouldBeActive, // Active in offline mode, inactive in online mode
          createdBy: null // Will be updated to self-reference after user creation
        }
      });

      // Update the user to set createdBy to their own ID (self-referencing)
      user = await prisma.user.update({
        where: { id: user.id },
        data: { createdBy: user.id }
      });
    } else {
      // For other roles (MANAGER, CASHIER), they need to be assigned to a branch
      if (!processedBranchId) {
        res.status(400).json({
          success: false,
          message: 'Branch ID is required for non-admin users'
        });
        return;
      }

      // Check if existing branch exists
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

      // Create user with branch assignment
      // In offline mode: Account is ACTIVE immediately
      // In online mode: Account needs activation by SuperAdmin
      user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          name,
          role,
          branchId: processedBranchId,
          companyId: branch.companyId,
          isActive: shouldBeActive, // Active in offline mode, inactive in online mode
          createdBy: null // Will be set by the admin who creates this user
        },
        include: {
          branch: true,
          company: true
        }
      });
    }

    // Handle response based on mode
    if (shouldBeActive) {
      // OFFLINE MODE: User is active, generate token for immediate login
      console.log('✅ Account created and activated (offline mode):', username);

      // Generate session token for immediate login
      const sessionToken = crypto.randomBytes(32).toString('hex');

      // Update user with session token
      await prisma.user.update({
        where: { id: user.id },
        data: { sessionToken, lastLoginAt: new Date() }
      });

      // Generate JWT token
      const token = (jwt.sign as any)(
        {
          userId: user.id,
          username: user.username,
          role: user.role,
          branchId: user.branchId,
          createdBy: user.createdBy,
          sessionToken
        },
        process.env.JWT_SECRET!,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );

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
          token // Include token for immediate login in offline mode
        }
      });
    } else {
      // ONLINE MODE: User needs activation, no token
      console.log('✅ Account created (pending activation):', username);

      res.status(201).json({
        success: true,
        pendingActivation: true, // Flag for frontend to show special message
        message: 'Account created successfully! Please contact SuperAdmin to activate your account before you can login.',
        data: {
          user: {
            id: user.id,
            username: user.username,
            name: user.name,
            role: user.role,
            isActive: user.isActive, // Will be false
            email: user.email
          }
          // NO token - user cannot login until activated
        }
      });
    }
  } catch (error) {
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

export const getProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user.id;

    // Get database client (works with SQLite or PostgreSQL)
    const prisma = await getPrisma();

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
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password schema
const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

export const changePassword = async (req: Request, res: Response): Promise<void> => {
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

    const userId = (req as any).user.id;
    const { currentPassword, newPassword } = req.body;

    // Get database client (works with SQLite or PostgreSQL)
    const prisma = await getPrisma();

    // Get user with current password
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

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
      return;
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));

    // Update password
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update profile schema
const updateProfileSchema = Joi.object({
  name: Joi.string().optional(),
  email: Joi.string().email().optional(),
  profileImage: Joi.string().uri().optional()
});

export const updateProfile = async (req: Request, res: Response): Promise<void> => {
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

    const userId = (req as any).user.id;
    const { name, email, profileImage } = req.body;

    // Get database client (works with SQLite or PostgreSQL)
    const prisma = await getPrisma();

    // Check if email is already taken by another user
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

    // Update user profile
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
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
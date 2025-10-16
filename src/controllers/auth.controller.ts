import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { LoginData, CreateUserData } from '../models/user.model';
import { validate } from '../middleware/validation.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const loginSchema = Joi.object({
  usernameOrEmail: Joi.string().required(),
  password: Joi.string().required()
});

const registerSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER').required(),
  branchId: Joi.string().optional(),
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

    // Find user by username or email
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

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    const token = (jwt.sign as any)(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        createdBy: user.createdBy
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

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

    // For ADMIN and SUPERADMIN users, create user without branch/company initially
    // They will create companies and branches from the dashboard
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
      if (!branchId) {
        res.status(400).json({
          success: false,
          message: 'Branch ID is required for non-admin users'
        });
        return;
      }

      // Check if existing branch exists
      const branch = await prisma.branch.findUnique({
        where: { id: branchId }
      });

      if (!branch) {
        res.status(400).json({
          success: false,
          message: 'Branch not found'
        });
        return;
      }

      // Create user with branch assignment
      user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          name,
          role,
          branchId: branchId,
          companyId: branch.companyId,
          createdBy: null // Will be set by the admin who creates this user
        },
        include: {
          branch: true,
          company: true
        }
      });
    }

    // Generate JWT token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined');
    }

    const token = (jwt.sign as any)(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        branchId: user.branchId,
        createdBy: user.createdBy
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

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
  email: Joi.string().email().optional()
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
    const { name, email } = req.body;

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
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
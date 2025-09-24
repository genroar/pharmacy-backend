import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { CreateUserData, UpdateUserData } from '../models/user.model';
import { AuthRequest } from '../middleware/auth.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createUserSchema = Joi.object({
  username: Joi.string().min(3).max(30).required(),
  email: Joi.string().pattern(/^[^\s@]+@[^\s@]+$/).required().messages({
    'string.pattern.base': 'Email must contain @ symbol'
  }),
  password: Joi.string().min(6).required(),
  name: Joi.string().required(),
  role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER').required(),
  branchId: Joi.string().allow(null, '').optional()
});

const updateUserSchema = Joi.object({
  username: Joi.string().min(3).max(30),
  email: Joi.string().email({ tlds: { allow: false } }),
  password: Joi.string().min(6),
  name: Joi.string(),
  role: Joi.string().valid('SUPERADMIN', 'ADMIN', 'MANAGER', 'CASHIER'),
  branchId: Joi.string(),
  isActive: Joi.boolean()
});

export const getUsers = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      role = '',
      branchId = '',
      isActive = true
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    // Data isolation: Only show users belonging to the same admin
    if (req.user?.role === 'SUPERADMIN') {
      // SuperAdmin can see all users
    } else if (req.user?.createdBy) {
      where.createdBy = req.user.createdBy;
    } else {
      // If no createdBy, show only users created by this user
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

    // Remove password from response
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
  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Build where clause with data isolation
    const where: any = { id };

    // Data isolation: Only allow access to users belonging to the same admin
    if (req.user?.role === 'SUPERADMIN') {
      // SuperAdmin can see all users
    } else if (req.user?.createdBy) {
      where.createdBy = req.user.createdBy;
    } else {
      // If no createdBy, show only users created by this user
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

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createUser = async (req: AuthRequest, res: Response) => {
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

    const userData: CreateUserData = req.body;

    // Check if user already exists
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

    // Check if branch exists (only if branchId is provided and not null/empty)
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

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 12);

    // Get the current user ID and createdBy from the request (set by auth middleware)
    const currentUserId = req.user?.id;
    const currentUserAdminId = req.user?.createdBy;

    // Create user
    const user = await prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
        createdBy: currentUserAdminId || currentUserId, // Set createdBy for data isolation
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

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return res.status(201).json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateUser = async (req: Request, res: Response) => {
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

    const updateData: any = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if username/email already exists (if being updated)
    if (updateData.username || updateData.email) {
      const where: any = { id: { not: id } };

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

    // Hash password if provided
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 12);
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

    // Remove password from response
    const { password, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: userWithoutPassword
    });
  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
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

    // Hard delete - actually remove the user from database
    await prisma.user.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

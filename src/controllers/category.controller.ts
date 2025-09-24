import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createCategorySchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow('')
});

const updateCategorySchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow('')
});

export const getCategories = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50, search = '', branchId = '' } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    // Data isolation based on user role and branch
    if (req.user?.role === 'SUPERADMIN') {
      // SUPERADMIN can see all categories
    } else if (req.user?.role === 'ADMIN') {
      // For ADMIN users, use their createdBy field (which should be their own ID for self-referencing)
      where.createdBy = req.user.createdBy || req.user.id;
    } else if (req.user?.createdBy) {
      // Other users see categories from their admin
      where.createdBy = req.user.createdBy;
    } else if (req.user?.id) {
      // Fallback to user ID if no createdBy
      where.createdBy = req.user.id;
    } else {
      // No access if no user context
      where.createdBy = 'non-existent-admin-id';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [categories, total] = await Promise.all([
      prisma.category.findMany({
        where,
        skip,
        take,
        include: {
          _count: {
            select: {
              products: true
            }
          }
        },
        orderBy: { name: 'asc' }
      }),
      prisma.category.count({ where })
    ]);

    return res.json({
      success: true,
      data: {
        categories,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Build where clause with data isolation
    const where: any = { id };

    // Data isolation based on user role and branch
    if (req.user?.role === 'SUPERADMIN') {
      // SUPERADMIN can see all categories
    } else if (req.user?.role === 'ADMIN') {
      // For ADMIN users, use their createdBy field (which should be their own ID for self-referencing)
      where.createdBy = req.user.createdBy || req.user.id;
    } else if (req.user?.createdBy) {
      // Other users see categories from their admin and branch
      where.createdBy = req.user.createdBy;
      where.branchId = req.user.branchId;
    } else if (req.user?.id) {
      // Fallback to user ID if no createdBy
      where.createdBy = req.user.id;
      where.branchId = req.user.branchId;
    } else {
      // No access if no user context
      where.createdBy = 'non-existent-admin-id';
    }

    const category = await prisma.category.findFirst({
      where,
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    return res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Get category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createCategory = async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== CREATE CATEGORY REQUEST ===');
    console.log('Request body:', req.body);
    console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });

    const { error } = createCategorySchema.validate(req.body);
    if (error) {
      console.log('Validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { name, description } = req.body;

    // Check if category with this name already exists for this admin
    const existingCategory = await prisma.category.findFirst({
      where: {
        name: name,
        createdBy: req.user?.createdBy || req.user?.id
      }
    });

    if (existingCategory) {
      console.log('Category with this name already exists for this admin:', existingCategory);
      return res.status(400).json({
        success: false,
        message: 'Category with this name already exists'
      });
    }

    console.log('Creating category with data:', {
      name,
      description,
      createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
    });

    const category = await prisma.category.create({
      data: {
        name,
        description: description || null,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
      }
    });

    console.log('Category created successfully:', category);

    return res.status(201).json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Create category error:', error);
    console.error('Error details:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateCategory = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateCategorySchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData = req.body;

    // Check if category exists
    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if name already exists for this branch (if being updated)
    if (updateData.name && updateData.name !== existingCategory.name) {
      const nameExists = await prisma.category.findFirst({
        where: {
          name: updateData.name,
          createdBy: req.user?.createdBy || req.user?.id
        }
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Category with this name already exists in this branch'
        });
      }
    }

    const category = await prisma.category.update({
      where: { id },
      data: updateData
    });

    return res.json({
      success: true,
      data: category
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    // Check if category has products
    if (category._count.products > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete category with existing products'
      });
    }

    await prisma.category.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

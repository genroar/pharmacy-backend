import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createManufacturerSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  website: Joi.string().uri().allow(''),
  country: Joi.string().allow('')
});

const updateManufacturerSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow(''),
  website: Joi.string().uri().allow(''),
  country: Joi.string().allow(''),
  isActive: Joi.boolean()
});

export const getManufacturers = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 50, search = '', active = true } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};

    // Data isolation based on user role
    if (req.user?.role === 'SUPERADMIN') {
      // SUPERADMIN can see all manufacturers
    } else if (req.user?.role === 'ADMIN') {
      // For ADMIN users, use their own ID as createdBy (self-referencing)
      where.createdBy = req.user.id;
    } else if (req.user?.createdBy) {
      // Other users see manufacturers from their admin
      where.createdBy = req.user.createdBy;
    } else if (req.user?.id) {
      // Fallback to user ID if no createdBy
      where.createdBy = req.user.id;
    } else {
      // No access if no user context
      where.createdBy = 'non-existent-admin-id';
    }

    if (active === 'true') {
      where.isActive = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { country: { contains: search, mode: 'insensitive' } }
      ];
    }

    const [manufacturers, total] = await Promise.all([
      prisma.manufacturer.findMany({
        where,
        skip,
        take,
        include: {
          _count: {
            select: {
              suppliers: true
            }
          }
        },
        orderBy: { name: 'asc' }
      }),
      prisma.manufacturer.count({ where })
    ]);

    return res.json({
      success: true,
      data: {
        manufacturers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get manufacturers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getManufacturer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Build where clause with data isolation
    const where: any = { id };

    // Data isolation based on user role
    if (req.user?.role === 'SUPERADMIN') {
      // SUPERADMIN can see all manufacturers
    } else if (req.user?.role === 'ADMIN') {
      // For ADMIN users, use their own ID as createdBy (self-referencing)
      where.createdBy = req.user.id;
    } else if (req.user?.createdBy) {
      // Other users see manufacturers from their admin
      where.createdBy = req.user.createdBy;
    } else if (req.user?.id) {
      // Fallback to user ID if no createdBy
      where.createdBy = req.user.id;
    } else {
      // No access if no user context
      where.createdBy = 'non-existent-admin-id';
    }

    const manufacturer = await prisma.manufacturer.findFirst({
      where,
      include: {
        _count: {
          select: {
            suppliers: true
          }
        },
        suppliers: {
          select: {
            id: true,
            name: true,
            contactPerson: true,
            phone: true,
            isActive: true
          }
        }
      }
    });

    if (!manufacturer) {
      return res.status(404).json({
        success: false,
        message: 'Manufacturer not found'
      });
    }

    return res.json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    console.error('Get manufacturer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createManufacturer = async (req: AuthRequest, res: Response) => {
  try {
    const { error } = createManufacturerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { name, description, website, country } = req.body;

    // Check if manufacturer with this name already exists for this admin
    const existingManufacturer = await prisma.manufacturer.findFirst({
      where: {
        name: name,
        createdBy: req.user?.createdBy || req.user?.id
      }
    });

    if (existingManufacturer) {
      return res.status(400).json({
        success: false,
        message: 'Manufacturer with this name already exists'
      });
    }

    const manufacturer = await prisma.manufacturer.create({
      data: {
        name,
        description: description || null,
        website: website || null,
        country: country || null,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
      }
    });

    return res.status(201).json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    console.error('Create manufacturer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateManufacturer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateManufacturerSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData = req.body;

    // Check if manufacturer exists
    const existingManufacturer = await prisma.manufacturer.findFirst({
      where: {
        id,
        createdBy: req.user?.createdBy || req.user?.id
      }
    });

    if (!existingManufacturer) {
      return res.status(404).json({
        success: false,
        message: 'Manufacturer not found'
      });
    }

    // Check if name already exists for this admin (if being updated)
    if (updateData.name && updateData.name !== existingManufacturer.name) {
      const nameExists = await prisma.manufacturer.findFirst({
        where: {
          name: updateData.name,
          createdBy: req.user?.createdBy || req.user?.id
        }
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Manufacturer with this name already exists in this branch'
        });
      }
    }

    const manufacturer = await prisma.manufacturer.update({
      where: { id },
      data: updateData
    });

    return res.json({
      success: true,
      data: manufacturer
    });
  } catch (error) {
    console.error('Update manufacturer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteManufacturer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const manufacturer = await prisma.manufacturer.findFirst({
      where: {
        id,
        createdBy: req.user?.createdBy || req.user?.id
      },
      include: {
        _count: {
          select: {
            suppliers: true
          }
        }
      }
    });

    if (!manufacturer) {
      return res.status(404).json({
        success: false,
        message: 'Manufacturer not found'
      });
    }

    // Check if manufacturer has suppliers
    if (manufacturer._count.suppliers > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete manufacturer with existing suppliers'
      });
    }

    await prisma.manufacturer.delete({
      where: { id }
    });

    return res.json({
      success: true,
      message: 'Manufacturer deleted successfully'
    });
  } catch (error) {
    console.error('Delete manufacturer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

import { Request, Response } from 'express';
import { getPrisma } from '../utils/db.util';
import { AuthRequest } from '../middleware/auth.middleware';
import Joi from 'joi';

// Validation schemas
const createBranchSchema = Joi.object({
  name: Joi.string().required(),
  address: Joi.string().required(),
  phone: Joi.string().required(),
  email: Joi.string().email().required(),
  companyId: Joi.string().required(),
  managerId: Joi.string().allow(null)
});

const updateBranchSchema = Joi.object({
  name: Joi.string(),
  address: Joi.string(),
  phone: Joi.string(),
  email: Joi.string().email(),
  companyId: Joi.string(),
  managerId: Joi.string().allow(null),
  isActive: Joi.boolean()
});

// NOTE: Removed role-based filtering - all users can see all active branches
export const getBranches = async (req: AuthRequest, res: Response) => {
  try {
    const prisma = await getPrisma();
    const { page = 1, limit = 10, search = '' } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {
      isActive: true
    };

    // Apply company context filtering if available
    if (req.user?.selectedCompanyId) {
      where.companyId = req.user.selectedCompanyId;
      console.log('🏢 Filtering branches by selected company:', req.user.selectedCompanyId);
    }

    // No role-based filtering - all users can see all branches

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { address: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } }
      ];
    }

    const [branches, total] = await Promise.all([
      prisma.branch.findMany({
        where,
        skip,
        take,
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              users: true,
              products: true,
              customers: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.branch.count({ where })
    ]);

    return res.json({
      success: true,
      data: {
        branches,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get branches error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getBranch = async (req: Request, res: Response) => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        },
        users: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            isActive: true
          }
        },
        _count: {
          select: {
            users: true,
            products: true,
            customers: true,
            sales: true
          }
        }
      }
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    return res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    console.error('Get branch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createBranch = async (req: AuthRequest, res: Response) => {
  try {
    const prisma = await getPrisma();
    const { error } = createBranchSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { name, address, phone, email, companyId, managerId } = req.body;

    // Verify that the company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId }
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: 'Company not found'
      });
    }

    // NOTE: Removed access check - any user can create branch in any company

    // Check if branch name already exists for this company
    const existingBranch = await prisma.branch.findFirst({
      where: {
        name: name,
        companyId: companyId
      }
    });

    if (existingBranch) {
      return res.status(400).json({
        success: false,
        message: 'Branch with this name already exists in this company'
      });
    }

    const branch = await prisma.branch.create({
      data: {
        name,
        address,
        phone,
        email,
        companyId,
        managerId,
        createdBy: req.user?.id
      },
      include: {
        company: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return res.status(201).json({
      success: true,
      data: branch
    });
  } catch (error) {
    console.error('Create branch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateBranch = async (req: AuthRequest, res: Response) => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;
    const { error } = updateBranchSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData = req.body;

    // Check if branch exists
    const existingBranch = await prisma.branch.findUnique({
      where: { id }
    });

    if (!existingBranch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Check if name already exists for this admin (if being updated)
    if (updateData.name && updateData.name !== existingBranch.name) {
      const nameExists = await prisma.branch.findFirst({
        where: {
          name: updateData.name,
          createdBy: req.user?.createdBy || req.user?.id
        }
      });

      if (nameExists) {
        return res.status(400).json({
          success: false,
          message: 'Branch with this name already exists'
        });
      }
    }

    const branch = await prisma.branch.update({
      where: { id },
      data: updateData
    });

    return res.json({
      success: true,
      data: branch
    });
  } catch (error) {
    console.error('Update branch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteBranch = async (req: Request, res: Response) => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;

    const branch = await prisma.branch.findUnique({
      where: { id }
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Soft delete
    await prisma.branch.update({
      where: { id },
      data: { isActive: false }
    });

    return res.json({
      success: true,
      message: 'Branch deleted successfully'
    });
  } catch (error) {
    console.error('Delete branch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

import { Request, Response } from 'express';
import Joi from 'joi';
import { getPrisma } from '../utils/db.util';

// Validation schemas
const createCompanySchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().max(500).optional(),
  address: Joi.string().max(200).optional(),
  phone: Joi.string().max(20).optional(),
  email: Joi.string().email().optional()
});

const updateCompanySchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().max(500).optional(),
  address: Joi.string().max(200).optional(),
  phone: Joi.string().max(20).optional(),
  email: Joi.string().email().optional(),
  businessType: Joi.string().valid('PHARMACY', 'STORE', 'HOTEL', 'CLINIC').optional()
});

// Get all companies for the authenticated user
export const getCompanies = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    let companies;

    if (userRole === 'SUPERADMIN') {
      // SuperAdmin can see all companies
      companies = await prisma.company.findMany({
        where: { isActive: true },
        include: {
          branches: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              phone: true,
            }
          },
          _count: {
            select: {
              users: true,
              employees: true,
              products: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Regular admin can only see their own companies
      companies = await prisma.company.findMany({
        where: {
          createdBy: userId,
          isActive: true
        },
        include: {
          branches: {
            where: { isActive: true },
            select: {
              id: true,
              name: true,
              phone: true,
            }
          },
          _count: {
            select: {
              users: true,
              employees: true,
              products: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    }

    res.json({
      success: true,
      data: companies
    });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get a single company by ID
export const getCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        branches: {
          where: { isActive: true },
          include: {
            _count: {
              select: {
                users: true,
                employees: true,
                products: true
              }
            }
          }
        },
        _count: {
          select: {
            users: true,
            employees: true,
            products: true
          }
        }
      }
    });

    if (!company) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    // Check if user has access to this company
    if (userRole !== 'SUPERADMIN' && company.createdBy !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    res.json({
      success: true,
      data: company
    });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Create a new company
export const createCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    console.log('🔍 Create company request body:', JSON.stringify(req.body, null, 2));

    // Normalize empty strings to undefined for optional fields
    const normalizedBody = {
      ...req.body,
      description: req.body.description?.trim() || undefined,
      address: req.body.address?.trim() || undefined,
      phone: req.body.phone?.trim() || undefined,
      email: req.body.email?.trim() || undefined,
    };

    const { error } = createCompanySchema.validate(normalizedBody);
    if (error) {
      console.log('❌ Validation error details:', error.details);
      console.log('❌ Validation errors:', error.details.map(detail => detail.message));
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const userId = (req as any).user.id;
    const { name, description, address, phone, email } = normalizedBody;

    // Check if company name already exists
    const existingCompany = await prisma.company.findUnique({
      where: { name }
    });

    if (existingCompany) {
      res.status(400).json({
        success: false,
        message: 'Company with this name already exists'
      });
      return;
    }

    const company = await prisma.company.create({
      data: {
        name,
        description,
        address,
        phone,
        email,
        createdBy: userId
      },
      include: {
        branches: true,
        _count: {
          select: {
            users: true,
            employees: true,
            products: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: company,
      message: 'Company created successfully'
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update a company
export const updateCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const { error } = updateCompanySchema.validate(req.body);
    if (error) {
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const { id } = req.params;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { name, description, address, phone, email, businessType } = req.body;

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id }
    });

    if (!existingCompany) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    // Check if user has access to this company
    if (userRole !== 'SUPERADMIN' && existingCompany.createdBy !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Check if new name conflicts with existing company
    if (name && name !== existingCompany.name) {
      const nameConflict = await prisma.company.findUnique({
        where: { name }
      });

      if (nameConflict) {
        res.status(400).json({
          success: false,
          message: 'Company with this name already exists'
        });
        return;
      }
    }

    const company = await prisma.company.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(address !== undefined && { address }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(businessType !== undefined && { businessType })
      },
      include: {
        branches: {
          where: { isActive: true }
        },
        _count: {
          select: {
            users: true,
            employees: true,
            products: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: company,
      message: 'Company updated successfully'
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Delete a company (soft delete)
export const deleteCompany = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            branches: true,
            users: true,
            employees: true,
            products: true
          }
        }
      }
    });

    if (!existingCompany) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    // Check if user has access to this company
    if (userRole !== 'SUPERADMIN' && existingCompany.createdBy !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Check if company has associated data
    const hasData = existingCompany._count.branches > 0 ||
                   existingCompany._count.users > 0 ||
                   existingCompany._count.employees > 0 ||
                   existingCompany._count.products > 0;

    if (hasData) {
      res.status(400).json({
        success: false,
        message: 'Cannot delete company with associated branches, users, employees, or products'
      });
      return;
    }

    // Soft delete the company
    await prisma.company.update({
      where: { id },
      data: { isActive: false }
    });

    res.json({
      success: true,
      message: 'Company deleted successfully'
    });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update company business type
export const updateCompanyBusinessType = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;
    const { businessType } = req.body;

    // Validate business type
    if (!businessType || !['PHARMACY', 'STORE', 'HOTEL', 'CLINIC'].includes(businessType)) {
      res.status(400).json({
        success: false,
        message: 'Invalid business type. Must be one of: PHARMACY, STORE, HOTEL, CLINIC'
      });
      return;
    }

    // Check if company exists
    const existingCompany = await prisma.company.findUnique({
      where: { id }
    });

    if (!existingCompany) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    // Check if user has access to this company
    if (userRole !== 'SUPERADMIN' && existingCompany.createdBy !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    const company = await prisma.company.update({
      where: { id },
      data: { businessType },
      include: {
        branches: {
          where: { isActive: true }
        },
        _count: {
          select: {
            users: true,
            employees: true,
            products: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: company,
      message: 'Business type updated successfully'
    });
  } catch (error) {
    console.error('Update company business type error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get company statistics
export const getCompanyStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const prisma = await getPrisma();
    const { id } = req.params;
    const userId = (req as any).user.id;
    const userRole = (req as any).user.role;

    // Check if company exists and user has access
    const company = await prisma.company.findUnique({
      where: { id }
    });

    if (!company) {
      res.status(404).json({
        success: false,
        message: 'Company not found'
      });
      return;
    }

    if (userRole !== 'SUPERADMIN' && company.createdBy !== userId) {
      res.status(403).json({
        success: false,
        message: 'Access denied'
      });
      return;
    }

    // Get statistics
    const stats = await prisma.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            branches: true,
            users: true,
            employees: true,
            products: true,
            customers: true,
            sales: true
          }
        }
      }
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get company stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

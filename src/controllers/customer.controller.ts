


import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateCustomerData, UpdateCustomerData } from '../models/customer.model';
import { AuthRequest } from '../middleware/auth.middleware';
import { notifyCustomerChange } from '../routes/sse.routes';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createCustomerSchema = Joi.object({
  name: Joi.string().required(),
  phone: Joi.string().required(),
  email: Joi.string().email().allow('').optional(),
  address: Joi.string().allow('').optional(),
  branchId: Joi.string().required()
});

const updateCustomerSchema = Joi.object({
  name: Joi.string(),
  phone: Joi.string(),
  email: Joi.string().email().allow(''),
  address: Joi.string().allow(''),
  isVIP: Joi.boolean(),
  isActive: Joi.boolean()
});

export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      branchId = '',
      vip = false
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = {
      isActive: true
    };

    // Data isolation - only show customers for the current admin
    if (req.user?.createdBy) {
      where.createdBy = req.user.createdBy;
    } else if (req.user?.id) {
      where.createdBy = req.user.id;
    }

    // Only filter by branchId if it's provided and not empty
    if (branchId && typeof branchId === 'string' && branchId.trim() !== '') {
      where.branchId = branchId;
    }

    if (vip === 'true') {
      where.isVIP = true;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    console.log('Customer query where clause:', where);
    console.log('Customer query pagination:', { skip, take });

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip,
        take,
        include: {
          branch: {
            select: {
              id: true,
              name: true
            }
          },
          sales: {
            select: {
              id: true,
              totalAmount: true,
              createdAt: true
            },
            orderBy: { createdAt: 'desc' },
            take: 5
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customer.count({ where })
    ]);

    console.log('Found customers:', customers.length);
    console.log('Total customers in database:', total);
    console.log('Customer details:', customers.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      branchId: c.branchId,
      isActive: c.isActive,
      totalPurchases: c.totalPurchases,
      loyaltyPoints: c.loyaltyPoints
    })));

    return res.json({
      success: true,
      data: {
        customers,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get customers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        sales: {
          include: {
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    unitType: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    return res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Get customer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createCustomer = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Customer creation request body:', req.body);
    const { error } = createCustomerSchema.validate(req.body);
    if (error) {
      console.log('Customer validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const customerData: CreateCustomerData = req.body;

    // Check if phone already exists for this admin
    const existingCustomer = await prisma.customer.findFirst({
      where: {
        phone: customerData.phone,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
      }
    });

    console.log('Existing customer check:', existingCustomer);

    if (existingCustomer) {
      // Return existing customer instead of failing
      console.log('Customer already exists, returning existing customer:', existingCustomer);
      return res.status(200).json({
        success: true,
        data: existingCustomer,
        message: 'Customer already exists'
      });
    }

    const customer = await prisma.customer.create({
      data: {
        ...customerData,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
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

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifyCustomerChange(createdBy, 'created', customer);
    }

    return res.status(201).json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Create customer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateCustomer = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateCustomerSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData: UpdateCustomerData = req.body;

    // Check if customer exists
    const existingCustomer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!existingCustomer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if phone already exists for this admin (if being updated)
    if (updateData.phone && updateData.phone !== existingCustomer.phone) {
      const phoneExists = await prisma.customer.findFirst({
        where: {
          phone: updateData.phone,
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
        }
      });

      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: 'Customer with this phone number already exists'
        });
      }
    }

    const customer = await prisma.customer.update({
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

    return res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Update customer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteCustomer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Soft delete
    await prisma.customer.update({
      where: { id },
      data: { isActive: false }
    });

    return res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Delete customer error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getCustomerPurchaseHistory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Check if customer exists
    const customer = await prisma.customer.findUnique({
      where: { id },
      select: { id: true, name: true, phone: true }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Get customer's sales history
    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where: { customerId: id },
        skip,
        take,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  unitType: true
                }
              }
            }
          },
          user: {
            select: {
              name: true,
              username: true
            }
          },
          branch: {
            select: {
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.sale.count({ where: { customerId: id } })
    ]);

    // Calculate customer stats
    const customerStats = await prisma.sale.aggregate({
      where: { customerId: id },
      _sum: {
        totalAmount: true,
        subtotal: true,
        taxAmount: true
      },
      _count: {
        id: true
      }
    });

    return res.json({
      success: true,
      data: {
        customer,
        sales,
        stats: {
          totalPurchases: customerStats._count.id,
          totalSpent: customerStats._sum.totalAmount || 0,
          averageOrder: customerStats._count.id > 0 ? (customerStats._sum.totalAmount || 0) / customerStats._count.id : 0
        },
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get customer purchase history error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
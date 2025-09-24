import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, buildAdminWhereClause, buildBranchWhereClause } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

/**
 * Example: Get Sales with Data Isolation
 * This shows how to implement data isolation in any controller
 */
export const getSales = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate = '',
      endDate = '',
      branchId = ''
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Add date filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const endDateWithTime = new Date(endDate as string);
        endDateWithTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateWithTime;
      }
    }

    // Add branch filtering if specified
    if (branchId) {
      where.branchId = branchId;
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          customer: true,
          user: true,
          branch: true,
          items: {
            include: {
              product: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.sale.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        sales,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get sales error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Example: Create Sale with Data Isolation
 * This shows how to create records with proper createdBy
 */
export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    const saleData = req.body;

    // Create sale with createdBy for data isolation
    const sale = await prisma.sale.create({
      data: {
        ...saleData,
        createdBy: req.user?.createdBy || req.user?.id, // Use createdBy for data isolation
        userId: req.user?.id || saleData.userId
      },
      include: {
        customer: true,
        user: true,
        branch: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    res.status(201).json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Create sale error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Example: Get Customers with Data Isolation
 * This shows how to filter customers by admin
 */
export const getCustomers = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      branchId = ''
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Add search filtering
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { phone: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } }
      ];
    }

    // Add branch filtering if specified
    if (branchId) {
      where.branchId = branchId;
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: {
          branch: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.customer.count({ where })
    ]);

    res.json({
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
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

/**
 * Example: Get Reports with Data Isolation
 * This shows how to generate reports scoped to admin's data
 */
export const getSalesReport = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, branchId } = req.query;

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Add date filtering
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        const endDateWithTime = new Date(endDate as string);
        endDateWithTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateWithTime;
      }
    }

    // Add branch filtering if specified
    if (branchId) {
      where.branchId = branchId;
    }

    // Get sales data
    const sales = await prisma.sale.findMany({
      where,
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    // Calculate totals
    const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
    const totalTransactions = sales.length;
    const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;

    res.json({
      success: true,
      data: {
        totalSales,
        totalTransactions,
        averageSale,
        sales
      }
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

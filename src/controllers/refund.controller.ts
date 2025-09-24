import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest, buildBranchWhereClause, buildBranchWhereClauseForRelation } from '../middleware/auth.middleware';
import { notifyRefundChange } from '../routes/sse.routes';
import Joi from 'joi';

const prisma = new PrismaClient();

// Utility function to convert BigInt and Decimal values to strings for JSON serialization
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  // Handle Prisma Decimal values
  if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Decimal') {
    return obj.toString();
  }

  // Handle Prisma Decimal values (alternative check)
  if (obj && typeof obj === 'object' && obj.toString && typeof obj.toString === 'function' && obj.constructor && obj.constructor.name === 'i') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(serializeBigInt);
  }

  if (typeof obj === 'object') {
    const serialized: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        serialized[key] = serializeBigInt(obj[key]);
      }
    }
    return serialized;
  }

  return obj;
}

interface RefundItem {
  productId: string;
  quantity: number;
  unitPrice: number;
  reason: string;
}

interface CreateRefundData {
  originalSaleId: string;
  refundReason: string;
  items: RefundItem[];
  refundedBy: string;
}

const createRefundSchema = Joi.object({
  originalSaleId: Joi.string().required(),
  refundReason: Joi.string().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      quantity: Joi.number().positive().required(),
      unitPrice: Joi.number().positive().required(),
      reason: Joi.string().required()
    })
  ).min(1).required(),
  refundedBy: Joi.string().required()
});

export const createRefund = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('🔍 DEBUG - Refund request received:', JSON.stringify(req.body, null, 2));

    const { error } = createRefundSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details);
      res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
      return;
    }

    const { originalSaleId, refundReason, items, refundedBy }: CreateRefundData = req.body;
    console.log('🔍 DEBUG - Processing refund for sale:', originalSaleId);

    // Verify the original sale exists
    const originalSale = await prisma.sale.findUnique({
      where: { id: originalSaleId },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    if (!originalSale) {
      res.status(404).json({
        success: false,
        message: 'Original sale not found'
      });
      return;
    }

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      console.log('🔍 DEBUG - Starting refund transaction');

      // Create refund record
      const refund = await tx.refund.create({
        data: {
          originalSaleId,
          refundReason,
          refundedBy,
          refundAmount: items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0),
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
          status: 'PROCESSED'
        }
      });

      console.log('🔍 DEBUG - Refund created with ID:', refund.id);

      // Process each refunded item
      const refundItems = [];
      for (const item of items) {
        console.log('🔍 DEBUG - Processing refund item:', item);

        // Verify the product exists
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          console.log('❌ Product not found:', item.productId);
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        console.log('🔍 DEBUG - Found product:', product.name, 'Current stock:', product.stock);

        // Create refund item record
        const refundItem = await tx.refundItem.create({
          data: {
            refundId: refund.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            reason: item.reason,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
          }
        });

        // Update product stock (add back to inventory)
        const updatedProduct = await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              increment: item.quantity
            }
          }
        });

        console.log('🔍 DEBUG - Stock updated for', product.name, 'from', product.stock, 'to', updatedProduct.stock);

        // Create stock movement record for the return
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'RETURN',
            quantity: item.quantity,
            reason: `Refund: ${item.reason}`,
            reference: `REF-${refund.id}`,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
          }
        });

        refundItems.push(refundItem);
      }

      // Update original sale status to REFUNDED
      await tx.sale.update({
        where: { id: originalSaleId },
        data: { status: 'REFUNDED' }
      });

      return { refund, refundItems };
    });

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifyRefundChange(createdBy, 'created', result.refund);
    }

    res.status(201).json({
      success: true,
      data: {
        refund: result.refund,
        items: result.refundItems
      },
      message: 'Refund processed successfully'
    });

  } catch (error) {
    console.error('Create refund error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getRefunds = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      startDate = '',
      endDate = '',
      branchId = ''
    } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause with data isolation (using relation version since Refund doesn't have branchId directly)
    const whereClause: any = buildBranchWhereClauseForRelation(req, {});

    // Search filter
    if (search) {
      whereClause.OR = [
        { refundReason: { contains: search as string, mode: 'insensitive' } },
        { originalSale: {
          receipts: {
            some: {
              receiptNumber: { contains: search as string, mode: 'insensitive' }
            }
          }
        } }
      ];
    }

    // Date range filter
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        // Add 23:59:59 to end date to include the entire day
        const endDateWithTime = new Date(endDate as string);
        endDateWithTime.setHours(23, 59, 59, 999);
        whereClause.createdAt.lte = endDateWithTime;
      }
    }

    // Branch filter - only apply if not already filtered by buildBranchWhereClause
    if (branchId && req.user?.role !== 'MANAGER') {
      whereClause.originalSale = {
        ...whereClause.originalSale,
        branchId: branchId as string
      };
    } else if (req.user?.role === 'MANAGER' && req.user?.branchId) {
      // For managers, ensure we only get refunds for sales from their branch
      whereClause.originalSale = {
        ...whereClause.originalSale,
        branchId: req.user.branchId
      };
    }

    // Remove branchId from the main where clause since Refund model doesn't have it directly
    delete whereClause.branchId;

    const [refunds, total] = await Promise.all([
      prisma.refund.findMany({
        where: whereClause,
        include: {
          originalSale: {
            include: {
              customer: true,
              user: true,
              receipts: true
            }
          },
          items: {
            include: {
              product: true
            }
          },
          refundedByUser: {
            select: {
              id: true,
              name: true,
              username: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      }),
      prisma.refund.count({ where: whereClause })
    ]);

    const serializedRefunds = serializeBigInt(refunds);
    console.log('🔍 Serialized refunds:', JSON.stringify(serializedRefunds[0], null, 2));

    res.json({
      success: true,
      data: {
        refunds: serializedRefunds,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get refunds error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getRefundById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const refund = await prisma.refund.findUnique({
      where: { id },
      include: {
        originalSale: {
          include: {
            customer: true,
            user: true,
            receipts: true,
            items: {
              include: {
                product: true
              }
            }
          }
        },
        items: {
          include: {
            product: true
          }
        },
        refundedByUser: {
          select: {
            id: true,
            name: true,
            username: true
          }
        }
      }
    });

    if (!refund) {
      res.status(404).json({
        success: false,
        message: 'Refund not found'
      });
      return;
    }

    res.json({
      success: true,
      data: serializeBigInt(refund)
    });

  } catch (error) {
    console.error('Get refund by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

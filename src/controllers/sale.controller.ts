


import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateSaleData, SaleResponse } from '../models/sale.model';
import { AuthRequest, buildBranchWhereClause } from '../middleware/auth.middleware';
import { notifySaleChange } from '../routes/sse.routes';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createSaleSchema = Joi.object({
  customerId: Joi.string().allow(null),
  branchId: Joi.string().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      quantity: Joi.number().min(1).required(),
      unitPrice: Joi.number().positive().required(),
      batchNumber: Joi.string().allow(''),
      expiryDate: Joi.string().allow('')
    })
  ).min(1).required(),
  paymentMethod: Joi.string().valid('CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER').required(),
  discountAmount: Joi.number().min(0).default(0)
});

export const getSales = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      startDate = '',
      endDate = '',
      branchId = '',
      customerId = '',
      paymentMethod = ''
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Additional branch filter only if not already filtered by buildBranchWhereClause
    if (branchId && req.user?.role !== 'MANAGER') {
      where.branchId = branchId;
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (paymentMethod) {
      where.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate as string);
      }
      if (endDate) {
        // Add 23:59:59 to end date to include the entire day
        const endDateWithTime = new Date(endDate as string);
        endDateWithTime.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDateWithTime;
      }
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        skip,
        take,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              address: true,
              totalPurchases: true,
              loyaltyPoints: true,
              isVIP: true,
              lastVisit: true
            }
          },
          user: {
            select: {
              id: true,
              name: true,
              username: true
            }
          },
          branch: {
            select: {
              id: true,
              name: true
            }
          },
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
          receipts: {
            select: {
              receiptNumber: true,
              printedAt: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
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

export const getSale = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const sale = await prisma.sale.findUnique({
      where: { id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true
          }
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitType: true,
                barcode: true
              }
            }
          }
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            printedAt: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: 'Sale not found'
      });
    }

    return res.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getSaleByReceiptNumber = async (req: Request, res: Response) => {
  try {
    const { receiptNumber } = req.params;

    console.log('Looking up receipt number:', receiptNumber);

    // First, let's see what receipt numbers exist in the database
    const allReceipts = await prisma.receipt.findMany({
      select: {
        receiptNumber: true,
        saleId: true
      },
      take: 10
    });
    console.log('Available receipt numbers in database:', allReceipts);

    const sale = await prisma.sale.findFirst({
      where: {
        receipts: {
          some: {
            receiptNumber: receiptNumber
          }
        }
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true
          }
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitType: true,
                barcode: true
              }
            }
          }
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            printedAt: true
          }
        }
      }
    });

    if (!sale) {
      return res.status(404).json({
        success: false,
        message: `Sale not found for receipt number: ${receiptNumber}. Available receipts: ${allReceipts.map(r => r.receiptNumber).join(', ')}`
      });
    }

    return res.json({
      success: true,
      data: sale
    });
  } catch (error) {
    console.error('Get sale by receipt number error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getAvailableReceiptNumbers = async (req: Request, res: Response) => {
  try {
    const receipts = await prisma.receipt.findMany({
      select: {
        id: true,
        receiptNumber: true,
        saleId: true,
        printedAt: true
      },
      orderBy: {
        printedAt: 'desc'
      },
      take: 50
    });

    return res.json({
      success: true,
      data: { receipts }
    });
  } catch (error) {
    console.error('Get available receipt numbers error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createSale = async (req: AuthRequest, res: Response) => {
  try {
    console.log('Sale creation request body:', req.body);
    const { error } = createSaleSchema.validate(req.body);
    if (error) {
      console.log('Sale validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const saleData: CreateSaleData = req.body;
    const userId = (req as any).user.id;

    // Get tax rate from settings
    const currentAdminId = req.user?.createdBy || req.user?.id;
    let taxRate = 17; // Default tax rate

    if (currentAdminId) {
      try {
        const taxSetting = await prisma.settings.findUnique({
          where: {
            createdBy_key: {
              createdBy: currentAdminId,
              key: 'defaultTax'
            }
          }
        });

        if (taxSetting) {
          taxRate = parseFloat(taxSetting.value);
        }
      } catch (error) {
        console.warn('Could not fetch tax rate from settings, using default:', error);
      }
    }

    // Calculate totals
    const subtotal = saleData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const taxAmount = subtotal * (taxRate / 100); // Dynamic tax rate
    const totalAmount = subtotal + taxAmount - (saleData.discountAmount || 0);

    // Use transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Create sale
      const sale = await tx.sale.create({
        data: {
          customerId: saleData.customerId,
          userId: userId,
          branchId: saleData.branchId,
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
          subtotal,
          taxAmount,
          discountAmount: saleData.discountAmount || 0,
          totalAmount,
          paymentMethod: saleData.paymentMethod,
          paymentStatus: 'COMPLETED',
          status: 'COMPLETED'
        }
      });

      // Create sale items and update stock
      const saleItems = [];
      for (const item of saleData.items) {
        // Check product availability
        console.log(`Looking for product with ID: ${item.productId}`);
        const product = await tx.product.findUnique({
          where: { id: item.productId }
        });

        if (!product) {
          // Get all products to see what IDs exist
          const allProducts = await tx.product.findMany({
            select: { id: true, name: true }
          });
          console.log('Available products:', allProducts);
          throw new Error(`Product with ID ${item.productId} not found`);
        }

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${item.quantity}`);
        }

        // Create sale item
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: sale.id,
            productId: item.productId,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
          }
        });

        saleItems.push(saleItem);

        // Update product stock
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: {
              decrement: item.quantity
            }
          }
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            reason: 'Sale',
            reference: sale.id,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
          }
        });
      }

      // Update customer stats if customer exists
      if (saleData.customerId) {
        await tx.customer.update({
          where: { id: saleData.customerId },
          data: {
            totalPurchases: {
              increment: totalAmount
            },
            loyaltyPoints: {
              increment: Math.floor(totalAmount / 100) // 1 point per 100 PKR
            },
            lastVisit: new Date()
          }
        });
      }

      // Generate receipt number
      const receiptNumber = `RCP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;

      // Create receipt
      const receipt = await tx.receipt.create({
        data: {
          saleId: sale.id,
          userId: userId,
          branchId: saleData.branchId,
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
          receiptNumber
        }
      });

      return { sale, saleItems, receipt };
    });

    // Fetch complete sale data with relations
    const completeSale = await prisma.sale.findUnique({
      where: { id: result.sale.id },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            address: true,
            totalPurchases: true,
            loyaltyPoints: true,
            isVIP: true,
            lastVisit: true
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            username: true
          }
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true
          }
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unitType: true,
                barcode: true
              }
            }
          }
        },
        receipts: {
          select: {
            id: true,
            receiptNumber: true,
            printedAt: true
          }
        }
      }
    });

    if (!completeSale) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch complete sale data'
      });
    }

    console.log('Complete sale data:', completeSale);
    console.log('Customer in sale:', completeSale.customer);

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifySaleChange(createdBy, 'created', completeSale);
    }

    return res.status(201).json({
      success: true,
      data: {
        ...completeSale,
        receiptNumber: result.receipt.receiptNumber
      }
    });
  } catch (error) {
    console.error('Create sale error:', error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Internal server error'
    });
  }
};
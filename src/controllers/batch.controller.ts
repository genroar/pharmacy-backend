import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Joi from 'joi';

const prisma = new PrismaClient();

// Validation schemas
const createBatchSchema = Joi.object({
  batchNo: Joi.string().required().messages({
    'string.empty': 'Batch number is required',
    'any.required': 'Batch number is required'
  }),
  productId: Joi.string().required().messages({
    'string.empty': 'Product selection is required',
    'any.required': 'Product selection is required'
  }),
  supplierId: Joi.string().required().messages({
    'string.empty': 'Supplier selection is required',
    'any.required': 'Supplier selection is required'
  }),
  supplierName: Joi.string().optional(),
  expireDate: Joi.date().required().messages({
    'date.base': 'Expiry date is required',
    'any.required': 'Expiry date is required'
  }),
  productionDate: Joi.date().required().messages({
    'date.base': 'Production date is required',
    'any.required': 'Production date is required'
  }),
  shelfId: Joi.string().required().messages({
    'string.empty': 'Shelf selection is required',
    'any.required': 'Shelf selection is required'
  }),
  shelfName: Joi.string().required().messages({
    'string.empty': 'Shelf name is required',
    'any.required': 'Shelf name is required'
  }),
  // Pricing and stock fields (mapped to existing database fields)
  purchasePrice: Joi.number().positive().required().messages({
    'number.positive': 'Purchase price must be positive',
    'any.required': 'Purchase price is required'
  }),
  sellingPrice: Joi.number().positive().required().messages({
    'number.positive': 'Selling price must be positive',
    'any.required': 'Selling price is required'
  }),
  quantity: Joi.number().positive().required().messages({
    'number.positive': 'Quantity must be positive',
    'any.required': 'Quantity is required'
  }),
  totalBoxes: Joi.number().min(0).required().messages({
    'number.min': 'Total boxes must be 0 or greater',
    'any.required': 'Total boxes is required'
  }),
  unitsPerBox: Joi.number().positive().required().messages({
    'number.positive': 'Units per box must be positive',
    'any.required': 'Units per box is required'
  })
});

const updateBatchSchema = Joi.object({
  batchNo: Joi.string().optional(),
  productId: Joi.string().optional(), // Allow productId for updates
  supplierId: Joi.string().optional(),
  supplierName: Joi.string().optional().allow(null), // Allow null values
  expireDate: Joi.date().optional(),
  productionDate: Joi.date().required().messages({
    'date.base': 'Production date is required',
    'any.required': 'Production date is required'
  }),
  shelfId: Joi.string().required().messages({
    'string.empty': 'Shelf selection is required',
    'any.required': 'Shelf selection is required'
  }),
  shelfName: Joi.string().required().messages({
    'string.empty': 'Shelf name is required',
    'any.required': 'Shelf name is required'
  }),
  isActive: Joi.boolean().optional(),
  isReported: Joi.boolean().optional(),
  // Pricing and stock fields (mapped to existing database fields)
  purchasePrice: Joi.number().positive().optional(),
  sellingPrice: Joi.number().positive().optional(),
  quantity: Joi.number().positive().optional(),
  totalBoxes: Joi.number().min(0).required().messages({
    'number.min': 'Total boxes must be 0 or greater',
    'any.required': 'Total boxes is required'
  }),
  unitsPerBox: Joi.number().positive().required().messages({
    'number.positive': 'Units per box must be positive',
    'any.required': 'Units per box is required'
  })
});

// Get all batches
export const getBatches = async (req: any, res: Response) => {
  try {
    console.log('🔍 Get batches request:', req.query);
    console.log('🔍 User context:', { userId: req.user?.id, role: req.user?.role, branchId: req.user?.branchId });
    const { page = 1, limit = 50, search = '', isActive, isReported, productId } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Determine the branch and company context based on user role
    let targetBranchId = req.user?.selectedBranchId || req.user?.branchId;
    let targetCompanyId = req.user?.selectedCompanyId || req.user?.companyId;

    // For non-superadmin users, ensure they only see their branch data
    if (req.user?.role !== 'SUPERADMIN') {
      // Use the user's assigned branch if no specific branch is selected
      if (!targetBranchId) {
        targetBranchId = req.user?.branchId;
      }

      // Use the user's assigned company if no specific company is selected
      if (!targetCompanyId) {
        targetCompanyId = req.user?.companyId;
      }
    }

    const where: any = {};

    // Apply branch and company filters
    if (targetBranchId) {
      where.branchId = targetBranchId;
    }
    if (targetCompanyId) {
      where.companyId = targetCompanyId;
    }

    // Temporarily remove user filtering to show all batches for the branch
    // TODO: Re-implement proper user filtering later
    // if (req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER' || req.user?.role === 'CASHIER') {
    //   if (req.user?.createdBy) {
    //     where.OR = [
    //       { createdBy: req.user.id },
    //       { createdBy: req.user.createdBy }
    //     ];
    //   } else {
    //     where.createdBy = req.user.id;
    //   }
    // }

    if (search) {
      where.OR = [
        { batchNo: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } },
        { supplierInvoiceNo: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    if (isReported !== undefined) {
      where.isReported = isReported === 'true';
    }

    if (productId) {
      where.productId = productId;
    }

    console.log('🔍 Query where clause:', where);

    const [batches, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
          supplier: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit as string),
      }),
      prisma.batch.count({ where }),
    ]);

    console.log('🔍 Found batches:', batches.length);
    console.log('🔍 Total batches:', total);
    if (batches.length > 0) {
      console.log('🔍 First batch details:', {
        id: batches[0].id,
        batchNo: batches[0].batchNo,
        branchId: batches[0].branchId,
        createdBy: batches[0].createdBy
      });
    }

    res.json({
      success: true,
      data: {
        batches,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      },
    });
  } catch (error) {
    console.error('Get batches error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get batch by ID
export const getBatchById = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
            phone: true,
          },
        },
      },
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    return res.json({
      success: true,
      data: batch,
    });
  } catch (error) {
    console.error('Get batch by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Create new batch
export const createBatch = async (req: any, res: Response) => {
  try {
    console.log('🔍 Create batch request body:', req.body);
    const { error, value } = createBatchSchema.validate(req.body);
    if (error) {
      console.log('❌ Validation error:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message),
      });
    }

    const batchData = value;
    let branchId: string | undefined = req.user?.selectedBranchId || req.user?.branchId;
    let companyId: string | undefined = req.user?.selectedCompanyId || req.user?.companyId;

    // If user doesn't have branch/company context, get it from their admin
    if (!branchId || !companyId) {
      if (req.user?.createdBy) {
        const adminUser = await prisma.user.findUnique({
          where: { id: req.user.createdBy },
          select: { branchId: true, companyId: true }
        });

        if (adminUser) {
          branchId = branchId || adminUser.branchId || undefined;
          companyId = companyId || adminUser.companyId || undefined;
        }
      }
    }

    // If still no branch/company, try to get from the product
    if (!branchId || !companyId) {
      const product = await prisma.product.findUnique({
        where: { id: batchData.productId },
        select: { branchId: true, companyId: true }
      });

      if (product) {
        branchId = branchId || product.branchId;
        companyId = companyId || product.companyId;
      }
    }

    if (!branchId || !companyId) {
      return res.status(400).json({
        success: false,
        message: 'Branch and company context required. Please ensure you have proper access permissions.',
      });
    }

    // Check if batch number already exists for this product and branch
    const existingBatch = await prisma.batch.findFirst({
      where: {
        batchNo: batchData.batchNo,
        productId: batchData.productId,
        branchId,
      },
    });

    if (existingBatch) {
      return res.status(400).json({
        success: false,
        message: 'Batch number already exists for this product',
      });
    }

    // Verify product exists
    const product = await prisma.product.findUnique({
      where: { id: batchData.productId },
    });

    if (!product) {
      return res.status(400).json({
        success: false,
        message: 'Product not found',
      });
    }

    // Map frontend field names to database field names
    const mappedData = {
      ...batchData,
      // Use pricing fields directly from validation
      purchasePrice: batchData.purchasePrice,
      sellingPrice: batchData.sellingPrice,
      totalBoxes: batchData.totalBoxes || 0,
      unitsPerBox: batchData.unitsPerBox || 1,
      quantity: batchData.quantity,
      branchId,
      companyId,
      createdBy: req.user?.id,
    };

    console.log('🔍 Mapped data for database:', mappedData);

    const batch = await prisma.batch.create({
      data: mappedData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.status(201).json({
      success: true,
      data: batch,
      message: 'Batch created successfully',
    });
  } catch (error: any) {
    console.error('❌ Create batch error:', error);
    console.error('❌ Error details:', {
      message: error?.message || 'Unknown error',
      stack: error?.stack || 'No stack trace',
      name: error?.name || 'Unknown error type'
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update batch
export const updateBatch = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    console.log('🔍 Update batch request body:', req.body);
    const { error, value } = updateBatchSchema.validate(req.body);
    if (error) {
      console.log('🔍 Validation error details:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message),
      });
    }

    const batchData = value;

    // Check if batch exists
    const existingBatch = await prisma.batch.findUnique({
      where: { id },
    });

    if (!existingBatch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    // If updating batch number, check for duplicates
    if (batchData.batchNo && batchData.batchNo !== existingBatch.batchNo) {
      const duplicateBatch = await prisma.batch.findFirst({
        where: {
          batchNo: batchData.batchNo,
          productId: existingBatch.productId,
          branchId: existingBatch.branchId,
          id: { not: id },
        },
      });

      if (duplicateBatch) {
        return res.status(400).json({
          success: false,
          message: 'Batch number already exists for this product',
        });
      }
    }

    // Map frontend field names to database field names
    const mappedData = {
      ...batchData,
      // Only update fields that are provided, don't override with defaults
    };

    const batch = await prisma.batch.update({
      where: { id },
      data: mappedData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      success: true,
      data: batch,
      message: 'Batch updated successfully',
    });
  } catch (error) {
    console.error('Update batch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Restock batch
export const restockBatch = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { quantity, notes } = req.body;

    // Validate input
    if (!quantity || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid quantity is required',
      });
    }

    // Check if batch exists
    const existingBatch = await prisma.batch.findUnique({
      where: { id },
    });

    if (!existingBatch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    // Update the batch stock quantity
    const updatedBatch = await prisma.batch.update({
      where: { id },
      data: {
        quantity: (existingBatch.quantity || 0) + quantity,
        updatedAt: new Date(),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Log the restock activity (optional - you can add to an activity log table)
    console.log(`Batch ${existingBatch.batchNo} restocked with ${quantity} units. Notes: ${notes || 'No notes'}`);

    return res.json({
      success: true,
      data: {
        id: updatedBatch.id,
        batchNo: updatedBatch.batchNo,
        stockQuantity: updatedBatch.quantity,
        updatedAt: updatedBatch.updatedAt,
      },
      message: `Successfully added ${quantity} units to batch ${existingBatch.batchNo}`,
    });
  } catch (error) {
    console.error('Restock batch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete batch
export const deleteBatch = async (req: any, res: Response) => {
  try {
    const { id } = req.params;

    const batch = await prisma.batch.findUnique({
      where: { id },
    });

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found',
      });
    }

    await prisma.batch.delete({
      where: { id },
    });

    return res.json({
      success: true,
      message: 'Batch deleted successfully',
    });
  } catch (error) {
    console.error('Delete batch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get near expiry batches
export const getNearExpiryBatches = async (req: any, res: Response) => {
  try {
    const { days = 30 } = req.query;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(days as string));
    expiryDate.setHours(23, 59, 59, 999); // End of the target day

    let whereClause: any = {
      isActive: true,
    };

    // Determine the branch and company context based on user role
    let targetBranchId = req.user?.selectedBranchId || req.user?.branchId;
    let targetCompanyId = req.user?.selectedCompanyId || req.user?.companyId;

    // For non-superadmin users, ensure they only see their branch data
    if (req.user?.role !== 'SUPERADMIN') {
      // Use the user's assigned branch if no specific branch is selected
      if (!targetBranchId) {
        targetBranchId = req.user?.branchId;
      }

      // Use the user's assigned company if no specific company is selected
      if (!targetCompanyId) {
        targetCompanyId = req.user?.companyId;
      }
    }

    // Apply branch and company filters
    if (targetBranchId) {
      whereClause.branchId = targetBranchId;
    }
    if (targetCompanyId) {
      whereClause.companyId = targetCompanyId;
    }

    // Add data isolation based on user role
    if (req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER' || req.user?.role === 'CASHIER') {
      // For non-superadmin users, filter by their admin's data
      if (req.user?.createdBy) {
        whereClause.createdBy = req.user.createdBy;
      }
    }

    if (parseInt(days as string) === 0) {
      // For expired batches (days = 0), get batches that expired before today
      whereClause.expireDate = {
        lt: today,
      };
    } else {
      // For near expiry batches, get batches expiring between today and the target date
      whereClause.expireDate = {
        lte: expiryDate,
        gte: today,
      };
    }

    const batches = await prisma.batch.findMany({
      where: whereClause,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
          },
        },
      },
      orderBy: { expireDate: 'asc' },
    });

    return res.json({
      success: true,
      data: batches,
    });
  } catch (error) {
    console.error('Get near expiry batches error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

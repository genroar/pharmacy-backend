


import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { CreateProductData, UpdateProductData, StockMovementData } from '../models/product.model';
import { validate } from '../middleware/validation.middleware';
import { AuthRequest, buildAdminWhereClause, buildBranchWhereClause } from '../middleware/auth.middleware';
import { notifyProductChange, notifyInventoryChange } from '../routes/sse.routes';
import Joi from 'joi';

const prisma = new PrismaClient();

// Utility function to convert BigInt values to strings for JSON serialization
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'bigint') {
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

// Validation schemas
const createProductSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  sku: Joi.string().allow(''),
  categoryId: Joi.string().required(),
  categoryName: Joi.string().allow(''), // For bulk import - category name when categoryId doesn't exist
  supplierId: Joi.string().required(),
  branchId: Joi.string().required(),
  costPrice: Joi.number().positive().required(),
  sellingPrice: Joi.number().positive().required(),
  stock: Joi.number().min(0).required(),
  minStock: Joi.number().min(0).required(),
  maxStock: Joi.number().min(0).allow(null),
  unitType: Joi.string().required(),
  unitsPerPack: Joi.number().min(1).default(1),
  barcode: Joi.string().allow(''),
  requiresPrescription: Joi.boolean().default(false),
  isActive: Joi.boolean().default(true)
});

const updateProductSchema = Joi.object({
  name: Joi.string().allow(''),
  description: Joi.string().allow(''),
  sku: Joi.string().allow(''),
  categoryId: Joi.string().allow(''),
  supplierId: Joi.string().allow(''),
  branchId: Joi.string().allow(''),
  costPrice: Joi.number().positive().allow(0),
  sellingPrice: Joi.number().positive().allow(0),
  stock: Joi.number().min(0),
  minStock: Joi.number().min(0),
  maxStock: Joi.number().min(0).allow(null),
  unitType: Joi.string().allow(''),
  unitsPerPack: Joi.number().min(1).default(1),
  barcode: Joi.string().allow(''),
  requiresPrescription: Joi.boolean(),
  isActive: Joi.boolean()
});

export const getProducts = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      category = '',
      branchId = '',
      lowStock = false,
      includeInactive = false
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Only filter by isActive if includeInactive is false
    if (includeInactive !== 'true') {
      where.isActive = true;
    }

    if (branchId) {
      where.branchId = branchId;
    }

    if (category) {
      where.categoryId = category;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (lowStock === 'true') {
      where.stock = { lte: prisma.product.fields.minStock };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take,
        include: {
          category: true,
          supplier: true,
          branch: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.product.count({ where })
    ]);

    return res.json({
      success: true,
      data: {
        products: serializeBigInt(products),
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const getProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        },
        stockMovements: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    return res.json({
      success: true,
      data: serializeBigInt(product)
    });
  } catch (error) {
    console.error('Get product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const createProduct = async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== CREATE PRODUCT REQUEST ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);

    const { error } = createProductSchema.validate(req.body);
    if (error) {
      console.log('Validation errors:', error.details.map(detail => detail.message));
      console.log('Validation error details:', error.details);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const productData: CreateProductData = req.body;

    // Generate SKU if not provided
    if (!productData.sku) {
      const generateSKU = (name: string): string => {
        const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        const timestamp = Date.now().toString().slice(-6);
        return `${cleanName.slice(0, 6)}${timestamp}`;
      };
      productData.sku = generateSKU(productData.name);
    }

    // Handle default supplier case
    if (productData.supplierId === 'default-supplier') {
      // Check if default supplier exists, if not create it
      let defaultSupplier = await prisma.supplier.findFirst({
        where: { name: 'Default Supplier' }
      });

      if (!defaultSupplier) {
        defaultSupplier = await prisma.supplier.create({
          data: {
            name: 'Default Supplier',
            contactPerson: 'System Generated',
            phone: '+92 300 0000000',
            email: process.env.SYSTEM_EMAIL || 'system@default.com',
            address: 'Auto-created for imports',
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
            isActive: true
          }
        });
      }
      productData.supplierId = defaultSupplier.id;
    }

    // Check if barcode already exists for this admin
    if (productData.barcode) {
      const existingProduct = await prisma.product.findFirst({
        where: {
          barcode: productData.barcode,
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
        }
      });

      if (existingProduct) {
        return res.status(400).json({
          success: false,
          message: 'Product with this barcode already exists'
        });
      }
    }

    const product = await prisma.product.create({
      data: {
        name: productData.name,
        description: productData.description,
        sku: productData.sku,
        categoryId: productData.categoryId,
        supplierId: productData.supplierId,
        branchId: productData.branchId,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id', // Use createdBy for data isolation
        costPrice: productData.costPrice,
        sellingPrice: productData.sellingPrice,
        stock: productData.stock,
        minStock: productData.minStock,
        maxStock: productData.maxStock,
        unitType: productData.unitType,
        unitsPerPack: productData.unitsPerPack,
        barcode: productData.barcode,
        requiresPrescription: productData.requiresPrescription
      },
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Create initial stock movement
    await prisma.stockMovement.create({
      data: {
        productId: product.id,
        type: 'IN',
        quantity: productData.stock,
        reason: 'Initial stock',
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
      }
    });

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifyProductChange(createdBy, 'created', product);
      notifyInventoryChange(createdBy, 'product_added', product);
    }

    return res.status(201).json({
      success: true,
      data: serializeBigInt(product)
    });
  } catch (error) {
    console.error('Create product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error } = updateProductSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const updateData: UpdateProductData = req.body;

    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Check if barcode already exists for this admin (if being updated)
    if (updateData.barcode && updateData.barcode !== existingProduct.barcode) {
      const barcodeExists = await prisma.product.findFirst({
        where: {
          barcode: updateData.barcode,
          createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
        }
      });

      if (barcodeExists) {
        return res.status(400).json({
          success: false,
          message: 'Product with this barcode already exists'
        });
      }
    }

    const product = await prisma.product.update({
      where: { id },
      data: {
        name: updateData.name,
        description: updateData.description,
        sku: updateData.sku,
        categoryId: updateData.categoryId,
        supplierId: updateData.supplierId,
        branchId: updateData.branchId,
        costPrice: updateData.costPrice,
        sellingPrice: updateData.sellingPrice,
        stock: updateData.stock,
        minStock: updateData.minStock,
        maxStock: updateData.maxStock,
        unitType: updateData.unitType,
        unitsPerPack: updateData.unitsPerPack,
        barcode: updateData.barcode,
        requiresPrescription: updateData.requiresPrescription,
        isActive: updateData.isActive
      },
      include: {
        category: true,
        supplier: true,
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
      notifyProductChange(createdBy, 'updated', product);
    }

    return res.json({
      success: true,
      data: serializeBigInt(product)
    });
  } catch (error) {
    console.error('Update product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const deleteProduct = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    console.log(`Deleting product: ${product.name} (ID: ${id})`);

    // Always perform hard delete - permanently remove from database
    await prisma.$transaction(async (tx) => {
      // Delete all related records first
      console.log('Deleting related stock movements...');
      await tx.stockMovement.deleteMany({
        where: { productId: id }
      });

      console.log('Deleting related sale items...');
      await tx.saleItem.deleteMany({
        where: { productId: id }
      });

      console.log('Deleting related refund items...');
      await tx.refundItem.deleteMany({
        where: { productId: id }
      });

      console.log('Deleting product...');
      // Delete the product itself
      await tx.product.delete({
        where: { id }
      });
    });

    console.log(`Product ${product.name} permanently deleted from database`);

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifyProductChange(createdBy, 'deleted', product);
      notifyInventoryChange(createdBy, 'product_removed', product);
    }

    return res.json({
      success: true,
      message: 'Product permanently deleted from database'
    });
  } catch (error) {
    console.error('Delete product error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

export const updateStock = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { type, quantity, reason, reference }: StockMovementData = req.body;

    if (!type || !quantity) {
      return res.status(400).json({
        success: false,
        message: 'Type and quantity are required'
      });
    }

    const product = await prisma.product.findUnique({
      where: { id }
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // Calculate new stock
    let newStock = product.stock;
    if (type === 'IN') {
      newStock += quantity;
    } else if (type === 'OUT') {
      newStock -= quantity;
      if (newStock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient stock'
        });
      }
    } else if (type === 'ADJUSTMENT') {
      newStock = quantity;
    }

    // Update product stock
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { stock: newStock },
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    // Create stock movement record
    await prisma.stockMovement.create({
      data: {
        productId: id,
        type,
        quantity,
        reason,
        reference,
        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
      }
    });

    // Send real-time notification to all users of the same admin
    const createdBy = req.user?.createdBy || req.user?.id;
    if (createdBy) {
      notifyInventoryChange(createdBy, 'stock_updated', {
        productId: updatedProduct.id,
        productName: updatedProduct.name,
        newStock: updatedProduct.stock,
        changeType: type,
        quantity: quantity
      });
    }

    return res.json({
      success: true,
      data: serializeBigInt(updatedProduct)
    });
  } catch (error) {
    console.error('Update stock error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Bulk import products - Fixed TypeScript errors
export const bulkImportProducts = async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== BULK IMPORT REQUEST RECEIVED ===');
    console.log('Request body:', req.body);
    console.log('Request headers:', req.headers);
    console.log('User from request:', (req as any).user);

    const { products } = req.body;
    const userId = (req as any).user?.id;

    console.log('Bulk import request received:', {
      productCount: products?.length || 0,
      userId: userId
    });

    if (!products || !Array.isArray(products) || products.length === 0) {
      console.log('No products provided for bulk import');
      return res.status(400).json({
        success: false,
        message: 'Products array is required and must not be empty'
      });
    }

    const results = {
      successful: [] as any[],
      failed: [] as Array<{ product: any; error: string }>,
      total: products.length
    };

    // Process each product
    for (const productData of products) {
      try {
        console.log('=== PROCESSING PRODUCT ===');
        console.log('Product data received:', productData);
        console.log('Product name:', productData.name);
        console.log('Product selling price:', productData.sellingPrice);
        console.log('Product category ID:', productData.categoryId);
        console.log('Product branch ID:', productData.branchId);

        // Auto-generate missing fields
        if (!productData.name || productData.name.trim() === '') {
          productData.name = `Product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }

        if (!productData.sellingPrice || productData.sellingPrice <= 0) {
          productData.sellingPrice = 100; // Default price
        }

        if (productData.stock === undefined || productData.stock === null || productData.stock < 0) {
          productData.stock = 0; // Default stock
        }

        if (!productData.costPrice || productData.costPrice <= 0) {
          productData.costPrice = productData.sellingPrice * 0.7; // 70% of selling price
        }

        if (!productData.minStock || productData.minStock < 0) {
          productData.minStock = 10; // Default minimum stock
        }

        if (!productData.maxStock || productData.maxStock < 0) {
          productData.maxStock = null; // No maximum limit
        }

        if (!productData.unitType || productData.unitType.trim() === '') {
          productData.unitType = 'tablets'; // Default unit
        }

        if (!productData.unitsPerPack || productData.unitsPerPack <= 0) {
          productData.unitsPerPack = 1; // Default pack size
        }

        if (!productData.description || productData.description.trim() === '') {
          productData.description = 'Imported product'; // Default description
        }

        if (!productData.barcode || productData.barcode.trim() === '') {
          productData.barcode = `AUTO_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
        }

        // Handle category - create if it doesn't exist
        let category = null;

        // If categoryId is provided and not 'auto-create', try to find it
        if (productData.categoryId && productData.categoryId !== 'auto-create') {
          category = await prisma.category.findUnique({
            where: { id: productData.categoryId }
          });
        }

        // If category not found or categoryId is 'auto-create', create/find by name
        if (!category) {
          const categoryName = productData.categoryName || 'Imported Category';
          console.log(`Creating/finding category: ${categoryName}`);

          // Try to find category by name first (in case it was created by another product in this batch)
          category = await prisma.category.findFirst({
            where: {
              name: categoryName,
              createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
          });

          if (!category) {
            // Create new category
            category = await prisma.category.create({
              data: {
                name: categoryName,
                description: `Auto-created during product import - ${new Date().toISOString()}`,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
              }
            });
            console.log(`Created new category: ${category.name} with ID: ${category.id}`);
          } else {
            console.log(`Found existing category by name: ${category.name}`);
          }

          productData.categoryId = category.id;
        }

        // Handle default supplier case
        if (productData.supplierId === 'default-supplier') {
          // Check if default supplier exists, if not create it
          let defaultSupplier = await prisma.supplier.findFirst({
            where: { name: 'Default Supplier' }
          });

          if (!defaultSupplier) {
            defaultSupplier = await prisma.supplier.create({
              data: {
                name: 'Default Supplier',
                contactPerson: 'System Generated',
                phone: '+92 300 0000000',
                email: process.env.SYSTEM_EMAIL || 'system@default.com',
                address: 'Auto-created for imports',
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                isActive: true
              }
            });
          }
          productData.supplierId = defaultSupplier.id;
        }

        // Auto-assign branchId if missing
        if (!productData.branchId) {
          // Find the first available branch for this admin
          const availableBranch = await prisma.branch.findFirst({
            where: {
              createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
              isActive: true
            }
          });

          if (availableBranch) {
            productData.branchId = availableBranch.id;
          } else {
            // Create a default branch if none exists
            const defaultBranch = await prisma.branch.create({
              data: {
                name: 'Default Branch',
                address: 'Auto-created for imports',
                phone: '+92 300 0000000',
                email: process.env.BRANCH_EMAIL || 'default@branch.com',
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                isActive: true
              }
            });
            productData.branchId = defaultBranch.id;
          }
        }

        // Check if branch exists
        const branch = await prisma.branch.findUnique({
          where: { id: productData.branchId }
        });

        if (!branch) {
          const error = `Branch with ID ${productData.branchId} does not exist`;
          console.log(`Validation failed for ${productData.name}:`, error);
          results.failed.push({
            product: productData,
            error: error
          });
          continue;
        }

        // Check if product with same name already exists for THIS ADMIN only
        const existingProduct = await prisma.product.findFirst({
          where: {
            name: productData.name,
            branchId: productData.branchId,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
          }
        });

        if (existingProduct) {
          console.log(`Product ${productData.name} already exists, updating stock instead of skipping...`);

          // Instead of skipping, update the existing product's stock
          try {
            const updatedProduct = await prisma.product.update({
              where: { id: existingProduct.id },
              data: {
                stock: existingProduct.stock + productData.stock, // Add to existing stock
                costPrice: productData.costPrice, // Update cost price
                sellingPrice: productData.sellingPrice, // Update selling price
                description: productData.description || existingProduct.description,
                unitType: productData.unitType || existingProduct.unitType,
                unitsPerPack: productData.unitsPerPack || existingProduct.unitsPerPack,
                // Don't update barcode for existing products to avoid conflicts
                requiresPrescription: productData.requiresPrescription !== undefined ? productData.requiresPrescription : existingProduct.requiresPrescription
              },
              include: {
                category: true,
                supplier: true,
                branch: {
                  select: {
                    id: true,
                    name: true
                  }
                }
              }
            });

            // Create stock movement record for the addition
            await prisma.stockMovement.create({
              data: {
                productId: existingProduct.id,
                type: 'IN',
                quantity: productData.stock,
                reason: 'Bulk Import - Stock Update',
                reference: 'BULK_IMPORT_UPDATE',
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
              }
            });

            results.successful.push(updatedProduct);
            console.log(`Updated existing product: ${productData.name}`);
            continue;
          } catch (updateError) {
            console.error(`Error updating existing product ${productData.name}:`, updateError);
            results.failed.push({
              product: productData,
              error: `Failed to update existing product: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`
            });
            continue;
          }
        }

        // Check barcode uniqueness if provided
        if (productData.barcode && productData.barcode.trim()) {
          const existingBarcode = await prisma.product.findFirst({
            where: {
              barcode: productData.barcode,
              createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
          });

          if (existingBarcode) {
            // Skip barcode if it exists
            delete productData.barcode;
          }
        }

        // Create product
        console.log(`Creating product ${productData.name} with data:`, {
          name: productData.name,
          categoryId: productData.categoryId,
          supplierId: productData.supplierId,
          branchId: productData.branchId,
          sellingPrice: productData.sellingPrice,
          stock: productData.stock
        });
        console.log(`BranchId for product ${productData.name}:`, productData.branchId);
        console.log(`BranchId type:`, typeof productData.branchId);

        // Generate SKU from product name
        const generateSKU = (name: string): string => {
          const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          const timestamp = Date.now().toString().slice(-6);
          return `${cleanName.slice(0, 6)}${timestamp}`;
        };

        // Check and fix barcode uniqueness
        let finalBarcode = productData.barcode;
        if (finalBarcode) {
          let barcodeExists = await prisma.product.findFirst({
            where: {
              barcode: finalBarcode,
              createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
          });

          // If barcode exists, generate a new unique one
          while (barcodeExists) {
            finalBarcode = `AUTO_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
            barcodeExists = await prisma.product.findFirst({
              where: {
                barcode: finalBarcode,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
              }
            });
          }
        }

        const product = await prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description || '',
            categoryId: productData.categoryId,
            supplierId: productData.supplierId,
            branchId: productData.branchId,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
            costPrice: productData.costPrice || 0,
            sellingPrice: productData.sellingPrice,
            stock: productData.stock,
            minStock: productData.minStock || 10,
            maxStock: productData.maxStock || null,
            unitType: productData.unitType || 'tablets',
            unitsPerPack: productData.unitsPerPack || 1,
            barcode: finalBarcode || null,
            requiresPrescription: productData.requiresPrescription || false,
            isActive: true,
            sku: productData.sku || generateSKU(productData.name)
          },
          include: {
            category: true,
            supplier: true,
            branch: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

        results.successful.push(product);

        // Create stock movement record
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            type: 'IN',
            quantity: productData.stock,
            reason: 'Bulk Import',
            reference: 'BULK_IMPORT',
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
          }
        });

      } catch (error: any) {
        console.error(`=== ERROR PROCESSING PRODUCT ${productData.name} ===`);
        console.error('Product data that failed:', productData);
        console.error('Error details:', {
          message: error.message,
          code: error.code,
          meta: error.meta,
          stack: error.stack
        });

        let errorMessage = error.message || 'Unknown error';

        // Handle specific Prisma constraint errors
        if (error.code === 'P2002') {
          if (error.meta?.target?.includes('barcode')) {
            errorMessage = `Barcode '${productData.barcode}' already exists for another product`;
          } else if (error.meta?.target?.includes('name')) {
            errorMessage = `Product name '${productData.name}' already exists in this branch`;
          } else {
            errorMessage = `Duplicate entry: ${error.meta?.target?.join(', ')} already exists`;
          }
        } else if (error.code === 'P2003') {
          errorMessage = `Invalid reference: ${error.meta?.field_name} does not exist`;
        } else if (error.code === 'P2025') {
          errorMessage = `Record not found: ${error.meta?.cause}`;
        } else if (error.message?.includes('Invalid value')) {
          errorMessage = `Invalid data format: ${error.message}`;
        } else if (error.message?.includes('Required field')) {
          errorMessage = `Missing required field: ${error.message}`;
        }

        console.error(`Final error message for ${productData.name}:`, errorMessage);

        results.failed.push({
          product: productData,
          error: errorMessage
        });
      }
    }

    const skippedCount = results.failed.filter(f => f.error.includes('already exists')).length;
    const actualFailedCount = results.failed.length - skippedCount;

    console.log('Bulk import completed:', {
      total: results.total,
      successful: results.successful.length,
      skipped: skippedCount,
      failed: actualFailedCount
    });

    const responseData = {
      success: true,
      data: {
        successful: results.successful,
        failed: results.failed,
        total: results.total,
        successCount: results.successful.length,
        skippedCount: skippedCount,
        failureCount: actualFailedCount
      }
    };

    console.log('=== SENDING RESPONSE ===');
    console.log('Response data:', responseData);

    return res.json(serializeBigInt(responseData));

  } catch (error) {
    console.error('Bulk import error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get all products including inactive ones - for debugging
export const getAllProducts = async (req: AuthRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({
      success: true,
      data: {
        products: serializeBigInt(products),
        total: products.length
      }
    });
  } catch (error) {
    console.error('Get all products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Activate all products - temporary fix
export const activateAllProducts = async (req: AuthRequest, res: Response) => {
  try {
    const result = await prisma.product.updateMany({
      where: {},
      data: {
        isActive: true
      }
    });

    console.log(`Activated ${result.count} products`);

    return res.json({
      success: true,
      message: `Activated ${result.count} products`,
      data: { count: result.count }
    });
  } catch (error) {
    console.error('Activate products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Bulk delete products
export const bulkDeleteProducts = async (req: AuthRequest, res: Response) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Product IDs array is required'
      });
    }

    console.log(`Bulk deleting ${productIds.length} products:`, productIds);

    // Verify all products exist
    const existingProducts = await prisma.product.findMany({
      where: {
        id: { in: productIds }
      },
      select: { id: true, name: true }
    });

    if (existingProducts.length !== productIds.length) {
      const foundIds = existingProducts.map(p => p.id);
      const missingIds = productIds.filter(id => !foundIds.includes(id));
      return res.status(404).json({
        success: false,
        message: `Some products not found: ${missingIds.join(', ')}`
      });
    }

    // Delete all related records and products in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete stock movements for all products
      console.log('Deleting related stock movements...');
      await tx.stockMovement.deleteMany({
        where: { productId: { in: productIds } }
      });

      // Delete sale items for all products
      console.log('Deleting related sale items...');
      await tx.saleItem.deleteMany({
        where: { productId: { in: productIds } }
      });

      // Delete refund items for all products
      console.log('Deleting related refund items...');
      await tx.refundItem.deleteMany({
        where: { productId: { in: productIds } }
      });

      // Delete the products themselves
      console.log('Deleting products...');
      await tx.product.deleteMany({
        where: { id: { in: productIds } }
      });
    });

    console.log(`Successfully bulk deleted ${productIds.length} products`);

    return res.json({
      success: true,
      message: `${productIds.length} products permanently deleted from database`,
      data: serializeBigInt({
        deletedCount: productIds.length,
        deletedProducts: existingProducts.map(p => ({ id: p.id, name: p.name }))
      })
    });
  } catch (error) {
    console.error('Bulk delete products error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get stock movements with date filtering
export const getStockMovements = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      page = 1,
      limit = 50,
      productId = '',
      startDate = '',
      endDate = '',
      type = '',
      branchId = ''
    } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Build where clause with data isolation
    const where: any = buildBranchWhereClause(req, {});

    // Product filter
    if (productId) {
      where.productId = productId;
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Branch filter (through product) - only if not already filtered by buildBranchWhereClause
    if (branchId && req.user?.role !== 'MANAGER') {
      where.product = {
        branchId: branchId
      };
    } else if (req.user?.role === 'MANAGER' && req.user?.branchId) {
      // For managers, ensure we only get stock movements for products in their branch
      where.product = {
        branchId: req.user.branchId
      };
    }

    // Date range filter
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

    const [stockMovements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unitType: true,
              branch: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take
      }),
      prisma.stockMovement.count({ where })
    ]);

    res.json({
      success: true,
      data: {
        stockMovements,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get stock movements error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};
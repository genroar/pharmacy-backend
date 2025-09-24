"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockMovements = exports.bulkDeleteProducts = exports.activateAllProducts = exports.getAllProducts = exports.bulkImportProducts = exports.updateStock = exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProduct = exports.getProducts = void 0;
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const sse_routes_1 = require("../routes/sse.routes");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
function serializeBigInt(obj) {
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
        const serialized = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                serialized[key] = serializeBigInt(obj[key]);
            }
        }
        return serialized;
    }
    return obj;
}
const createProductSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    description: joi_1.default.string().allow(''),
    sku: joi_1.default.string().allow(''),
    categoryId: joi_1.default.string().required(),
    categoryName: joi_1.default.string().allow(''),
    supplierId: joi_1.default.string().required(),
    branchId: joi_1.default.string().required(),
    costPrice: joi_1.default.number().positive().required(),
    sellingPrice: joi_1.default.number().positive().required(),
    stock: joi_1.default.number().min(0).required(),
    minStock: joi_1.default.number().min(0).required(),
    maxStock: joi_1.default.number().min(0).allow(null),
    unitType: joi_1.default.string().required(),
    unitsPerPack: joi_1.default.number().min(1).default(1),
    barcode: joi_1.default.string().allow(''),
    requiresPrescription: joi_1.default.boolean().default(false),
    isActive: joi_1.default.boolean().default(true)
});
const updateProductSchema = joi_1.default.object({
    name: joi_1.default.string().allow(''),
    description: joi_1.default.string().allow(''),
    sku: joi_1.default.string().allow(''),
    categoryId: joi_1.default.string().allow(''),
    supplierId: joi_1.default.string().allow(''),
    branchId: joi_1.default.string().allow(''),
    costPrice: joi_1.default.number().positive().allow(0),
    sellingPrice: joi_1.default.number().positive().allow(0),
    stock: joi_1.default.number().min(0),
    minStock: joi_1.default.number().min(0),
    maxStock: joi_1.default.number().min(0).allow(null),
    unitType: joi_1.default.string().allow(''),
    unitsPerPack: joi_1.default.number().min(1).default(1),
    barcode: joi_1.default.string().allow(''),
    requiresPrescription: joi_1.default.boolean(),
    isActive: joi_1.default.boolean()
});
const getProducts = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', category = '', branchId = '', lowStock = false, includeInactive = false } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
    }
    catch (error) {
        console.error('Get products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getProducts = getProducts;
const getProduct = async (req, res) => {
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
    }
    catch (error) {
        console.error('Get product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getProduct = getProduct;
const createProduct = async (req, res) => {
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
        const productData = req.body;
        if (!productData.sku) {
            const generateSKU = (name) => {
                const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                const timestamp = Date.now().toString().slice(-6);
                return `${cleanName.slice(0, 6)}${timestamp}`;
            };
            productData.sku = generateSKU(productData.name);
        }
        if (productData.supplierId === 'default-supplier') {
            let defaultSupplier = await prisma.supplier.findFirst({
                where: { name: 'Default Supplier' }
            });
            if (!defaultSupplier) {
                defaultSupplier = await prisma.supplier.create({
                    data: {
                        name: 'Default Supplier',
                        contactPerson: 'System Generated',
                        phone: '+92 300 0000000',
                        email: 'system@default.com',
                        address: 'Auto-created for imports',
                        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                        isActive: true
                    }
                });
            }
            productData.supplierId = defaultSupplier.id;
        }
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
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
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
        await prisma.stockMovement.create({
            data: {
                productId: product.id,
                type: 'IN',
                quantity: productData.stock,
                reason: 'Initial stock',
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
        });
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyProductChange)(createdBy, 'created', product);
            (0, sse_routes_1.notifyInventoryChange)(createdBy, 'product_added', product);
        }
        return res.status(201).json({
            success: true,
            data: serializeBigInt(product)
        });
    }
    catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createProduct = createProduct;
const updateProduct = async (req, res) => {
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
        const updateData = req.body;
        const existingProduct = await prisma.product.findUnique({
            where: { id }
        });
        if (!existingProduct) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }
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
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyProductChange)(createdBy, 'updated', product);
        }
        return res.json({
            success: true,
            data: serializeBigInt(product)
        });
    }
    catch (error) {
        console.error('Update product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateProduct = updateProduct;
const deleteProduct = async (req, res) => {
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
        await prisma.$transaction(async (tx) => {
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
            await tx.product.delete({
                where: { id }
            });
        });
        console.log(`Product ${product.name} permanently deleted from database`);
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyProductChange)(createdBy, 'deleted', product);
            (0, sse_routes_1.notifyInventoryChange)(createdBy, 'product_removed', product);
        }
        return res.json({
            success: true,
            message: 'Product permanently deleted from database'
        });
    }
    catch (error) {
        console.error('Delete product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteProduct = deleteProduct;
const updateStock = async (req, res) => {
    try {
        const { id } = req.params;
        const { type, quantity, reason, reference } = req.body;
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
        let newStock = product.stock;
        if (type === 'IN') {
            newStock += quantity;
        }
        else if (type === 'OUT') {
            newStock -= quantity;
            if (newStock < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient stock'
                });
            }
        }
        else if (type === 'ADJUSTMENT') {
            newStock = quantity;
        }
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
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyInventoryChange)(createdBy, 'stock_updated', {
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
    }
    catch (error) {
        console.error('Update stock error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateStock = updateStock;
const bulkImportProducts = async (req, res) => {
    try {
        console.log('=== BULK IMPORT REQUEST RECEIVED ===');
        console.log('Request body:', req.body);
        console.log('Request headers:', req.headers);
        console.log('User from request:', req.user);
        const { products } = req.body;
        const userId = req.user?.id;
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
            successful: [],
            failed: [],
            total: products.length
        };
        for (const productData of products) {
            try {
                console.log('Processing product:', productData.name);
                if (!productData.name || productData.name.trim() === '') {
                    productData.name = `Product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                }
                if (!productData.sellingPrice || productData.sellingPrice <= 0) {
                    productData.sellingPrice = 100;
                }
                if (productData.stock === undefined || productData.stock === null || productData.stock < 0) {
                    productData.stock = 0;
                }
                if (!productData.costPrice || productData.costPrice <= 0) {
                    productData.costPrice = productData.sellingPrice * 0.7;
                }
                if (!productData.minStock || productData.minStock < 0) {
                    productData.minStock = 10;
                }
                if (!productData.maxStock || productData.maxStock < 0) {
                    productData.maxStock = null;
                }
                if (!productData.unitType || productData.unitType.trim() === '') {
                    productData.unitType = 'tablets';
                }
                if (!productData.unitsPerPack || productData.unitsPerPack <= 0) {
                    productData.unitsPerPack = 1;
                }
                if (!productData.description || productData.description.trim() === '') {
                    productData.description = 'Imported product';
                }
                if (!productData.barcode || productData.barcode.trim() === '') {
                    productData.barcode = `AUTO_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
                }
                let category = null;
                if (productData.categoryId && productData.categoryId !== 'auto-create') {
                    category = await prisma.category.findUnique({
                        where: { id: productData.categoryId }
                    });
                }
                if (!category) {
                    const categoryName = productData.categoryName || 'Imported Category';
                    console.log(`Creating/finding category: ${categoryName}`);
                    category = await prisma.category.findFirst({
                        where: {
                            name: categoryName,
                            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                        }
                    });
                    if (!category) {
                        category = await prisma.category.create({
                            data: {
                                name: categoryName,
                                description: `Auto-created during product import - ${new Date().toISOString()}`,
                                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                            }
                        });
                        console.log(`Created new category: ${category.name} with ID: ${category.id}`);
                    }
                    else {
                        console.log(`Found existing category by name: ${category.name}`);
                    }
                    productData.categoryId = category.id;
                }
                if (productData.supplierId === 'default-supplier') {
                    let defaultSupplier = await prisma.supplier.findFirst({
                        where: { name: 'Default Supplier' }
                    });
                    if (!defaultSupplier) {
                        defaultSupplier = await prisma.supplier.create({
                            data: {
                                name: 'Default Supplier',
                                contactPerson: 'System Generated',
                                phone: '+92 300 0000000',
                                email: 'system@default.com',
                                address: 'Auto-created for imports',
                                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                                isActive: true
                            }
                        });
                    }
                    productData.supplierId = defaultSupplier.id;
                }
                if (!productData.branchId) {
                    const availableBranch = await prisma.branch.findFirst({
                        where: {
                            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                            isActive: true
                        }
                    });
                    if (availableBranch) {
                        productData.branchId = availableBranch.id;
                    }
                    else {
                        const defaultBranch = await prisma.branch.create({
                            data: {
                                name: 'Default Branch',
                                address: 'Auto-created for imports',
                                phone: '+92 300 0000000',
                                email: 'default@branch.com',
                                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                                isActive: true
                            }
                        });
                        productData.branchId = defaultBranch.id;
                    }
                }
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
                const existingProduct = await prisma.product.findFirst({
                    where: {
                        name: productData.name,
                        branchId: productData.branchId,
                        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                    }
                });
                if (existingProduct) {
                    console.log(`Product ${productData.name} already exists, updating stock instead of skipping...`);
                    try {
                        const updatedProduct = await prisma.product.update({
                            where: { id: existingProduct.id },
                            data: {
                                stock: existingProduct.stock + productData.stock,
                                costPrice: productData.costPrice,
                                sellingPrice: productData.sellingPrice,
                                description: productData.description || existingProduct.description,
                                unitType: productData.unitType || existingProduct.unitType,
                                unitsPerPack: productData.unitsPerPack || existingProduct.unitsPerPack,
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
                    }
                    catch (updateError) {
                        console.error(`Error updating existing product ${productData.name}:`, updateError);
                        results.failed.push({
                            product: productData,
                            error: `Failed to update existing product: ${updateError instanceof Error ? updateError.message : 'Unknown error'}`
                        });
                        continue;
                    }
                }
                if (productData.barcode && productData.barcode.trim()) {
                    const existingBarcode = await prisma.product.findFirst({
                        where: {
                            barcode: productData.barcode,
                            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                        }
                    });
                    if (existingBarcode) {
                        delete productData.barcode;
                    }
                }
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
                const generateSKU = (name) => {
                    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                    const timestamp = Date.now().toString().slice(-6);
                    return `${cleanName.slice(0, 6)}${timestamp}`;
                };
                let finalBarcode = productData.barcode;
                if (finalBarcode) {
                    let barcodeExists = await prisma.product.findFirst({
                        where: {
                            barcode: finalBarcode,
                            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                        }
                    });
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
            }
            catch (error) {
                console.error(`Error processing product ${productData.name}:`, error);
                console.error('Error details:', {
                    message: error.message,
                    code: error.code,
                    meta: error.meta
                });
                let errorMessage = error.message || 'Unknown error';
                if (error.code === 'P2002') {
                    if (error.meta?.target?.includes('barcode')) {
                        errorMessage = `Barcode '${productData.barcode}' already exists for another product`;
                    }
                    else if (error.meta?.target?.includes('name')) {
                        errorMessage = `Product name '${productData.name}' already exists in this branch`;
                    }
                    else {
                        errorMessage = `Duplicate entry: ${error.meta?.target?.join(', ')} already exists`;
                    }
                }
                else if (error.code === 'P2003') {
                    errorMessage = `Invalid reference: ${error.meta?.field_name} does not exist`;
                }
                else if (error.code === 'P2025') {
                    errorMessage = `Record not found: ${error.meta?.cause}`;
                }
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
    }
    catch (error) {
        console.error('Bulk import error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.bulkImportProducts = bulkImportProducts;
const getAllProducts = async (req, res) => {
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
    }
    catch (error) {
        console.error('Get all products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAllProducts = getAllProducts;
const activateAllProducts = async (req, res) => {
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
    }
    catch (error) {
        console.error('Activate products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.activateAllProducts = activateAllProducts;
const bulkDeleteProducts = async (req, res) => {
    try {
        const { productIds } = req.body;
        if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Product IDs array is required'
            });
        }
        console.log(`Bulk deleting ${productIds.length} products:`, productIds);
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
        await prisma.$transaction(async (tx) => {
            console.log('Deleting related stock movements...');
            await tx.stockMovement.deleteMany({
                where: { productId: { in: productIds } }
            });
            console.log('Deleting related sale items...');
            await tx.saleItem.deleteMany({
                where: { productId: { in: productIds } }
            });
            console.log('Deleting related refund items...');
            await tx.refundItem.deleteMany({
                where: { productId: { in: productIds } }
            });
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
    }
    catch (error) {
        console.error('Bulk delete products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.bulkDeleteProducts = bulkDeleteProducts;
const getStockMovements = async (req, res) => {
    try {
        const { page = 1, limit = 50, productId = '', startDate = '', endDate = '', type = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (productId) {
            where.productId = productId;
        }
        if (type) {
            where.type = type;
        }
        if (branchId && req.user?.role !== 'MANAGER') {
            where.product = {
                branchId: branchId
            };
        }
        else if (req.user?.role === 'MANAGER' && req.user?.branchId) {
            where.product = {
                branchId: req.user.branchId
            };
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateWithTime = new Date(endDate);
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
    }
    catch (error) {
        console.error('Get stock movements error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getStockMovements = getStockMovements;
//# sourceMappingURL=product.controller.js.map
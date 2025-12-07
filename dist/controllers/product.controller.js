"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStockMovements = exports.bulkDeleteProducts = exports.activateAllProducts = exports.getAllProducts = exports.bulkImportProducts = exports.updateStock = exports.deleteProduct = exports.updateProduct = exports.createProduct = exports.getProduct = exports.getProducts = void 0;
const db_util_1 = require("../utils/db.util");
const auth_middleware_1 = require("../middleware/auth.middleware");
const sse_routes_1 = require("../routes/sse.routes");
const joi_1 = __importDefault(require("joi"));
function serializeBigInt(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'bigint') {
        return obj.toString();
    }
    if (obj instanceof Date) {
        return obj.toISOString();
    }
    if (Array.isArray(obj)) {
        return obj.map(serializeBigInt);
    }
    if (typeof obj === 'object') {
        if (obj.constructor && obj.constructor.name === 'Date') {
            return new Date(obj).toISOString();
        }
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
    formula: joi_1.default.string().allow(''),
    sku: joi_1.default.string().allow(''),
    categoryId: joi_1.default.string().required(),
    categoryName: joi_1.default.string().allow(''),
    supplierId: joi_1.default.string().required(),
    branchId: joi_1.default.string().required(),
    barcode: joi_1.default.string().allow(''),
    requiresPrescription: joi_1.default.boolean().default(false),
    isActive: joi_1.default.boolean().default(true),
    minStock: joi_1.default.number().min(0).default(1).optional(),
    maxStock: joi_1.default.number().min(0).allow(null).optional(),
    unitsPerPack: joi_1.default.number().min(1).default(1).optional()
});
const updateProductSchema = joi_1.default.object({
    name: joi_1.default.string().allow(''),
    description: joi_1.default.string().allow(''),
    formula: joi_1.default.string().allow(''),
    sku: joi_1.default.string().allow(''),
    categoryId: joi_1.default.string().allow(''),
    supplierId: joi_1.default.string().allow(''),
    branchId: joi_1.default.string().allow(''),
    barcode: joi_1.default.string().allow(''),
    requiresPrescription: joi_1.default.boolean(),
    isActive: joi_1.default.boolean(),
    minStock: joi_1.default.number().min(0).optional(),
    maxStock: joi_1.default.number().min(0).allow(null).optional(),
    unitsPerPack: joi_1.default.number().min(1).default(1).optional()
});
const getProducts = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 10, search = '', category = '', categoryType = '', branchId = '', lowStock = false, includeInactive = false } = req.query;
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
        if (categoryType) {
            where.category = {
                type: String(categoryType).toUpperCase()
            };
        }
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { barcode: { contains: search } },
                { description: { contains: search } },
                { formula: { contains: search } }
            ];
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
                    },
                    batches: {
                        where: {
                            isActive: true,
                            quantity: { gt: 0 },
                            OR: [
                                { expireDate: null },
                                { expireDate: { gt: new Date() } }
                            ]
                        },
                        select: {
                            id: true,
                            batchNo: true,
                            quantity: true,
                            purchasePrice: true,
                            sellingPrice: true,
                            expireDate: true
                        },
                        orderBy: { expireDate: 'asc' }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.product.count({ where })
        ]);
        const productsWithBatchData = products.map(product => {
            const totalStock = product.batches.reduce((sum, batch) => sum + batch.quantity, 0);
            const currentBatch = product.batches.find(batch => batch.quantity > 0) || product.batches[0];
            const currentPrice = currentBatch?.sellingPrice || 0;
            return {
                ...product,
                stock: totalStock,
                price: currentPrice,
                currentBatch: currentBatch
            };
        });
        let filteredProducts = productsWithBatchData;
        if (lowStock === 'true') {
            filteredProducts = productsWithBatchData.filter(product => product.stock <= product.minStock);
        }
        return res.json({
            success: true,
            data: {
                products: serializeBigInt(filteredProducts),
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total: lowStock === 'true' ? filteredProducts.length : total,
                    pages: Math.ceil((lowStock === 'true' ? filteredProducts.length : total) / Number(limit))
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        let targetCompanyId;
        let targetBranchId;
        if (req.user?.selectedCompanyId && req.user?.selectedBranchId) {
            targetCompanyId = req.user.selectedCompanyId;
            targetBranchId = req.user.selectedBranchId;
            console.log('🏢 Using selected company/branch context:', { targetCompanyId, targetBranchId });
        }
        else {
            const branch = await prisma.branch.findUnique({
                where: { id: productData.branchId },
                select: { companyId: true }
            });
            if (!branch) {
                return res.status(400).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
            targetCompanyId = branch.companyId;
            targetBranchId = productData.branchId;
            console.log('🏢 Using provided branch context:', { targetCompanyId, targetBranchId });
        }
        const product = await prisma.product.create({
            data: {
                name: productData.name,
                description: productData.description,
                formula: productData.formula,
                sku: productData.sku,
                categoryId: productData.categoryId,
                supplierId: productData.supplierId,
                branchId: targetBranchId,
                companyId: targetCompanyId,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                barcode: productData.barcode,
                requiresPrescription: productData.requiresPrescription,
                minStock: productData.minStock || 1,
                maxStock: productData.maxStock || 1000,
                unitsPerPack: productData.unitsPerPack || 1
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
        const prisma = await (0, db_util_1.getPrisma)();
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
                minStock: updateData.minStock,
                maxStock: updateData.maxStock,
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        return res.status(400).json({
            success: false,
            message: 'Stock adjustments are now managed through batches. Please use batch management instead.'
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
        const prisma = await (0, db_util_1.getPrisma)();
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
                console.log('=== PROCESSING PRODUCT ===');
                console.log('Product data received:', productData);
                console.log('Product name:', productData.name);
                console.log('Product selling price:', productData.sellingPrice);
                console.log('Product category ID:', productData.categoryId);
                console.log('Product branch ID:', productData.branchId);
                if (!productData.name || productData.name.trim() === '') {
                    productData.name = `Product_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                }
                if (!productData.minStock || productData.minStock < 0) {
                    productData.minStock = 10;
                }
                if (!productData.maxStock || productData.maxStock < 0) {
                    productData.maxStock = null;
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
                        const defaultCompany = await prisma.company.create({
                            data: {
                                name: 'Default Company',
                                description: 'Auto-created for imports',
                                address: 'Auto-created for imports',
                                phone: '+92 300 0000000',
                                email: process.env.COMPANY_EMAIL || 'default@company.com',
                                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                                isActive: true
                            }
                        });
                        const defaultBranch = await prisma.branch.create({
                            data: {
                                name: 'Default Branch',
                                address: 'Auto-created for imports',
                                phone: '+92 300 0000000',
                                email: process.env.BRANCH_EMAIL || 'default@branch.com',
                                companyId: defaultCompany.id,
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
                                description: productData.description || existingProduct.description,
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
                const branchForCompany = await prisma.branch.findUnique({
                    where: { id: productData.branchId },
                    select: { companyId: true }
                });
                if (!branchForCompany) {
                    return res.status(400).json({
                        success: false,
                        message: 'Branch not found'
                    });
                }
                const product = await prisma.product.create({
                    data: {
                        name: productData.name,
                        description: productData.description || '',
                        categoryId: productData.categoryId,
                        supplierId: productData.supplierId,
                        branchId: productData.branchId,
                        companyId: branchForCompany.companyId,
                        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                        minStock: productData.minStock || 10,
                        maxStock: productData.maxStock || null,
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
            }
            catch (error) {
                console.error(`=== ERROR PROCESSING PRODUCT ${productData.name} ===`);
                console.error('Product data that failed:', productData);
                console.error('Error details:', {
                    message: error.message,
                    code: error.code,
                    meta: error.meta,
                    stack: error.stack
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
                else if (error.message?.includes('Invalid value')) {
                    errorMessage = `Invalid data format: ${error.message}`;
                }
                else if (error.message?.includes('Required field')) {
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
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
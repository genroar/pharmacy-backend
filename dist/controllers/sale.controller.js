"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSale = exports.createSale = exports.getAvailableReceiptNumbers = exports.getSaleByReceiptNumber = exports.getSale = exports.getSales = void 0;
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const sse_routes_1 = require("../routes/sse.routes");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createSaleSchema = joi_1.default.object({
    customerId: joi_1.default.string().allow(null),
    branchId: joi_1.default.string().required(),
    items: joi_1.default.array().items(joi_1.default.object({
        productId: joi_1.default.string().required(),
        quantity: joi_1.default.number().min(1).required(),
        unitPrice: joi_1.default.number().positive().required(),
        batchId: joi_1.default.string().allow(null, ''),
        batchNumber: joi_1.default.string().allow(''),
        expiryDate: joi_1.default.string().allow(''),
        discountPercentage: joi_1.default.number().min(0).max(100).optional(),
        discountAmount: joi_1.default.number().min(0).optional(),
        totalPrice: joi_1.default.number().min(0).optional()
    })).min(1).required(),
    paymentMethod: joi_1.default.string().valid('CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER').required(),
    paymentStatus: joi_1.default.string().valid('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED').optional(),
    discountAmount: joi_1.default.number().min(0).default(0),
    discountPercentage: joi_1.default.number().min(0).max(100).default(0),
    saleDate: joi_1.default.date().optional()
});
const getSales = async (req, res) => {
    try {
        const { page = 1, limit = 10, startDate = '', endDate = '', branchId = '', customerId = '', paymentMethod = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateWithTime = new Date(endDate);
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
    }
    catch (error) {
        console.error('Get sales error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSales = getSales;
const getSale = async (req, res) => {
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
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
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
    }
    catch (error) {
        console.error('Get sale error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSale = getSale;
const getSaleByReceiptNumber = async (req, res) => {
    try {
        const { receiptNumber } = req.params;
        console.log('Looking up receipt number:', receiptNumber);
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
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
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
    }
    catch (error) {
        console.error('Get sale by receipt number error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSaleByReceiptNumber = getSaleByReceiptNumber;
const getAvailableReceiptNumbers = async (req, res) => {
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
    }
    catch (error) {
        console.error('Get available receipt numbers error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAvailableReceiptNumbers = getAvailableReceiptNumbers;
const createSale = async (req, res) => {
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
        const saleData = req.body;
        const userId = req.user.id;
        const currentAdminId = req.user?.createdBy || req.user?.id;
        let taxRate = 0;
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
            }
            catch (error) {
                console.warn('Could not fetch tax rate from settings, using default:', error);
            }
        }
        const itemTotals = saleData.items.map(item => {
            if (item.totalPrice !== undefined && item.totalPrice >= 0) {
                return item.totalPrice;
            }
            const itemSubtotal = item.quantity * item.unitPrice;
            let itemDiscountAmount = 0;
            if (item.discountPercentage && item.discountPercentage > 0) {
                itemDiscountAmount = itemSubtotal * (item.discountPercentage / 100);
            }
            else if (item.discountAmount && item.discountAmount > 0) {
                itemDiscountAmount = item.discountAmount;
            }
            return itemSubtotal - itemDiscountAmount;
        });
        const subtotal = itemTotals.reduce((sum, total) => sum + total, 0);
        const discountAmount = saleData.discountAmount || 0;
        const subtotalAfterDiscount = subtotal - discountAmount;
        const taxAmount = subtotalAfterDiscount * (taxRate / 100);
        const totalAmount = subtotalAfterDiscount + taxAmount;
        const result = await prisma.$transaction(async (tx) => {
            let targetCompanyId;
            let targetBranchId;
            if (req.user?.selectedCompanyId && req.user?.selectedBranchId) {
                targetCompanyId = req.user.selectedCompanyId;
                targetBranchId = req.user.selectedBranchId;
                console.log('🏢 Using selected company/branch context for sale:', { targetCompanyId, targetBranchId });
            }
            else {
                const branch = await tx.branch.findUnique({
                    where: { id: saleData.branchId },
                    select: { companyId: true }
                });
                if (!branch) {
                    throw new Error('Branch not found');
                }
                targetCompanyId = branch.companyId;
                targetBranchId = saleData.branchId;
                console.log('🏢 Using provided branch context for sale:', { targetCompanyId, targetBranchId });
            }
            const paymentStatus = saleData.paymentStatus || 'COMPLETED';
            const saleStatus = paymentStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
            const sale = await tx.sale.create({
                data: {
                    customerId: saleData.customerId,
                    userId: userId,
                    branchId: targetBranchId,
                    companyId: targetCompanyId,
                    createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                    subtotal,
                    taxAmount,
                    discountAmount: discountAmount,
                    discountPercentage: saleData.discountPercentage || 0,
                    totalAmount,
                    paymentMethod: saleData.paymentMethod,
                    paymentStatus: paymentStatus,
                    status: saleStatus,
                    saleDate: saleData.saleDate ? new Date(saleData.saleDate) : undefined
                }
            });
            const saleItems = [];
            for (const item of saleData.items) {
                console.log(`Looking for product with ID: ${item.productId}`);
                const product = await tx.product.findUnique({
                    where: { id: item.productId }
                });
                if (!product) {
                    const allProducts = await tx.product.findMany({
                        select: { id: true, name: true }
                    });
                    console.log('Available products:', allProducts);
                    throw new Error(`Product with ID ${item.productId} not found`);
                }
                const availableBatches = await tx.batch.findMany({
                    where: {
                        productId: item.productId,
                        branchId: targetBranchId,
                        quantity: { gt: 0 },
                        isActive: true
                    },
                    orderBy: { expireDate: 'asc' }
                });
                const totalAvailableStock = availableBatches.reduce((sum, batch) => sum + batch.quantity, 0);
                if (totalAvailableStock < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}. Available: ${totalAvailableStock}, Required: ${item.quantity}`);
                }
                let batchId = null;
                if (item.batchId) {
                    batchId = item.batchId;
                    await tx.batch.update({
                        where: { id: item.batchId },
                        data: {
                            quantity: {
                                decrement: item.quantity
                            }
                        }
                    });
                }
                else if (item.batchNumber) {
                    const batch = await tx.batch.findFirst({
                        where: {
                            batchNo: item.batchNumber,
                            productId: item.productId,
                            branchId: targetBranchId,
                            quantity: {
                                gte: item.quantity
                            }
                        },
                        orderBy: { expireDate: 'asc' }
                    });
                    if (batch) {
                        batchId = batch.id;
                        await tx.batch.update({
                            where: { id: batch.id },
                            data: {
                                quantity: {
                                    decrement: item.quantity
                                }
                            }
                        });
                    }
                }
                const saleItem = await tx.saleItem.create({
                    data: {
                        saleId: sale.id,
                        productId: item.productId,
                        batchId: batchId,
                        createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id',
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        totalPrice: item.quantity * item.unitPrice,
                        batchNumber: item.batchNumber,
                        expiryDate: (() => {
                            if (!item.expiryDate || item.expiryDate === 'Invalid Date')
                                return null;
                            const date = new Date(item.expiryDate);
                            return isNaN(date.getTime()) ? null : date;
                        })()
                    }
                });
                saleItems.push(saleItem);
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
            if (saleData.customerId) {
                await tx.customer.update({
                    where: { id: saleData.customerId },
                    data: {
                        totalPurchases: {
                            increment: totalAmount
                        },
                        loyaltyPoints: {
                            increment: Math.floor(totalAmount / 100)
                        },
                        lastVisit: new Date()
                    }
                });
            }
            const receiptNumber = `RCP-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
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
        const completeSale = await prisma.sale.findUnique({
            where: { id: result.sale.id },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
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
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                name: true,
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
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifySaleChange)(createdBy, 'created', completeSale);
        }
        return res.status(201).json({
            success: true,
            data: {
                ...completeSale,
                receiptNumber: result.receipt.receiptNumber
            }
        });
    }
    catch (error) {
        console.error('Create sale error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
};
exports.createSale = createSale;
const updateSale = async (req, res) => {
    try {
        const { id } = req.params;
        const { discountPercentage, saleDate, notes, paymentStatus } = req.body;
        console.log('Update sale request:', { id, discountPercentage, saleDate, notes, paymentStatus });
        if (discountPercentage !== undefined && (discountPercentage < 0 || discountPercentage > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Discount percentage must be between 0 and 100'
            });
        }
        if (paymentStatus !== undefined && !['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED'].includes(paymentStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid payment status. Must be PENDING, COMPLETED, FAILED, or REFUNDED'
            });
        }
        const existingSale = await prisma.sale.findUnique({
            where: { id },
            include: {
                items: true,
                customer: true,
                user: true,
                branch: true,
                company: true
            }
        });
        if (!existingSale) {
            return res.status(404).json({
                success: false,
                message: 'Sale not found'
            });
        }
        const canUpdate = req.user?.role === 'SUPERADMIN' ||
            req.user?.role === 'ADMIN' ||
            (req.user?.role === 'MANAGER' && existingSale.userId === req.user?.id) ||
            (req.user?.role === 'CASHIER' && existingSale.userId === req.user?.id);
        if (!canUpdate) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this sale'
            });
        }
        let newDiscountAmount = existingSale.discountAmount;
        let newTaxAmount = existingSale.taxAmount;
        let newTotalAmount = existingSale.totalAmount;
        if (discountPercentage !== undefined && discountPercentage !== existingSale.discountPercentage) {
            newDiscountAmount = (existingSale.subtotal * discountPercentage) / 100;
            const subtotalAfterDiscount = existingSale.subtotal - newDiscountAmount;
            newTaxAmount = subtotalAfterDiscount * 0;
            newTotalAmount = subtotalAfterDiscount + newTaxAmount;
        }
        const newPaymentStatus = paymentStatus || existingSale.paymentStatus;
        const newSaleStatus = newPaymentStatus === 'COMPLETED' ? 'COMPLETED' :
            newPaymentStatus === 'PENDING' ? 'PENDING' :
                existingSale.status;
        const updatedSale = await prisma.sale.update({
            where: { id },
            data: {
                discountPercentage: discountPercentage !== undefined ? discountPercentage : existingSale.discountPercentage,
                discountAmount: newDiscountAmount,
                taxAmount: newTaxAmount,
                totalAmount: newTotalAmount,
                paymentStatus: newPaymentStatus,
                status: newSaleStatus,
                saleDate: saleDate ? new Date(saleDate) : existingSale.saleDate,
                updatedAt: new Date()
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                },
                customer: true,
                user: true,
                branch: true,
                company: true,
                receipts: true
            }
        });
        const serializedSale = {
            ...updatedSale,
            id: updatedSale.id.toString(),
            userId: updatedSale.userId.toString(),
            branchId: updatedSale.branchId.toString(),
            companyId: updatedSale.companyId.toString(),
            customerId: updatedSale.customerId?.toString() || null,
            subtotal: Number(updatedSale.subtotal),
            taxAmount: Number(updatedSale.taxAmount),
            discountAmount: Number(updatedSale.discountAmount),
            discountPercentage: updatedSale.discountPercentage ? Number(updatedSale.discountPercentage) : null,
            totalAmount: Number(updatedSale.totalAmount),
            createdAt: updatedSale.createdAt.toISOString(),
            updatedAt: updatedSale.updatedAt.toISOString(),
            saleDate: updatedSale.saleDate?.toISOString() || null,
            items: updatedSale.items.map(item => ({
                ...item,
                id: item.id.toString(),
                saleId: item.saleId.toString(),
                productId: item.productId.toString(),
                batchId: item.batchId?.toString() || null,
                createdBy: item.createdBy?.toString() || null,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
                totalPrice: Number(item.totalPrice),
                product: {
                    ...item.product,
                    id: item.product.id.toString(),
                    branchId: item.product.branchId.toString(),
                    companyId: item.product.companyId.toString(),
                    categoryId: item.product.categoryId?.toString() || null,
                    createdBy: item.product.createdBy?.toString() || null,
                    minStock: Number(item.product.minStock),
                    maxStock: Number(item.product.maxStock),
                    createdAt: item.product.createdAt.toISOString(),
                    updatedAt: item.product.updatedAt.toISOString()
                }
            })),
            customer: updatedSale.customer ? {
                ...updatedSale.customer,
                id: updatedSale.customer.id.toString(),
                branchId: updatedSale.customer.branchId.toString(),
                companyId: updatedSale.customer.companyId.toString(),
                createdBy: updatedSale.customer.createdBy?.toString() || null,
                totalPurchases: Number(updatedSale.customer.totalPurchases),
                loyaltyPoints: Number(updatedSale.customer.loyaltyPoints),
                createdAt: updatedSale.customer.createdAt.toISOString(),
                updatedAt: updatedSale.customer.updatedAt.toISOString()
            } : null,
            user: {
                ...updatedSale.user,
                id: updatedSale.user.id.toString(),
                branchId: updatedSale.user.branchId?.toString() || null,
                companyId: updatedSale.user.companyId?.toString() || null,
                createdBy: updatedSale.user.createdBy?.toString() || null,
                createdAt: updatedSale.user.createdAt.toISOString(),
                updatedAt: updatedSale.user.updatedAt.toISOString()
            },
            branch: {
                ...updatedSale.branch,
                id: updatedSale.branch.id.toString(),
                companyId: updatedSale.branch.companyId.toString(),
                createdBy: updatedSale.branch.createdBy?.toString() || null,
                createdAt: updatedSale.branch.createdAt.toISOString(),
                updatedAt: updatedSale.branch.updatedAt.toISOString()
            },
            company: {
                ...updatedSale.company,
                id: updatedSale.company.id.toString(),
                createdBy: updatedSale.company.createdBy?.toString() || null,
                createdAt: updatedSale.company.createdAt.toISOString(),
                updatedAt: updatedSale.company.updatedAt.toISOString()
            },
            receipts: updatedSale.receipts.map(receipt => ({
                ...receipt,
                id: receipt.id.toString(),
                saleId: receipt.saleId.toString(),
                printedAt: receipt.printedAt?.toISOString() || null
            }))
        };
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifySaleChange)(createdBy, 'updated', serializedSale);
        }
        return res.json({
            success: true,
            data: serializedSale
        });
    }
    catch (error) {
        console.error('Update sale error:', error);
        return res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : 'Internal server error'
        });
    }
};
exports.updateSale = updateSale;
//# sourceMappingURL=sale.controller.js.map
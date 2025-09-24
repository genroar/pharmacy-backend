"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSale = exports.getAvailableReceiptNumbers = exports.getSaleByReceiptNumber = exports.getSale = exports.getSales = void 0;
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
        batchNumber: joi_1.default.string().allow(''),
        expiryDate: joi_1.default.string().allow('')
    })).min(1).required(),
    paymentMethod: joi_1.default.string().valid('CASH', 'CARD', 'MOBILE', 'BANK_TRANSFER').required(),
    discountAmount: joi_1.default.number().min(0).default(0)
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
        let taxRate = 17;
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
        const subtotal = saleData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const taxAmount = subtotal * (taxRate / 100);
        const totalAmount = subtotal + taxAmount - (saleData.discountAmount || 0);
        const result = await prisma.$transaction(async (tx) => {
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
                if (product.stock < item.quantity) {
                    throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Required: ${item.quantity}`);
                }
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
                await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: {
                            decrement: item.quantity
                        }
                    }
                });
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
//# sourceMappingURL=sale.controller.js.map
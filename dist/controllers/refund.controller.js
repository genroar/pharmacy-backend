"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefundById = exports.getRefunds = exports.createRefund = void 0;
const db_util_1 = require("../utils/db.util");
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
    if (obj && typeof obj === 'object' && obj.constructor && obj.constructor.name === 'Decimal') {
        return obj.toString();
    }
    if (obj && typeof obj === 'object' && obj.toString && typeof obj.toString === 'function' && obj.constructor && obj.constructor.name === 'i') {
        return obj.toString();
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
const createRefundSchema = joi_1.default.object({
    originalSaleId: joi_1.default.string().required(),
    refundReason: joi_1.default.string().required(),
    items: joi_1.default.array().items(joi_1.default.object({
        productId: joi_1.default.string().required(),
        quantity: joi_1.default.number().positive().required(),
        unitPrice: joi_1.default.number().positive().required(),
        reason: joi_1.default.string().required(),
        batchId: joi_1.default.string().allow(null, '').optional(),
        saleItemId: joi_1.default.string().allow(null, '').optional()
    })).min(1).required(),
    refundedBy: joi_1.default.string().required()
});
const createRefund = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
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
        const { originalSaleId, refundReason, items, refundedBy } = req.body;
        console.log('🔍 DEBUG - Processing refund for sale:', originalSaleId);
        const originalSale = await prisma.sale.findUnique({
            where: { id: originalSaleId },
            include: {
                items: {
                    include: {
                        product: true,
                        batch: true
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
        if (originalSale.status === 'REFUNDED') {
            res.status(400).json({
                success: false,
                message: 'This sale has already been refunded'
            });
            return;
        }
        const refundAmount = items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        const result = await prisma.$transaction(async (tx) => {
            console.log('🔍 DEBUG - Starting refund transaction');
            const refund = await tx.refund.create({
                data: {
                    originalSaleId,
                    refundReason,
                    refundedBy,
                    refundAmount,
                    createdBy: req.user?.createdBy || req.user?.id,
                    status: 'PROCESSED',
                    processedAt: new Date()
                }
            });
            console.log('🔍 DEBUG - Refund created with ID:', refund.id);
            const refundItems = [];
            for (const item of items) {
                console.log('🔍 DEBUG - Processing refund item:', item);
                const product = await tx.product.findUnique({
                    where: { id: item.productId }
                });
                if (!product) {
                    console.log('❌ Product not found:', item.productId);
                    throw new Error(`Product with ID ${item.productId} not found`);
                }
                console.log('🔍 DEBUG - Found product:', product.name);
                const refundItem = await tx.refundItem.create({
                    data: {
                        refundId: refund.id,
                        productId: item.productId,
                        quantity: item.quantity,
                        unitPrice: item.unitPrice,
                        reason: item.reason,
                        createdBy: req.user?.createdBy || req.user?.id
                    }
                });
                let batchId = item.batchId;
                if (!batchId) {
                    const originalSaleItem = originalSale.items.find((si) => si.productId === item.productId && si.batchId);
                    if (originalSaleItem) {
                        batchId = originalSaleItem.batchId;
                    }
                }
                if (batchId) {
                    console.log('🔍 DEBUG - Adding', item.quantity, 'items back to batch:', batchId);
                    await tx.batch.update({
                        where: { id: batchId },
                        data: {
                            quantity: {
                                increment: item.quantity
                            }
                        }
                    });
                    console.log('✅ DEBUG - Batch quantity updated');
                }
                else {
                    const activeBatch = await tx.batch.findFirst({
                        where: {
                            productId: item.productId,
                            branchId: originalSale.branchId,
                            isActive: true
                        },
                        orderBy: { expireDate: 'asc' }
                    });
                    if (activeBatch) {
                        console.log('🔍 DEBUG - Adding', item.quantity, 'items back to first available batch:', activeBatch.id);
                        await tx.batch.update({
                            where: { id: activeBatch.id },
                            data: {
                                quantity: {
                                    increment: item.quantity
                                }
                            }
                        });
                        console.log('✅ DEBUG - Batch quantity updated');
                    }
                    else {
                        console.log('⚠️ DEBUG - No batch found to return items to for product:', product.name);
                    }
                }
                await tx.stockMovement.create({
                    data: {
                        productId: item.productId,
                        type: 'RETURN',
                        quantity: item.quantity,
                        reason: `Refund: ${item.reason}`,
                        reference: `REF-${refund.id}`,
                        createdBy: req.user?.createdBy || req.user?.id
                    }
                });
                refundItems.push(refundItem);
            }
            await tx.sale.update({
                where: { id: originalSaleId },
                data: {
                    status: 'REFUNDED',
                    updatedAt: new Date()
                }
            });
            console.log('✅ DEBUG - Sale status updated to REFUNDED');
            return { refund, refundItems };
        });
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyRefundChange)(createdBy, 'created', result.refund);
        }
        res.status(201).json({
            success: true,
            data: {
                refund: result.refund,
                items: result.refundItems
            },
            message: 'Refund processed successfully. Items have been added back to inventory.'
        });
    }
    catch (error) {
        console.error('Create refund error:', error);
        res.status(500).json({
            success: false,
            message: error?.message || 'Internal server error'
        });
    }
};
exports.createRefund = createRefund;
const getRefunds = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 10, search = '', startDate = '', endDate = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        console.log('🔍 getRefunds - User context:', {
            userId: req.user?.id,
            role: req.user?.role,
            branchId: req.user?.branchId,
            companyId: req.user?.companyId,
            createdBy: req.user?.createdBy
        });
        const whereClause = {};
        let targetBranchId = req.user?.selectedBranchId || req.user?.branchId;
        let targetCompanyId = req.user?.selectedCompanyId || req.user?.companyId;
        if (targetBranchId && !targetCompanyId) {
            const branch = await prisma.branch.findUnique({
                where: { id: targetBranchId },
                select: { companyId: true }
            });
            if (branch?.companyId) {
                targetCompanyId = branch.companyId;
            }
        }
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.role === 'ADMIN') {
            whereClause.originalSale = {
                createdBy: req.user.createdBy || req.user.id
            };
        }
        else if (req.user?.role === 'MANAGER' && targetBranchId) {
            whereClause.originalSale = {
                branchId: targetBranchId
            };
        }
        else if (req.user?.role === 'CASHIER' && targetBranchId) {
            whereClause.originalSale = {
                branchId: targetBranchId
            };
        }
        if (branchId) {
            whereClause.originalSale = {
                ...whereClause.originalSale,
                branchId: branchId
            };
        }
        if (search) {
            whereClause.OR = [
                { refundReason: { contains: search } },
                { id: { contains: search } }
            ];
        }
        if (startDate || endDate) {
            whereClause.createdAt = {};
            if (startDate) {
                whereClause.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateWithTime = new Date(endDate);
                endDateWithTime.setHours(23, 59, 59, 999);
                whereClause.createdAt.lte = endDateWithTime;
            }
        }
        console.log('🔍 getRefunds - Where clause:', JSON.stringify(whereClause, null, 2));
        const [refunds, total] = await Promise.all([
            prisma.refund.findMany({
                where: whereClause,
                include: {
                    originalSale: {
                        include: {
                            customer: true,
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                    username: true
                                }
                            },
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
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: Number(limit)
            }),
            prisma.refund.count({ where: whereClause })
        ]);
        console.log('🔍 getRefunds - Found', refunds.length, 'refunds, total:', total);
        const serializedRefunds = serializeBigInt(refunds);
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
    }
    catch (error) {
        console.error('Get refunds error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getRefunds = getRefunds;
const getRefundById = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
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
    }
    catch (error) {
        console.error('Get refund by ID error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getRefundById = getRefundById;
//# sourceMappingURL=refund.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRefundById = exports.getRefunds = exports.createRefund = void 0;
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
        reason: joi_1.default.string().required()
    })).min(1).required(),
    refundedBy: joi_1.default.string().required()
});
const createRefund = async (req, res) => {
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
        const { originalSaleId, refundReason, items, refundedBy } = req.body;
        console.log('🔍 DEBUG - Processing refund for sale:', originalSaleId);
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
        const result = await prisma.$transaction(async (tx) => {
            console.log('🔍 DEBUG - Starting refund transaction');
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
                console.log('🔍 DEBUG - Found product:', product.name, 'Current stock:', product.stock);
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
                const updatedProduct = await tx.product.update({
                    where: { id: item.productId },
                    data: {
                        stock: {
                            increment: item.quantity
                        }
                    }
                });
                console.log('🔍 DEBUG - Stock updated for', product.name, 'from', product.stock, 'to', updatedProduct.stock);
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
            await tx.sale.update({
                where: { id: originalSaleId },
                data: { status: 'REFUNDED' }
            });
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
            message: 'Refund processed successfully'
        });
    }
    catch (error) {
        console.error('Create refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createRefund = createRefund;
const getRefunds = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', startDate = '', endDate = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const whereClause = (0, auth_middleware_1.buildBranchWhereClauseForRelation)(req, {});
        if (search) {
            whereClause.OR = [
                { refundReason: { contains: search, mode: 'insensitive' } },
                { originalSale: {
                        receipts: {
                            some: {
                                receiptNumber: { contains: search, mode: 'insensitive' }
                            }
                        }
                    } }
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
        if (branchId && req.user?.role !== 'MANAGER') {
            whereClause.originalSale = {
                ...whereClause.originalSale,
                branchId: branchId
            };
        }
        else if (req.user?.role === 'MANAGER' && req.user?.branchId) {
            whereClause.originalSale = {
                ...whereClause.originalSale,
                branchId: req.user.branchId
            };
        }
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
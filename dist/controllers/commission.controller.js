"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeePerformance = exports.getCommissionStats = exports.updateCommission = exports.getCommission = exports.getCommissions = exports.calculateCommission = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const calculateCommissionSchema = joi_1.default.object({
    employeeId: joi_1.default.string().required(),
    branchId: joi_1.default.string().required(),
    period: joi_1.default.string().required(),
    periodType: joi_1.default.string().valid('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY').default('MONTHLY'),
    baseRate: joi_1.default.number().min(0).max(1).default(0.02),
    bonusRate: joi_1.default.number().min(0).max(1).default(0),
    notes: joi_1.default.string().optional()
});
const updateCommissionSchema = joi_1.default.object({
    status: joi_1.default.string().valid('PENDING', 'APPROVED', 'PAID', 'CANCELLED').optional(),
    notes: joi_1.default.string().optional()
});
const calculateCommission = async (req, res) => {
    try {
        const { error } = calculateCommissionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { employeeId, branchId, period, periodType, baseRate, bonusRate, notes } = req.body;
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            include: { branch: true }
        });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        if (!employee.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Employee is not active'
            });
        }
        const existingCommission = await prisma.commission.findFirst({
            where: {
                employeeId,
                period,
                periodType
            }
        });
        if (existingCommission) {
            return res.status(400).json({
                success: false,
                message: 'Commission already calculated for this period'
            });
        }
        let startDate;
        let endDate;
        const periodDate = new Date(period);
        switch (periodType) {
            case 'DAILY':
                startDate = new Date(periodDate);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(periodDate);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'WEEKLY':
                const dayOfWeek = periodDate.getDay();
                startDate = new Date(periodDate);
                startDate.setDate(periodDate.getDate() - dayOfWeek);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'MONTHLY':
                startDate = new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
                endDate = new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'YEARLY':
                startDate = new Date(periodDate.getFullYear(), 0, 1);
                endDate = new Date(periodDate.getFullYear(), 11, 31);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: 'Invalid period type'
                });
        }
        const salesData = await prisma.sale.aggregate({
            where: {
                userId: employeeId,
                branchId,
                createdAt: {
                    gte: startDate,
                    lte: endDate
                },
                status: 'COMPLETED'
            },
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        const totalSales = salesData._sum.totalAmount || 0;
        const totalTransactions = salesData._count.id || 0;
        const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
        const totalCommission = totalSales * baseRate;
        const bonusAmount = totalSales * bonusRate;
        const totalAmount = totalCommission + bonusAmount;
        const commission = await prisma.commission.create({
            data: {
                employeeId,
                branchId,
                period,
                periodType,
                totalSales,
                totalTransactions,
                averageSale,
                baseRate,
                bonusRate,
                totalCommission,
                bonusAmount,
                totalAmount,
                notes
            },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.status(201).json({
            success: true,
            data: commission,
            message: 'Commission calculated successfully'
        });
    }
    catch (error) {
        console.error('Error calculating commission:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.calculateCommission = calculateCommission;
const getCommissions = async (req, res) => {
    try {
        const { page = 1, limit = 10, employeeId = '', branchId = '', status = '', periodType = '', startDate = '', endDate = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (employeeId) {
            where.employeeId = employeeId;
        }
        if (branchId) {
            where.branchId = branchId;
        }
        if (status) {
            where.status = status;
        }
        if (periodType) {
            where.periodType = periodType;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDateObj;
            }
        }
        const [commissions, total] = await Promise.all([
            prisma.commission.findMany({
                where,
                skip,
                take,
                include: {
                    employee: {
                        select: {
                            id: true,
                            name: true,
                            employeeId: true,
                            position: true
                        }
                    },
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.commission.count({ where })
        ]);
        return res.json({
            success: true,
            data: {
                commissions,
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
        console.error('Error fetching commissions:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCommissions = getCommissions;
const getCommission = async (req, res) => {
    try {
        const { id } = req.params;
        const commission = await prisma.commission.findUnique({
            where: { id },
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        if (!commission) {
            return res.status(404).json({
                success: false,
                message: 'Commission not found'
            });
        }
        return res.json({
            success: true,
            data: commission
        });
    }
    catch (error) {
        console.error('Error fetching commission:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCommission = getCommission;
const updateCommission = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateCommissionSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingCommission = await prisma.commission.findUnique({
            where: { id }
        });
        if (!existingCommission) {
            return res.status(404).json({
                success: false,
                message: 'Commission not found'
            });
        }
        if (updateData.status === 'PAID' && existingCommission.status !== 'PAID') {
            updateData.paidAt = new Date();
        }
        const commission = await prisma.commission.update({
            where: { id },
            data: updateData,
            include: {
                employee: {
                    select: {
                        id: true,
                        name: true,
                        employeeId: true,
                        position: true
                    }
                },
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: commission,
            message: 'Commission updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating commission:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateCommission = updateCommission;
const getCommissionStats = async (req, res) => {
    try {
        const { branchId, startDate, endDate } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDateObj;
            }
        }
        const [totalCommissions, pendingCommissions, approvedCommissions, paidCommissions, cancelledCommissions, totalAmount, totalPaidAmount] = await Promise.all([
            prisma.commission.count({ where }),
            prisma.commission.count({ where: { ...where, status: 'PENDING' } }),
            prisma.commission.count({ where: { ...where, status: 'APPROVED' } }),
            prisma.commission.count({ where: { ...where, status: 'PAID' } }),
            prisma.commission.count({ where: { ...where, status: 'CANCELLED' } }),
            prisma.commission.aggregate({
                where,
                _sum: { totalAmount: true }
            }),
            prisma.commission.aggregate({
                where: { ...where, status: 'PAID' },
                _sum: { totalAmount: true }
            })
        ]);
        return res.json({
            success: true,
            data: {
                totalCommissions,
                pendingCommissions,
                approvedCommissions,
                paidCommissions,
                cancelledCommissions,
                totalAmount: totalAmount._sum.totalAmount || 0,
                totalPaidAmount: totalPaidAmount._sum.totalAmount || 0
            }
        });
    }
    catch (error) {
        console.error('Error fetching commission stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCommissionStats = getCommissionStats;
const getEmployeePerformance = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;
        const where = { employeeId };
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                const endDateObj = new Date(endDate);
                endDateObj.setHours(23, 59, 59, 999);
                where.createdAt.lte = endDateObj;
            }
        }
        const salesData = await prisma.sale.aggregate({
            where: {
                userId: employeeId,
                status: 'COMPLETED',
                ...(startDate || endDate ? {
                    createdAt: {
                        ...(startDate ? { gte: new Date(startDate) } : {}),
                        ...(endDate ? { lte: new Date(endDate) } : {})
                    }
                } : {})
            },
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        const commissionData = await prisma.commission.aggregate({
            where,
            _sum: {
                totalAmount: true,
                totalCommission: true,
                bonusAmount: true
            },
            _count: {
                id: true
            }
        });
        const recentCommissions = await prisma.commission.findMany({
            where,
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        const topProducts = await prisma.saleItem.groupBy({
            by: ['productId'],
            where: {
                sale: {
                    userId: employeeId,
                    status: 'COMPLETED',
                    ...(startDate || endDate ? {
                        createdAt: {
                            ...(startDate ? { gte: new Date(startDate) } : {}),
                            ...(endDate ? { lte: new Date(endDate) } : {})
                        }
                    } : {})
                }
            },
            _sum: {
                quantity: true,
                totalPrice: true
            },
            _count: {
                productId: true
            },
            orderBy: {
                _sum: {
                    totalPrice: 'desc'
                }
            },
            take: 5
        });
        const productIds = topProducts.map(p => p.productId);
        const products = await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true }
        });
        const topProductsWithNames = topProducts.map(item => {
            const product = products.find(p => p.id === item.productId);
            return {
                productName: product?.name || 'Unknown Product',
                quantity: item._sum.quantity || 0,
                totalAmount: item._sum.totalPrice || 0
            };
        });
        return res.json({
            success: true,
            data: {
                totalSales: salesData._sum.totalAmount || 0,
                totalTransactions: salesData._count.id || 0,
                averageSale: salesData._count.id > 0 ? (salesData._sum.totalAmount || 0) / salesData._count.id : 0,
                topProducts: topProductsWithNames,
                commissions: {
                    totalCommissions: commissionData._count.id || 0,
                    totalAmount: commissionData._sum.totalAmount || 0,
                    totalCommission: commissionData._sum.totalCommission || 0,
                    totalBonus: commissionData._sum.bonusAmount || 0
                },
                recentCommissions
            }
        });
    }
    catch (error) {
        console.error('Error fetching employee performance:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getEmployeePerformance = getEmployeePerformance;
//# sourceMappingURL=commission.controller.js.map
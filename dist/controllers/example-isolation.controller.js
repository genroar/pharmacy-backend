"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalesReport = exports.getCustomers = exports.createSale = exports.getSales = void 0;
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const prisma = new client_1.PrismaClient();
const getSales = async (req, res) => {
    try {
        const { page = 1, limit = 10, startDate = '', endDate = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
        if (branchId) {
            where.branchId = branchId;
        }
        const [sales, total] = await Promise.all([
            prisma.sale.findMany({
                where,
                include: {
                    customer: true,
                    user: true,
                    branch: true,
                    items: {
                        include: {
                            product: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
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
const createSale = async (req, res) => {
    try {
        const saleData = req.body;
        const sale = await prisma.sale.create({
            data: {
                ...saleData,
                createdBy: req.user?.createdBy || req.user?.id,
                userId: req.user?.id || saleData.userId
            },
            include: {
                customer: true,
                user: true,
                branch: true,
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
        res.status(201).json({
            success: true,
            data: sale
        });
    }
    catch (error) {
        console.error('Create sale error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createSale = createSale;
const getCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        if (branchId) {
            where.branchId = branchId;
        }
        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                include: {
                    branch: true
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take
            }),
            prisma.customer.count({ where })
        ]);
        res.json({
            success: true,
            data: {
                customers,
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
        console.error('Get customers error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCustomers = getCustomers;
const getSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, branchId } = req.query;
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
        if (branchId) {
            where.branchId = branchId;
        }
        const sales = await prisma.sale.findMany({
            where,
            include: {
                items: {
                    include: {
                        product: true
                    }
                }
            }
        });
        const totalSales = sales.reduce((sum, sale) => sum + sale.totalAmount, 0);
        const totalTransactions = sales.length;
        const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
        res.json({
            success: true,
            data: {
                totalSales,
                totalTransactions,
                averageSale,
                sales
            }
        });
    }
    catch (error) {
        console.error('Get sales report error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSalesReport = getSalesReport;
//# sourceMappingURL=example-isolation.controller.js.map
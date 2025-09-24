"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSalesByPaymentMethod = exports.getTopSellingProducts = exports.getAdminDashboardStats = exports.getSalesChart = exports.getDashboardStats = void 0;
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const prisma = new client_1.PrismaClient();
const getDashboardStats = async (req, res) => {
    try {
        const { branchId = '' } = req.query;
        const userId = req.user?.id;
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (branchId) {
            where.branchId = branchId;
        }
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const todaySales = await prisma.sale.aggregate({
            where: {
                ...where,
                createdAt: {
                    gte: today,
                    lt: tomorrow
                }
            },
            _sum: {
                totalAmount: true,
                subtotal: true,
                taxAmount: true
            },
            _count: {
                id: true
            }
        });
        const totalSales = await prisma.sale.aggregate({
            where,
            _sum: {
                totalAmount: true,
                subtotal: true,
                taxAmount: true
            },
            _count: {
                id: true
            }
        });
        const totalProducts = await prisma.product.count({
            where: {
                ...where,
                isActive: true
            }
        });
        const lowStockProducts = await prisma.product.count({
            where: {
                ...where,
                isActive: true,
                stock: {
                    lte: prisma.product.fields.minStock
                }
            }
        });
        const totalCustomers = await prisma.customer.count({
            where: {
                ...where,
                isActive: true
            }
        });
        const recentSales = await prisma.sale.findMany({
            where,
            take: 5,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true
                    }
                },
                user: {
                    select: {
                        id: true,
                        name: true,
                        username: true
                    }
                }
            }
        });
        return res.json({
            success: true,
            data: {
                todayStats: {
                    sales: todaySales._count.id,
                    revenue: todaySales._sum.totalAmount || 0,
                    subtotal: todaySales._sum.subtotal || 0,
                    tax: todaySales._sum.taxAmount || 0
                },
                totalStats: {
                    sales: totalSales._count.id,
                    revenue: totalSales._sum.totalAmount || 0,
                    subtotal: totalSales._sum.subtotal || 0,
                    tax: totalSales._sum.taxAmount || 0
                },
                inventory: {
                    totalProducts,
                    lowStockProducts
                },
                customers: {
                    total: totalCustomers
                },
                recentSales
            }
        });
    }
    catch (error) {
        console.error('Get dashboard stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getDashboardStats = getDashboardStats;
const getSalesChart = async (req, res) => {
    try {
        const { branchId = '', period = '7d', groupBy = 'day' } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        const endDate = new Date();
        const startDate = new Date();
        switch (period) {
            case '7d':
                startDate.setDate(endDate.getDate() - 7);
                break;
            case '30d':
                startDate.setDate(endDate.getDate() - 30);
                break;
            case '90d':
                startDate.setDate(endDate.getDate() - 90);
                break;
            case '1y':
                startDate.setFullYear(endDate.getFullYear() - 1);
                break;
            default:
                startDate.setDate(endDate.getDate() - 7);
        }
        where.createdAt = {
            gte: startDate,
            lte: endDate
        };
        let chartData;
        if (groupBy === 'day') {
            const sales = await prisma.sale.findMany({
                where,
                select: {
                    createdAt: true,
                    totalAmount: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
            const dailyData = {};
            sales.forEach(sale => {
                const dateKey = sale.createdAt.toISOString().split('T')[0];
                if (!dailyData[dateKey]) {
                    dailyData[dateKey] = { total: 0, count: 0 };
                }
                dailyData[dateKey].total += sale.totalAmount;
                dailyData[dateKey].count += 1;
            });
            chartData = Object.entries(dailyData).map(([date, data]) => ({
                date,
                revenue: data.total,
                sales: data.count
            }));
        }
        else if (groupBy === 'week') {
            const sales = await prisma.sale.findMany({
                where,
                select: {
                    createdAt: true,
                    totalAmount: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
            const weeklyData = {};
            sales.forEach(sale => {
                const weekStart = new Date(sale.createdAt);
                weekStart.setDate(weekStart.getDate() - weekStart.getDay());
                const weekKey = weekStart.toISOString().split('T')[0];
                if (!weeklyData[weekKey]) {
                    weeklyData[weekKey] = { total: 0, count: 0 };
                }
                weeklyData[weekKey].total += sale.totalAmount;
                weeklyData[weekKey].count += 1;
            });
            chartData = Object.entries(weeklyData).map(([week, data]) => ({
                week,
                revenue: data.total,
                sales: data.count
            }));
        }
        else if (groupBy === 'month') {
            const sales = await prisma.sale.findMany({
                where,
                select: {
                    createdAt: true,
                    totalAmount: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
            const monthlyData = {};
            sales.forEach(sale => {
                const monthKey = `${sale.createdAt.getFullYear()}-${String(sale.createdAt.getMonth() + 1).padStart(2, '0')}`;
                if (!monthlyData[monthKey]) {
                    monthlyData[monthKey] = { total: 0, count: 0 };
                }
                monthlyData[monthKey].total += sale.totalAmount;
                monthlyData[monthKey].count += 1;
            });
            chartData = Object.entries(monthlyData).map(([month, data]) => ({
                month,
                revenue: data.total,
                sales: data.count
            }));
        }
        return res.json({
            success: true,
            data: {
                period,
                groupBy,
                chartData: chartData || []
            }
        });
    }
    catch (error) {
        console.error('Get sales chart error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSalesChart = getSalesChart;
const getAdminDashboardStats = async (req, res) => {
    try {
        const totalRevenue = await prisma.sale.aggregate({
            _sum: {
                totalAmount: true
            }
        });
        const totalSales = await prisma.sale.count();
        const totalUsers = await prisma.user.count({
            where: {
                isActive: true
            }
        });
        const totalBranches = await prisma.branch.count({
            where: {
                isActive: true
            }
        });
        const recentSales = await prisma.sale.findMany({
            take: 10,
            orderBy: {
                createdAt: 'desc'
            },
            include: {
                customer: {
                    select: {
                        id: true,
                        name: true,
                        phone: true
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
                }
            }
        });
        const lowStockProducts = await prisma.product.findMany({
            where: {
                isActive: true,
                stock: {
                    lte: prisma.product.fields.minStock
                }
            },
            select: {
                id: true,
                name: true,
                stock: true,
                minStock: true,
                unitType: true,
                branch: {
                    select: {
                        name: true
                    }
                }
            },
            take: 10
        });
        const branchPerformance = await prisma.branch.findMany({
            where: {
                isActive: true
            },
            include: {
                _count: {
                    select: {
                        users: true,
                        sales: true
                    }
                },
                sales: {
                    select: {
                        totalAmount: true
                    }
                }
            }
        });
        const branchStats = branchPerformance.map(branch => ({
            id: branch.id,
            name: branch.name,
            users: branch._count.users,
            sales: branch._count.sales,
            revenue: branch.sales.reduce((sum, sale) => sum + sale.totalAmount, 0)
        }));
        const recentUsers = await prisma.user.findMany({
            where: {
                isActive: true,
                sales: {
                    some: {}
                }
            },
            include: {
                branch: {
                    select: {
                        name: true
                    }
                },
                sales: {
                    take: 1,
                    orderBy: {
                        createdAt: 'desc'
                    },
                    select: {
                        createdAt: true,
                        totalAmount: true
                    }
                }
            },
            orderBy: {
                updatedAt: 'desc'
            },
            take: 10
        });
        return res.json({
            success: true,
            data: {
                totalRevenue: totalRevenue._sum.totalAmount || 0,
                totalSales,
                totalUsers,
                totalBranches,
                recentSales,
                lowStockProducts,
                branchPerformance: branchStats,
                recentUsers: recentUsers.map(user => ({
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    branch: user.branch?.name || 'No Branch',
                    lastPurchase: user.sales[0]?.createdAt,
                    lastPurchaseAmount: user.sales[0]?.totalAmount || 0
                }))
            }
        });
    }
    catch (error) {
        console.error('Get admin dashboard stats error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAdminDashboardStats = getAdminDashboardStats;
const getTopSellingProducts = async (req, res) => {
    try {
        const { branchId = '', limit = 10 } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        const topProducts = await prisma.saleItem.groupBy({
            by: ['productId'],
            where: {
                sale: where
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
                    quantity: 'desc'
                }
            },
            take: parseInt(limit)
        });
        const productIds = topProducts.map(item => item.productId);
        const products = await prisma.product.findMany({
            where: {
                id: {
                    in: productIds
                }
            },
            select: {
                id: true,
                name: true,
                sellingPrice: true,
                unitType: true,
                category: {
                    select: {
                        name: true
                    }
                }
            }
        });
        const productMap = new Map(products.map(p => [p.id, p]));
        const result = topProducts.map(item => {
            const product = productMap.get(item.productId);
            return {
                productId: item.productId,
                product: product ? {
                    ...product,
                    price: product.sellingPrice
                } : null,
                totalQuantity: item._sum.quantity || 0,
                totalRevenue: item._sum.totalPrice || 0,
                salesCount: item._count.productId
            };
        });
        return res.json({
            success: true,
            data: result
        });
    }
    catch (error) {
        console.error('Get top selling products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getTopSellingProducts = getTopSellingProducts;
const getSalesByPaymentMethod = async (req, res) => {
    try {
        const { branchId = '' } = req.query;
        const where = {};
        if (branchId) {
            where.branchId = branchId;
        }
        const salesByPaymentMethod = await prisma.sale.groupBy({
            by: ['paymentMethod'],
            where,
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        return res.json({
            success: true,
            data: salesByPaymentMethod
        });
    }
    catch (error) {
        console.error('Get sales by payment method error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSalesByPaymentMethod = getSalesByPaymentMethod;
//# sourceMappingURL=dashboard.controller.js.map
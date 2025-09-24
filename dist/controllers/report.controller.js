"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardData = exports.getSalesByPaymentMethod = exports.getTopSellingProducts = exports.getProductPerformanceReport = exports.getCustomerReport = exports.getInventoryReport = exports.getSalesReport = void 0;
const client_1 = require("@prisma/client");
const auth_middleware_1 = require("../middleware/auth.middleware");
const prisma = new client_1.PrismaClient();
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
const getSalesReport = async (req, res) => {
    try {
        const { startDate = '', endDate = '', branchId = '', groupBy = 'day' } = req.query;
        console.log('Sales report request:', { startDate, endDate, branchId, groupBy });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (branchId) {
            where.branchId = branchId;
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
        else {
            const mostRecentSale = await prisma.sale.findFirst({
                where,
                orderBy: {
                    createdAt: 'desc'
                },
                select: {
                    createdAt: true
                }
            });
            if (mostRecentSale) {
                const mostRecentDate = new Date(mostRecentSale.createdAt);
                mostRecentDate.setHours(0, 0, 0, 0);
                const nextDay = new Date(mostRecentDate);
                nextDay.setDate(nextDay.getDate() + 1);
                where.createdAt = {
                    gte: mostRecentDate,
                    lt: nextDay
                };
                console.log('No date range provided, showing most recent day sales:', {
                    from: mostRecentDate.toISOString(),
                    to: nextDay.toISOString()
                });
            }
            else {
                console.log('No sales found, showing empty result');
            }
        }
        console.log('Sales report where clause:', where);
        const salesSummary = await prisma.sale.aggregate({
            where,
            _sum: {
                totalAmount: true,
                subtotal: true,
                taxAmount: true,
                discountAmount: true
            },
            _count: {
                id: true
            }
        });
        console.log('Sales summary result:', salesSummary);
        const allSales = await prisma.sale.findMany({
            where: branchId ? { branchId: branchId } : {},
            select: {
                id: true,
                totalAmount: true,
                paymentMethod: true,
                createdAt: true,
                branchId: true
            },
            take: 5
        });
        console.log('Sample sales in database:', allSales);
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
        console.log('Sales by payment method result:', salesByPaymentMethod);
        const topProducts = await prisma.saleItem.groupBy({
            by: ['productId'],
            where: {
                sale: where
            },
            _sum: {
                quantity: true,
                totalPrice: true
            },
            orderBy: {
                _sum: {
                    quantity: 'desc'
                }
            },
            take: 10
        });
        console.log('Top products result:', topProducts);
        const topProductsWithDetails = await Promise.all(topProducts.map(async (item) => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: {
                    id: true,
                    name: true,
                    unitType: true,
                    category: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                ...item,
                product
            };
        }));
        let salesTrend;
        if (groupBy === 'day') {
            salesTrend = await prisma.sale.groupBy({
                by: ['createdAt'],
                where,
                _sum: {
                    totalAmount: true
                },
                _count: {
                    id: true
                },
                orderBy: {
                    createdAt: 'asc'
                }
            });
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
            salesTrend = Object.entries(monthlyData).map(([month, data]) => ({
                createdAt: new Date(month + '-01'),
                _sum: { totalAmount: data.total },
                _count: { id: data.count }
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
                const date = new Date(sale.createdAt);
                const year = date.getFullYear();
                const weekNumber = getWeekNumber(date);
                const weekKey = `${year}-W${String(weekNumber).padStart(2, '0')}`;
                if (!weeklyData[weekKey]) {
                    weeklyData[weekKey] = { total: 0, count: 0 };
                }
                weeklyData[weekKey].total += sale.totalAmount;
                weeklyData[weekKey].count += 1;
            });
            salesTrend = Object.entries(weeklyData).map(([week, data]) => ({
                createdAt: new Date(week.replace('W', '-W')),
                _sum: { totalAmount: data.total },
                _count: { id: data.count }
            }));
        }
        else if (groupBy === 'year') {
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
            const yearlyData = {};
            sales.forEach(sale => {
                const year = sale.createdAt.getFullYear().toString();
                if (!yearlyData[year]) {
                    yearlyData[year] = { total: 0, count: 0 };
                }
                yearlyData[year].total += sale.totalAmount;
                yearlyData[year].count += 1;
            });
            salesTrend = Object.entries(yearlyData).map(([year, data]) => ({
                createdAt: new Date(year + '-01-01'),
                _sum: { totalAmount: data.total },
                _count: { id: data.count }
            }));
        }
        const responseData = {
            summary: {
                totalSales: salesSummary._count.id,
                totalRevenue: salesSummary._sum.totalAmount || 0,
                totalSubtotal: salesSummary._sum.subtotal || 0,
                totalTax: salesSummary._sum.taxAmount || 0,
                totalDiscount: salesSummary._sum.discountAmount || 0
            },
            salesByPaymentMethod,
            topProducts: topProductsWithDetails,
            salesTrend: salesTrend || []
        };
        console.log('Sales report response:', responseData);
        return res.json({
            success: true,
            data: responseData
        });
    }
    catch (error) {
        console.error('Get sales report error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSalesReport = getSalesReport;
const getInventoryReport = async (req, res) => {
    try {
        const { branchId = '', lowStock = false } = req.query;
        console.log('Inventory report request:', { branchId, lowStock });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {
            isActive: true
        });
        if (branchId) {
            where.branchId = branchId;
        }
        if (lowStock === 'true') {
            where.stock = {
                lte: prisma.product.fields.minStock
            };
        }
        const inventorySummary = await prisma.product.aggregate({
            where,
            _sum: {
                stock: true
            },
            _count: {
                id: true
            }
        });
        const productsByCategory = await prisma.product.groupBy({
            by: ['categoryId'],
            where,
            _sum: {
                stock: true
            },
            _count: {
                id: true
            }
        });
        const categoriesWithDetails = await Promise.all(productsByCategory.map(async (item) => {
            const category = await prisma.category.findUnique({
                where: { id: item.categoryId },
                select: {
                    id: true,
                    name: true
                }
            });
            return {
                ...item,
                category
            };
        }));
        const lowStockProducts = await prisma.$queryRaw `
      SELECT p.*, c.name as category_name, s.name as supplier_name
      FROM products p
      LEFT JOIN categories c ON p."categoryId" = c.id
      LEFT JOIN suppliers s ON p."supplierId" = s.id
      WHERE p."isActive" = true
      ${branchId ? client_1.Prisma.sql `AND p."branchId" = ${branchId}` : client_1.Prisma.empty}
      AND p.stock <= p."minStock"
      ORDER BY p.stock ASC
    `;
        return res.json({
            success: true,
            data: {
                summary: {
                    totalProducts: inventorySummary._count.id,
                    totalStock: inventorySummary._sum.stock || 0,
                    lowStockCount: Array.isArray(lowStockProducts) ? lowStockProducts.length : 0
                },
                productsByCategory: categoriesWithDetails,
                lowStockProducts
            }
        });
    }
    catch (error) {
        console.error('Get inventory report error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getInventoryReport = getInventoryReport;
const getCustomerReport = async (req, res) => {
    try {
        const { startDate = '', endDate = '', branchId = '', vip = false } = req.query;
        console.log('Customer report request:', { startDate, endDate, branchId, vip });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {
            isActive: true
        });
        if (branchId) {
            where.branchId = branchId;
        }
        if (vip === 'true') {
            where.isVIP = true;
        }
        const customerSummary = await prisma.customer.aggregate({
            where,
            _sum: {
                totalPurchases: true,
                loyaltyPoints: true
            },
            _count: {
                id: true
            }
        });
        const customersByVIP = await prisma.customer.groupBy({
            by: ['isVIP'],
            where,
            _count: {
                id: true
            },
            _sum: {
                totalPurchases: true,
                loyaltyPoints: true
            }
        });
        const topCustomers = await prisma.customer.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                totalPurchases: true,
                loyaltyPoints: true,
                lastVisit: true,
                isVIP: true,
                _count: {
                    select: {
                        sales: true
                    }
                }
            },
            orderBy: {
                totalPurchases: 'desc'
            },
            take: 10
        });
        const recentCustomers = await prisma.customer.findMany({
            where,
            select: {
                id: true,
                name: true,
                phone: true,
                createdAt: true,
                totalPurchases: true
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 10
        });
        return res.json({
            success: true,
            data: {
                summary: {
                    totalCustomers: customerSummary._count.id,
                    totalSpent: customerSummary._sum.totalPurchases || 0,
                    totalLoyaltyPoints: customerSummary._sum.loyaltyPoints || 0,
                    averageSpent: customerSummary._count.id > 0 ? (customerSummary._sum.totalPurchases || 0) / customerSummary._count.id : 0
                },
                customersByVIP,
                topCustomers,
                recentCustomers
            }
        });
    }
    catch (error) {
        console.error('Get customer report error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCustomerReport = getCustomerReport;
const getProductPerformanceReport = async (req, res) => {
    try {
        const { startDate = '', endDate = '', branchId = '', categoryId = '' } = req.query;
        console.log('Product performance report request:', { startDate, endDate, branchId, categoryId });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (branchId) {
            where.branchId = branchId;
        }
        if (startDate || endDate) {
            where.createdAt = {};
            if (startDate) {
                where.createdAt.gte = new Date(startDate);
            }
            if (endDate) {
                where.createdAt.lte = new Date(endDate);
            }
        }
        const productPerformance = await prisma.saleItem.groupBy({
            by: ['productId'],
            where: {
                sale: where
            },
            _sum: {
                quantity: true,
                totalPrice: true
            },
            _count: {
                id: true
            },
            orderBy: {
                _sum: {
                    quantity: 'desc'
                }
            },
            take: 20
        });
        const productsWithDetails = await Promise.all(productPerformance.map(async (item) => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: {
                    id: true,
                    name: true,
                    unitType: true,
                    sellingPrice: true,
                    stock: true,
                    category: {
                        select: {
                            name: true
                        }
                    },
                    supplier: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                ...item,
                product
            };
        }));
        const performanceByCategory = await prisma.saleItem.groupBy({
            by: ['productId'],
            where: {
                sale: where,
                product: categoryId ? { categoryId: categoryId } : undefined
            },
            _sum: {
                quantity: true,
                totalPrice: true
            },
            _count: {
                id: true
            }
        });
        const categoryPerformance = await Promise.all(performanceByCategory.map(async (item) => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: {
                    category: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                ...item,
                category: product?.category?.name || 'Unknown'
            };
        }));
        const categoryStats = {};
        console.log('Category performance data:', categoryPerformance);
        categoryPerformance.forEach(item => {
            const category = item.category;
            if (!categoryStats[category]) {
                categoryStats[category] = { quantity: 0, revenue: 0, count: 0 };
            }
            categoryStats[category].quantity += item._sum?.quantity || 0;
            categoryStats[category].revenue += item._sum?.totalPrice || 0;
            categoryStats[category].count += typeof item._count === 'object' && item._count?.id ? item._count.id : 0;
        });
        console.log('Category stats:', categoryStats);
        const totalProducts = productsWithDetails.length;
        const totalRevenue = productsWithDetails.reduce((sum, item) => sum + (item._sum?.totalPrice || 0), 0);
        const avgRevenue = totalProducts > 0 ? totalRevenue / totalProducts : 0;
        const topProduct = productsWithDetails.length > 0 ? {
            name: productsWithDetails[0].product?.name || 'Unknown',
            revenue: productsWithDetails[0]._sum?.totalPrice || 0
        } : null;
        return res.json({
            success: true,
            data: {
                summary: {
                    totalProducts,
                    totalRevenue,
                    averageRevenue: avgRevenue
                },
                topProduct,
                topProducts: productsWithDetails,
                categoryPerformance: Object.entries(categoryStats).map(([category, stats]) => ({
                    category,
                    ...stats
                }))
            }
        });
    }
    catch (error) {
        console.error('Get product performance report error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getProductPerformanceReport = getProductPerformanceReport;
const getTopSellingProducts = async (req, res) => {
    try {
        const { branchId = '', limit = 10 } = req.query;
        console.log('Top selling products request:', { branchId, limit });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
                id: true
            },
            orderBy: {
                _sum: {
                    quantity: 'desc'
                }
            },
            take: Number(limit)
        });
        const productsWithDetails = await Promise.all(topProducts.map(async (item) => {
            const product = await prisma.product.findUnique({
                where: { id: item.productId },
                select: {
                    id: true,
                    name: true,
                    unitType: true,
                    sellingPrice: true,
                    stock: true,
                    category: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            return {
                productId: item.productId,
                totalQuantity: item._sum?.quantity || 0,
                totalRevenue: item._sum?.totalPrice || 0,
                totalSales: item._count?.id || 0,
                product
            };
        }));
        return res.json({
            success: true,
            data: productsWithDetails
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
        console.log('Sales by payment method request:', { branchId });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
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
            },
            orderBy: {
                _sum: {
                    totalAmount: 'desc'
                }
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
const getDashboardData = async (req, res) => {
    try {
        const { branchId = '' } = req.query;
        console.log('Dashboard data request:', { branchId });
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const where = (0, auth_middleware_1.buildBranchWhereClause)(req, {});
        if (branchId) {
            where.branchId = branchId;
        }
        const mostRecentSale = await prisma.sale.findFirst({
            where,
            orderBy: {
                createdAt: 'desc'
            },
            select: {
                createdAt: true
            }
        });
        let today, tomorrow;
        if (mostRecentSale) {
            today = new Date(mostRecentSale.createdAt);
            today.setHours(0, 0, 0, 0);
            tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
        }
        else {
            today = new Date();
            today.setHours(0, 0, 0, 0);
            tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
        }
        const todayWhere = {
            ...where,
            createdAt: {
                gte: today,
                lt: tomorrow
            }
        };
        const todaySales = await prisma.sale.aggregate({
            where: todayWhere,
            _sum: {
                totalAmount: true,
                subtotal: true,
                taxAmount: true,
                discountAmount: true
            },
            _count: {
                id: true
            }
        });
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayEnd = new Date(tomorrow);
        yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
        const yesterdayWhere = {
            ...where,
            createdAt: {
                gte: yesterday,
                lt: yesterdayEnd
            }
        };
        const yesterdaySales = await prisma.sale.aggregate({
            where: yesterdayWhere,
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        const monthWhere = {
            ...where,
            createdAt: {
                gte: startOfMonth,
                lte: endOfMonth
            }
        };
        const monthSales = await prisma.sale.aggregate({
            where: monthWhere,
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        const startOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        const lastMonthWhere = {
            ...where,
            createdAt: {
                gte: startOfLastMonth,
                lte: endOfLastMonth
            }
        };
        const lastMonthSales = await prisma.sale.aggregate({
            where: lastMonthWhere,
            _sum: {
                totalAmount: true
            },
            _count: {
                id: true
            }
        });
        const todayProfit = (todaySales._sum?.totalAmount || 0) * 0.3;
        const monthProfit = (monthSales._sum?.totalAmount || 0) * 0.3;
        const todayGrowth = yesterdaySales._sum?.totalAmount && yesterdaySales._sum.totalAmount > 0
            ? ((todaySales._sum?.totalAmount || 0) - yesterdaySales._sum.totalAmount) / yesterdaySales._sum.totalAmount * 100
            : 0;
        const monthGrowth = lastMonthSales._sum?.totalAmount && lastMonthSales._sum.totalAmount > 0
            ? ((monthSales._sum?.totalAmount || 0) - lastMonthSales._sum.totalAmount) / lastMonthSales._sum.totalAmount * 100
            : 0;
        const recentSales = await prisma.sale.findMany({
            where: todayWhere,
            include: {
                customer: {
                    select: {
                        name: true,
                        phone: true
                    }
                },
                items: {
                    include: {
                        product: {
                            select: {
                                name: true
                            }
                        }
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 5
        });
        return res.json({
            success: true,
            data: {
                today: {
                    revenue: todaySales._sum?.totalAmount || 0,
                    profit: todayProfit,
                    transactions: todaySales._count?.id || 0,
                    growth: todayGrowth
                },
                month: {
                    revenue: monthSales._sum?.totalAmount || 0,
                    profit: monthProfit,
                    transactions: monthSales._count?.id || 0,
                    growth: monthGrowth
                },
                recentSales
            }
        });
    }
    catch (error) {
        console.error('Get dashboard data error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getDashboardData = getDashboardData;
//# sourceMappingURL=report.controller.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSuperAdminStats = exports.getAdminUsers = exports.deleteAdmin = exports.updateAdmin = exports.createAdmin = exports.getAdmin = exports.getAdmins = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const sse_routes_1 = require("../routes/sse.routes");
const prisma = new client_1.PrismaClient();
const createAdminSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    phone: joi_1.default.string().allow('').optional(),
    company: joi_1.default.string().required(),
    plan: joi_1.default.string().valid('basic', 'premium', 'enterprise').default('basic'),
    branchId: joi_1.default.string().allow(null).optional(),
    password: joi_1.default.string().min(6).required()
});
const updateAdminSchema = joi_1.default.object({
    name: joi_1.default.string(),
    email: joi_1.default.string().email(),
    phone: joi_1.default.string(),
    company: joi_1.default.string(),
    plan: joi_1.default.string().valid('basic', 'premium', 'enterprise'),
    isActive: joi_1.default.boolean(),
    branchId: joi_1.default.string()
});
const getAdmins = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {
            role: client_1.UserRole.ADMIN,
            ...(search && {
                OR: [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
                    { branch: { name: { contains: search, mode: 'insensitive' } } }
                ]
            })
        };
        const [admins, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take,
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            phone: true,
                            email: true
                        }
                    },
                    _count: {
                        select: {
                            sales: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.user.count({ where })
        ]);
        const adminsWithStats = await Promise.all(admins.map(async (admin) => {
            const salesStats = await prisma.sale.aggregate({
                where: { userId: admin.id },
                _sum: { totalAmount: true },
                _count: { id: true }
            });
            const userCount = await prisma.user.count({
                where: {
                    branchId: admin.branchId,
                    isActive: true,
                    role: { notIn: ['ADMIN', 'SUPERADMIN'] }
                }
            });
            const managerCount = await prisma.user.count({
                where: {
                    branchId: admin.branchId,
                    isActive: true,
                    role: 'MANAGER'
                }
            });
            return {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                phone: admin.branch?.phone || '',
                company: admin.branch?.name || '',
                address: admin.branch?.address || '',
                userCount,
                managerCount,
                totalSales: salesStats._sum.totalAmount || 0,
                lastActive: admin.updatedAt.toISOString().split('T')[0],
                status: admin.isActive ? 'active' : 'inactive',
                plan: 'premium',
                createdAt: admin.createdAt.toISOString().split('T')[0],
                subscriptionEnd: '2024-12-31'
            };
        }));
        res.json({
            success: true,
            data: {
                admins: adminsWithStats,
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
        console.error('Get admins error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAdmins = getAdmins;
const getAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const admin = await prisma.user.findFirst({
            where: {
                id,
                role: 'ADMIN'
            },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        phone: true,
                        email: true
                    }
                }
            }
        });
        if (!admin) {
            res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
            return;
        }
        const salesStats = await prisma.sale.aggregate({
            where: { userId: admin.id },
            _sum: { totalAmount: true },
            _count: { id: true }
        });
        const userCount = await prisma.user.count({
            where: {
                branchId: admin.branchId,
                isActive: true,
                role: { notIn: ['ADMIN', 'SUPERADMIN'] }
            }
        });
        const managerCount = await prisma.user.count({
            where: {
                branchId: admin.branchId,
                isActive: true,
                role: 'MANAGER'
            }
        });
        const adminWithStats = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            phone: admin.branch?.phone || '',
            company: admin.branch?.name || '',
            address: admin.branch?.address || '',
            userCount,
            managerCount,
            totalSales: salesStats._sum.totalAmount || 0,
            lastActive: admin.updatedAt.toISOString().split('T')[0],
            status: admin.isActive ? 'active' : 'inactive',
            plan: 'premium',
            createdAt: admin.createdAt.toISOString().split('T')[0],
            subscriptionEnd: '2024-12-31'
        };
        res.json({
            success: true,
            data: adminWithStats
        });
    }
    catch (error) {
        console.error('Get admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAdmin = getAdmin;
const createAdmin = async (req, res) => {
    try {
        const { error } = createAdminSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const { name, email, phone, company, plan, branchId, password } = req.body;
        const finalPhone = phone || '+92 300 0000000';
        const existingAdmin = await prisma.user.findFirst({
            where: {
                OR: [
                    { email },
                    { branch: { name: company } }
                ]
            }
        });
        if (existingAdmin) {
            res.status(400).json({
                success: false,
                message: 'Admin with this email or company already exists'
            });
            return;
        }
        const username = email.split('@')[0] + '_admin';
        const hashedPassword = await require('bcryptjs').hash(password, 12);
        const currentUser = req.user;
        if (!currentUser) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        const result = await prisma.$transaction(async (tx) => {
            const admin = await tx.user.create({
                data: {
                    username,
                    email,
                    password: hashedPassword,
                    name,
                    role: 'ADMIN',
                    branchId: 'temp',
                    createdBy: currentUser.id,
                    isActive: true
                }
            });
            const updatedAdmin = await tx.user.update({
                where: { id: admin.id },
                data: { createdBy: admin.id }
            });
            const branch = await tx.branch.create({
                data: {
                    name: company,
                    address: 'Default Address',
                    phone: finalPhone,
                    email,
                    createdBy: admin.id
                }
            });
            const finalAdmin = await tx.user.update({
                where: { id: admin.id },
                data: { branchId: branch.id },
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true,
                            address: true,
                            phone: true,
                            email: true
                        }
                    }
                }
            });
            return finalAdmin;
        });
        const admin = result;
        const adminWithStats = {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            phone: admin.branch?.phone || '',
            company: admin.branch?.name || '',
            address: admin.branch?.address || '',
            userCount: 0,
            managerCount: 0,
            totalSales: 0,
            lastActive: admin.updatedAt.toISOString().split('T')[0],
            status: admin.isActive ? 'active' : 'inactive',
            plan,
            createdAt: admin.createdAt.toISOString().split('T')[0],
            subscriptionEnd: '2024-12-31'
        };
        res.status(201).json({
            success: true,
            data: adminWithStats,
            message: 'Admin created successfully'
        });
    }
    catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createAdmin = createAdmin;
const updateAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateAdminSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const updateData = req.body;
        const existingAdmin = await prisma.user.findFirst({
            where: { id, role: 'ADMIN' }
        });
        if (!existingAdmin) {
            res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
            return;
        }
        const admin = await prisma.user.update({
            where: { id },
            data: updateData,
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true,
                        address: true,
                        phone: true,
                        email: true
                    }
                }
            }
        });
        if (updateData.company && admin.branchId) {
            await prisma.branch.update({
                where: { id: admin.branchId },
                data: {
                    name: updateData.company,
                    phone: updateData.phone || admin.branch?.phone,
                    email: updateData.email || admin.branch?.email
                }
            });
        }
        if (updateData.isActive !== undefined) {
            if (updateData.isActive === false) {
                (0, sse_routes_1.notifyUserDeactivation)(id);
                const adminUsers = await prisma.user.findMany({
                    where: {
                        branchId: admin.branchId,
                        role: { in: ['MANAGER', 'CASHIER'] }
                    }
                });
                for (const user of adminUsers) {
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { isActive: false }
                    });
                    (0, sse_routes_1.notifyUserDeactivation)(user.id);
                }
            }
            else if (updateData.isActive === true) {
                (0, sse_routes_1.notifyUserReactivation)(id);
            }
        }
        res.json({
            success: true,
            data: admin,
            message: 'Admin updated successfully'
        });
    }
    catch (error) {
        console.error('Update admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateAdmin = updateAdmin;
const deleteAdmin = async (req, res) => {
    try {
        const { id } = req.params;
        const existingAdmin = await prisma.user.findFirst({
            where: { id, role: 'ADMIN' }
        });
        if (!existingAdmin) {
            res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
            return;
        }
        console.log(`🗑️  Deleting admin: ${existingAdmin.name} (${existingAdmin.username})...`);
        await prisma.$transaction(async (tx) => {
            const adminProducts = await tx.product.findMany({
                where: { createdBy: id },
                select: { id: true }
            });
            const productIds = adminProducts.map(p => p.id);
            console.log(`   📊 Found ${productIds.length} products to delete`);
            await tx.refundItem.deleteMany({
                where: { createdBy: id }
            });
            await tx.refund.deleteMany({
                where: {
                    OR: [
                        { refundedBy: id },
                        { createdBy: id }
                    ]
                }
            });
            await tx.saleItem.deleteMany({
                where: { createdBy: id }
            });
            await tx.receipt.deleteMany({
                where: {
                    OR: [
                        { userId: id },
                        { createdBy: id }
                    ]
                }
            });
            await tx.sale.deleteMany({
                where: {
                    OR: [
                        { userId: id },
                        { createdBy: id }
                    ]
                }
            });
            if (productIds.length > 0) {
                await tx.stockMovement.deleteMany({
                    where: {
                        OR: [
                            { createdBy: id },
                            { productId: { in: productIds } }
                        ]
                    }
                });
            }
            else {
                await tx.stockMovement.deleteMany({
                    where: { createdBy: id }
                });
            }
            await tx.customer.deleteMany({
                where: { createdBy: id }
            });
            await tx.product.deleteMany({
                where: { createdBy: id }
            });
            await tx.supplier.deleteMany({
                where: { createdBy: id }
            });
            await tx.category.deleteMany({
                where: { createdBy: id }
            });
            await tx.branch.deleteMany({
                where: { createdBy: id }
            });
            await tx.settings.deleteMany({
                where: { createdBy: id }
            });
            await tx.user.deleteMany({
                where: {
                    OR: [
                        { createdBy: id },
                        { createdBy: id },
                        { id: id }
                    ]
                }
            });
        });
        console.log(`✅ Admin ${existingAdmin.name} and all related data deleted successfully`);
        res.json({
            success: true,
            message: 'Admin and all related data permanently deleted from database'
        });
    }
    catch (error) {
        console.error('Delete admin error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteAdmin = deleteAdmin;
const getAdminUsers = async (req, res) => {
    try {
        const { createdBy } = req.params;
        const admin = await prisma.user.findFirst({
            where: { id: createdBy, role: 'ADMIN' }
        });
        if (!admin) {
            res.status(404).json({
                success: false,
                message: 'Admin not found'
            });
            return;
        }
        const users = await prisma.user.findMany({
            where: {
                branchId: admin.branchId,
                role: { notIn: ['ADMIN', 'SUPERADMIN'] }
            },
            select: {
                id: true,
                name: true,
                email: true,
                isActive: true,
                role: true,
                createdAt: true,
                updatedAt: true
            },
            orderBy: { createdAt: 'desc' }
        });
        const usersWithStats = users.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            createdBy: createdBy,
            lastActive: user.updatedAt.toISOString().split('T')[0],
            status: user.isActive ? 'active' : 'inactive',
            role: user.role
        }));
        res.json({
            success: true,
            data: usersWithStats
        });
    }
    catch (error) {
        console.error('Get admin users error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getAdminUsers = getAdminUsers;
const getSuperAdminStats = async (req, res) => {
    try {
        const totalAdmins = await prisma.user.count({
            where: { role: 'ADMIN', isActive: true }
        });
        const totalUsers = await prisma.user.count({
            where: {
                role: { notIn: ['ADMIN', 'SUPERADMIN'] },
                isActive: true
            }
        });
        const salesStats = await prisma.sale.aggregate({
            _sum: { totalAmount: true },
            _count: { id: true }
        });
        const activeAdmins = await prisma.user.count({
            where: {
                role: 'ADMIN',
                isActive: true
            }
        });
        const recentAdmins = await prisma.user.findMany({
            where: { role: 'ADMIN' },
            take: 3,
            include: {
                branch: {
                    select: {
                        name: true
                    }
                },
                _count: {
                    select: {
                        sales: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });
        const recentAdminsWithStats = await Promise.all(recentAdmins.map(async (admin) => {
            const salesStats = await prisma.sale.aggregate({
                where: { userId: admin.id },
                _sum: { totalAmount: true }
            });
            const userCount = await prisma.user.count({
                where: { branchId: admin.branchId, isActive: true }
            });
            return {
                id: admin.id,
                name: admin.name,
                company: admin.branch?.name || 'No Company',
                userCount,
                totalSales: salesStats._sum.totalAmount || 0
            };
        }));
        res.json({
            success: true,
            data: {
                totalAdmins,
                totalUsers,
                totalSales: salesStats._sum.totalAmount || 0,
                activeAdmins,
                recentAdmins: recentAdminsWithStats
            }
        });
    }
    catch (error) {
        console.error('Get superadmin stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSuperAdminStats = getSuperAdminStats;
//# sourceMappingURL=admin.controller.js.map
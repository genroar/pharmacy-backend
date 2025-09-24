"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerPurchaseHistory = exports.deleteCustomer = exports.updateCustomer = exports.createCustomer = exports.getCustomer = exports.getCustomers = void 0;
const client_1 = require("@prisma/client");
const sse_routes_1 = require("../routes/sse.routes");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createCustomerSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    phone: joi_1.default.string().required(),
    email: joi_1.default.string().email().allow('').optional(),
    address: joi_1.default.string().allow('').optional(),
    branchId: joi_1.default.string().required()
});
const updateCustomerSchema = joi_1.default.object({
    name: joi_1.default.string(),
    phone: joi_1.default.string(),
    email: joi_1.default.string().email().allow(''),
    address: joi_1.default.string().allow(''),
    isVIP: joi_1.default.boolean(),
    isActive: joi_1.default.boolean()
});
const getCustomers = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', branchId = '', vip = false } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {
            isActive: true
        };
        if (req.user?.createdBy) {
            where.createdBy = req.user.createdBy;
        }
        else if (req.user?.id) {
            where.createdBy = req.user.id;
        }
        if (branchId && typeof branchId === 'string' && branchId.trim() !== '') {
            where.branchId = branchId;
        }
        if (vip === 'true') {
            where.isVIP = true;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        console.log('Customer query where clause:', where);
        console.log('Customer query pagination:', { skip, take });
        const [customers, total] = await Promise.all([
            prisma.customer.findMany({
                where,
                skip,
                take,
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    sales: {
                        select: {
                            id: true,
                            totalAmount: true,
                            createdAt: true
                        },
                        orderBy: { createdAt: 'desc' },
                        take: 5
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.customer.count({ where })
        ]);
        console.log('Found customers:', customers.length);
        console.log('Total customers in database:', total);
        console.log('Customer details:', customers.map(c => ({
            id: c.id,
            name: c.name,
            phone: c.phone,
            branchId: c.branchId,
            isActive: c.isActive,
            totalPurchases: c.totalPurchases,
            loyaltyPoints: c.loyaltyPoints
        })));
        return res.json({
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
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCustomers = getCustomers;
const getCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                sales: {
                    include: {
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
                        }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        return res.json({
            success: true,
            data: customer
        });
    }
    catch (error) {
        console.error('Get customer error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCustomer = getCustomer;
const createCustomer = async (req, res) => {
    try {
        console.log('Customer creation request body:', req.body);
        const { error } = createCustomerSchema.validate(req.body);
        if (error) {
            console.log('Customer validation error:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const customerData = req.body;
        const existingCustomer = await prisma.customer.findFirst({
            where: {
                phone: customerData.phone,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
        });
        console.log('Existing customer check:', existingCustomer);
        if (existingCustomer) {
            console.log('Customer already exists, returning existing customer:', existingCustomer);
            return res.status(200).json({
                success: true,
                data: existingCustomer,
                message: 'Customer already exists'
            });
        }
        const customer = await prisma.customer.create({
            data: {
                ...customerData,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            },
            include: {
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
            (0, sse_routes_1.notifyCustomerChange)(createdBy, 'created', customer);
        }
        return res.status(201).json({
            success: true,
            data: customer
        });
    }
    catch (error) {
        console.error('Create customer error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createCustomer = createCustomer;
const updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateCustomerSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingCustomer = await prisma.customer.findUnique({
            where: { id }
        });
        if (!existingCustomer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        if (updateData.phone && updateData.phone !== existingCustomer.phone) {
            const phoneExists = await prisma.customer.findFirst({
                where: {
                    phone: updateData.phone,
                    createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
                }
            });
            if (phoneExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer with this phone number already exists'
                });
            }
        }
        const customer = await prisma.customer.update({
            where: { id },
            data: updateData,
            include: {
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
            data: customer
        });
    }
    catch (error) {
        console.error('Update customer error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateCustomer = updateCustomer;
const deleteCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const customer = await prisma.customer.findUnique({
            where: { id }
        });
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        await prisma.customer.update({
            where: { id },
            data: { isActive: false }
        });
        return res.json({
            success: true,
            message: 'Customer deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete customer error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteCustomer = deleteCustomer;
const getCustomerPurchaseHistory = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 10 } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const customer = await prisma.customer.findUnique({
            where: { id },
            select: { id: true, name: true, phone: true }
        });
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found'
            });
        }
        const [sales, total] = await Promise.all([
            prisma.sale.findMany({
                where: { customerId: id },
                skip,
                take,
                include: {
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
                    user: {
                        select: {
                            name: true,
                            username: true
                        }
                    },
                    branch: {
                        select: {
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.sale.count({ where: { customerId: id } })
        ]);
        const customerStats = await prisma.sale.aggregate({
            where: { customerId: id },
            _sum: {
                totalAmount: true,
                subtotal: true,
                taxAmount: true
            },
            _count: {
                id: true
            }
        });
        return res.json({
            success: true,
            data: {
                customer,
                sales,
                stats: {
                    totalPurchases: customerStats._count.id,
                    totalSpent: customerStats._sum.totalAmount || 0,
                    averageOrder: customerStats._count.id > 0 ? (customerStats._sum.totalAmount || 0) / customerStats._count.id : 0
                },
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
        console.error('Get customer purchase history error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCustomerPurchaseHistory = getCustomerPurchaseHistory;
//# sourceMappingURL=customer.controller.js.map
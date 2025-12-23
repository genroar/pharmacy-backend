"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCustomerPurchaseHistory = exports.deleteCustomer = exports.updateCustomer = exports.createCustomer = exports.getCustomer = exports.getCustomers = void 0;
const db_util_1 = require("../utils/db.util");
const sse_routes_1 = require("../routes/sse.routes");
const sync_helper_1 = require("../utils/sync-helper");
const joi_1 = __importDefault(require("joi"));
const createCustomerSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    phone: joi_1.default.string().required(),
    email: joi_1.default.string().email().allow('').optional(),
    address: joi_1.default.string().allow('').optional(),
    branchId: joi_1.default.string().allow('').optional()
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
        await (0, sync_helper_1.pullLatestFromLive)('customer').catch(err => console.log('[Sync] Pull customers:', err.message));
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 10, search = '', branchId = '', vip = false, createdByRole = '' } = req.query;
        console.log('🔍 getCustomers - User context:', {
            id: req.user?.id,
            role: req.user?.role,
            createdBy: req.user?.createdBy,
            branchId: req.user?.branchId,
            companyId: req.user?.companyId,
            selectedBranchId: req.user?.selectedBranchId,
            selectedCompanyId: req.user?.selectedCompanyId
        });
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {
            isActive: true
        };
        const createdByFilter = req.user?.createdBy || req.user?.id;
        if (createdByFilter) {
            where.createdBy = createdByFilter;
        }
        else {
            console.warn('⚠️ getCustomers - No user context found, returning empty results');
            return res.json({
                success: true,
                data: {
                    customers: [],
                    pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 }
                },
                warning: 'No user context found. Please ensure you are properly authenticated.'
            });
        }
        if (branchId && typeof branchId === 'string' && branchId.trim() !== '') {
            where.branchId = branchId;
        }
        if (vip === 'true') {
            where.isVIP = true;
        }
        if (search) {
            const searchLower = search.toLowerCase();
            where.OR = [
                { name: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } }
            ];
        }
        if (createdByRole && typeof createdByRole === 'string' && createdByRole.trim() !== '') {
            const usersWithRole = await prisma.user.findMany({
                where: { role: createdByRole, isActive: true },
                select: { id: true }
            });
            const userIds = usersWithRole.map(u => u.id);
            if (userIds.length > 0) {
                const baseCreatedBy = req.user?.createdBy || req.user?.id;
                if (baseCreatedBy) {
                    where.AND = [
                        { createdBy: baseCreatedBy },
                        { createdBy: { in: userIds } }
                    ];
                    delete where.createdBy;
                }
                else {
                    where.createdBy = { in: userIds };
                }
            }
            else {
                return res.json({
                    success: true,
                    data: {
                        customers: [],
                        pagination: { page: Number(page), limit: Number(limit), total: 0, pages: 0 }
                    }
                });
            }
        }
        console.log('Customer query where clause:', where);
        console.log('Customer query pagination:', { skip, take });
        console.log('Filter by creator role:', createdByRole);
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
        console.error('❌ Get customers error:', error);
        console.error('❌ Error details:', {
            message: error.message,
            stack: error.stack,
            user: req.user
        });
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
exports.getCustomers = getCustomers;
const getCustomer = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
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
        const prisma = await (0, db_util_1.getPrisma)();
        console.log('📝 Customer creation request received');
        console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
        console.log('📝 User context:', {
            id: req.user?.id,
            role: req.user?.role,
            branchId: req.user?.branchId,
            companyId: req.user?.companyId,
            selectedBranchId: req.user?.selectedBranchId,
            selectedCompanyId: req.user?.selectedCompanyId,
            createdBy: req.user?.createdBy
        });
        const normalizedBody = {
            ...req.body,
            phone: req.body.phone?.trim().replace(/\\+$/, '') || req.body.phone,
            email: req.body.email?.trim() || undefined,
            address: req.body.address?.trim() || undefined,
            branchId: req.body.branchId?.trim() || undefined,
        };
        const { error } = createCustomerSchema.validate(normalizedBody);
        if (error) {
            console.log('Customer validation error:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        let branchId = normalizedBody.branchId || req.user?.selectedBranchId || req.user?.branchId;
        let companyId = req.user?.selectedCompanyId || req.user?.companyId;
        console.log('🔍 Initial branch/company context:', { branchId, companyId });
        console.log('🔍 User context:', {
            id: req.user?.id,
            role: req.user?.role,
            branchId: req.user?.branchId,
            companyId: req.user?.companyId,
            selectedBranchId: req.user?.selectedBranchId,
            selectedCompanyId: req.user?.selectedCompanyId,
            createdBy: req.user?.createdBy
        });
        if (!branchId || !companyId) {
            const lookupUserId = req.user?.createdBy || req.user?.id;
            if (lookupUserId) {
                console.log('🔍 Looking up user for branch/company context:', lookupUserId);
                const lookupUser = await prisma.user.findUnique({
                    where: { id: lookupUserId },
                    select: { branchId: true, companyId: true, role: true }
                });
                console.log('🔍 User found:', lookupUser);
                if (lookupUser) {
                    branchId = branchId || lookupUser.branchId || undefined;
                    companyId = companyId || lookupUser.companyId || undefined;
                    console.log('🔍 Updated branch/company from user lookup:', { branchId, companyId });
                }
            }
        }
        if (!branchId && companyId) {
            console.log('🔍 Looking for first branch for company:', companyId);
            const firstBranch = await prisma.branch.findFirst({
                where: {
                    companyId: companyId,
                    isActive: true
                },
                select: { id: true, companyId: true }
            });
            console.log('🔍 First branch found:', firstBranch);
            if (firstBranch) {
                branchId = firstBranch.id;
                companyId = firstBranch.companyId;
                console.log('🔍 Updated branch/company from first branch:', { branchId, companyId });
            }
        }
        if (!branchId) {
            console.log('🔍 No branchId found, looking for any active branch...');
            const anyBranch = await prisma.branch.findFirst({
                where: { isActive: true },
                select: { id: true, companyId: true },
                orderBy: { createdAt: 'asc' }
            });
            if (anyBranch) {
                branchId = anyBranch.id;
                companyId = anyBranch.companyId;
                console.log('🔍 Using first available branch:', { branchId, companyId });
            }
        }
        if (!branchId || !companyId) {
            console.error('❌ Missing branch or company context:', { branchId, companyId });
            console.error('❌ User context:', req.user);
            return res.status(400).json({
                success: false,
                message: 'Branch and company context required. Please ensure you have proper access permissions and that at least one branch exists in the system.',
                error: 'MISSING_BRANCH_CONTEXT',
                details: {
                    branchId: branchId || null,
                    companyId: companyId || null,
                    userRole: req.user?.role,
                    userBranchId: req.user?.branchId,
                    userCompanyId: req.user?.companyId
                }
            });
        }
        console.log('🔍 Verifying branch exists:', branchId);
        const branch = await prisma.branch.findUnique({
            where: { id: branchId },
            select: { companyId: true }
        });
        if (!branch) {
            console.error('❌ Branch not found:', branchId);
            return res.status(400).json({
                success: false,
                message: 'Branch not found'
            });
        }
        console.log('✅ Branch verified:', { branchId, companyId: branch.companyId });
        const finalCompanyId = branch.companyId;
        const customerData = {
            ...normalizedBody,
            branchId
        };
        const existingCustomer = await prisma.customer.findFirst({
            where: {
                phone: customerData.phone
            }
        });
        console.log('🔍 Existing customer check for phone:', customerData.phone, 'Result:', existingCustomer ? existingCustomer.id : 'Not found');
        if (existingCustomer) {
            console.log('ℹ️  Customer already exists, returning existing customer:', existingCustomer.id);
            return res.status(200).json({
                success: true,
                data: existingCustomer,
                message: 'Customer already exists'
            });
        }
        console.log('🔍 Creating customer with data:', {
            name: customerData.name,
            phone: customerData.phone,
            email: customerData.email,
            address: customerData.address,
            branchId: branchId,
            companyId: finalCompanyId,
            createdBy: req.user?.createdBy || req.user?.id
        });
        const customer = await prisma.customer.create({
            data: {
                name: customerData.name,
                phone: customerData.phone,
                email: customerData.email || null,
                address: customerData.address || null,
                branchId: branchId,
                companyId: finalCompanyId,
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
        console.log('✅ Customer created successfully:', customer.id);
        const createdBy = req.user?.createdBy || req.user?.id;
        if (createdBy) {
            (0, sse_routes_1.notifyCustomerChange)(createdBy, 'created', customer);
        }
        (0, sync_helper_1.syncAfterOperation)('customer', 'create', customer).catch(err => {
            console.error('[Sync] Customer create sync failed:', err.message);
        });
        return res.status(201).json({
            success: true,
            data: customer,
            message: 'Customer created successfully'
        });
    }
    catch (error) {
        console.error('❌ Create customer error:', error);
        console.error('❌ Error details:', {
            message: error.message,
            code: error.code,
            meta: error.meta,
            stack: error.stack,
            user: req.user
        });
        if (error.code === 'P2002') {
            return res.status(400).json({
                success: false,
                message: 'A customer with this phone number already exists',
                error: 'DUPLICATE_PHONE'
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            errorCode: error.code || 'UNKNOWN_ERROR'
        });
    }
};
exports.createCustomer = createCustomer;
const updateCustomer = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
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
        (0, sync_helper_1.syncAfterOperation)('customer', 'update', customer).catch(err => {
            console.error('[Sync] Customer update sync failed:', err.message);
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const deletedCustomer = await prisma.customer.update({
            where: { id },
            data: { isActive: false }
        });
        (0, sync_helper_1.syncAfterOperation)('customer', 'update', deletedCustomer).catch(err => {
            console.error('[Sync] Customer delete sync failed:', err.message);
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
        const prisma = await (0, db_util_1.getPrisma)();
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
                                    name: true
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
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBranch = exports.updateBranch = exports.createBranch = exports.getBranch = exports.getBranches = void 0;
const db_util_1 = require("../utils/db.util");
const sync_helper_1 = require("../utils/sync-helper");
const joi_1 = __importDefault(require("joi"));
const createBranchSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    address: joi_1.default.string().required(),
    phone: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    companyId: joi_1.default.string().required(),
    managerId: joi_1.default.string().allow(null)
});
const updateBranchSchema = joi_1.default.object({
    name: joi_1.default.string(),
    address: joi_1.default.string(),
    phone: joi_1.default.string(),
    email: joi_1.default.string().email(),
    companyId: joi_1.default.string(),
    managerId: joi_1.default.string().allow(null),
    isActive: joi_1.default.boolean()
});
const getBranches = async (req, res) => {
    try {
        await Promise.all([
            (0, sync_helper_1.pullLatestFromLive)('branch').catch(err => console.log('[Sync] Pull branches:', err.message)),
            (0, sync_helper_1.pullLatestFromLive)('company').catch(err => console.log('[Sync] Pull companies:', err.message))
        ]);
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 10, search = '' } = req.query;
        const user = req.user;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {
            isActive: true
        };
        const selectedCompanyId = req.headers['x-company-id'] || req.user?.selectedCompanyId;
        if (selectedCompanyId) {
            where.companyId = selectedCompanyId;
            console.log('🏢 Filtering branches by selected company:', selectedCompanyId);
        }
        else {
            if (user?.role === 'SUPERADMIN') {
                console.log('🏢 SUPERADMIN - showing all branches');
            }
            else if (user?.role === 'ADMIN') {
                const adminCompanies = await prisma.company.findMany({
                    where: { createdBy: user.id, isActive: true },
                    select: { id: true }
                });
                const companyIds = adminCompanies.map(c => c.id);
                if (companyIds.length > 0) {
                    where.companyId = { in: companyIds };
                    console.log('🏢 ADMIN - showing branches of', companyIds.length, 'companies');
                }
                else {
                    where.id = 'no-branches';
                }
            }
            else if (user?.role === 'MANAGER' || user?.role === 'CASHIER') {
                if (user?.branchId) {
                    where.id = user.branchId;
                    console.log('🏢 MANAGER/CASHIER - showing only their branch:', user.branchId);
                }
                else {
                    where.id = 'no-access';
                }
            }
            else {
                where.id = 'no-access';
            }
        }
        if (search) {
            where.OR = [
                { name: { contains: search } },
                { address: { contains: search } },
                { phone: { contains: search } },
                { email: { contains: search } }
            ];
        }
        const [branches, total] = await Promise.all([
            prisma.branch.findMany({
                where,
                skip,
                take,
                include: {
                    company: {
                        select: {
                            id: true,
                            name: true
                        }
                    },
                    _count: {
                        select: {
                            users: true,
                            products: true,
                            customers: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.branch.count({ where })
        ]);
        const enhancedBranches = await Promise.all(branches.map(async (branch) => {
            let manager = null;
            if (branch.managerId) {
                try {
                    const managerUser = await prisma.user.findUnique({
                        where: { id: branch.managerId },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    });
                    manager = managerUser;
                }
                catch (err) {
                    console.log('Could not find manager with id:', branch.managerId);
                }
            }
            if (!manager) {
                try {
                    console.log(`Looking for MANAGER in branch: ${branch.id} (${branch.name})`);
                    const branchManager = await prisma.user.findFirst({
                        where: {
                            branchId: branch.id,
                            role: 'MANAGER'
                        },
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true
                        }
                    });
                    console.log(`Branch ${branch.name} - Manager query result:`, branchManager);
                    if (branchManager) {
                        manager = branchManager;
                        console.log(`✅ Found MANAGER for branch ${branch.name}: ${branchManager.name}`);
                    }
                }
                catch (err) {
                    console.log('Error finding branch manager:', err);
                }
            }
            return {
                ...branch,
                manager: manager
            };
        }));
        return res.json({
            success: true,
            data: {
                branches: enhancedBranches,
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
        console.error('Get branches error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getBranches = getBranches;
const getBranch = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const branch = await prisma.branch.findUnique({
            where: { id },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                },
                users: {
                    select: {
                        id: true,
                        name: true,
                        username: true,
                        role: true,
                        isActive: true
                    }
                },
                _count: {
                    select: {
                        users: true,
                        products: true,
                        customers: true,
                        sales: true
                    }
                }
            }
        });
        if (!branch) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found'
            });
        }
        return res.json({
            success: true,
            data: branch
        });
    }
    catch (error) {
        console.error('Get branch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getBranch = getBranch;
const createBranch = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { error } = createBranchSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { name, address, phone, email, companyId, managerId } = req.body;
        const company = await prisma.company.findUnique({
            where: { id: companyId }
        });
        if (!company) {
            return res.status(404).json({
                success: false,
                message: 'Company not found'
            });
        }
        const existingBranch = await prisma.branch.findFirst({
            where: {
                name: name,
                companyId: companyId
            }
        });
        if (existingBranch) {
            return res.status(400).json({
                success: false,
                message: 'Branch with this name already exists in this company'
            });
        }
        const branch = await prisma.branch.create({
            data: {
                name,
                address,
                phone,
                email,
                companyId,
                managerId,
                createdBy: req.user?.id
            },
            include: {
                company: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        (0, sync_helper_1.syncAfterOperation)('branch', 'create', branch).catch(err => {
            console.error('[Sync] Branch create sync failed:', err.message);
        });
        return res.status(201).json({
            success: true,
            data: branch
        });
    }
    catch (error) {
        console.error('Create branch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createBranch = createBranch;
const updateBranch = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const { error } = updateBranchSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingBranch = await prisma.branch.findUnique({
            where: { id }
        });
        if (!existingBranch) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found'
            });
        }
        if (updateData.name && updateData.name !== existingBranch.name) {
            const nameExists = await prisma.branch.findFirst({
                where: {
                    name: updateData.name,
                    createdBy: req.user?.createdBy || req.user?.id
                }
            });
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Branch with this name already exists'
                });
            }
        }
        const branch = await prisma.branch.update({
            where: { id },
            data: updateData
        });
        (0, sync_helper_1.syncAfterOperation)('branch', 'update', branch).catch(err => {
            console.error('[Sync] Branch update sync failed:', err.message);
        });
        return res.json({
            success: true,
            data: branch
        });
    }
    catch (error) {
        console.error('Update branch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateBranch = updateBranch;
const deleteBranch = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const branch = await prisma.branch.findUnique({
            where: { id }
        });
        if (!branch) {
            return res.status(404).json({
                success: false,
                message: 'Branch not found'
            });
        }
        const deletedBranch = await prisma.branch.update({
            where: { id },
            data: { isActive: false }
        });
        (0, sync_helper_1.syncAfterOperation)('branch', 'update', deletedBranch).catch(err => {
            console.error('[Sync] Branch delete sync failed:', err.message);
        });
        return res.json({
            success: true,
            message: 'Branch deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete branch error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteBranch = deleteBranch;
//# sourceMappingURL=branch.controller.js.map
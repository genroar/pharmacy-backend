"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBranch = exports.updateBranch = exports.createBranch = exports.getBranch = exports.getBranches = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createBranchSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    address: joi_1.default.string().required(),
    phone: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    managerId: joi_1.default.string().allow(null)
});
const updateBranchSchema = joi_1.default.object({
    name: joi_1.default.string(),
    address: joi_1.default.string(),
    phone: joi_1.default.string(),
    email: joi_1.default.string().email(),
    managerId: joi_1.default.string().allow(null),
    isActive: joi_1.default.boolean()
});
const getBranches = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {
            isActive: true
        };
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.role === 'ADMIN') {
            where.createdBy = req.user.id;
        }
        else if (req.user?.createdBy) {
            where.createdBy = req.user.createdBy;
        }
        else if (req.user?.id) {
            where.createdBy = req.user.id;
        }
        else {
            where.createdBy = 'non-existent-admin-id';
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [branches, total] = await Promise.all([
            prisma.branch.findMany({
                where,
                skip,
                take,
                include: {
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
        return res.json({
            success: true,
            data: {
                branches,
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
        const { id } = req.params;
        const branch = await prisma.branch.findUnique({
            where: { id },
            include: {
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
        const { error } = createBranchSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const branchData = req.body;
        let createdBy;
        if (req.user?.role === 'ADMIN') {
            createdBy = req.user.id;
        }
        else {
            createdBy = req.user?.createdBy || req.user?.id || 'default-admin-id';
        }
        const existingBranch = await prisma.branch.findFirst({
            where: {
                name: branchData.name,
                createdBy: createdBy
            }
        });
        if (existingBranch) {
            return res.status(400).json({
                success: false,
                message: 'Branch with this name already exists'
            });
        }
        const branch = await prisma.branch.create({
            data: {
                ...branchData,
                createdBy: createdBy
            }
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
        await prisma.branch.update({
            where: { id },
            data: { isActive: false }
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
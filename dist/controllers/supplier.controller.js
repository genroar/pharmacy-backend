"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplier = exports.updateSupplier = exports.createSupplier = exports.getSupplier = exports.getSuppliers = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createSupplierSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    contactPerson: joi_1.default.string().required(),
    phone: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    address: joi_1.default.string().required()
});
const updateSupplierSchema = joi_1.default.object({
    name: joi_1.default.string(),
    contactPerson: joi_1.default.string(),
    phone: joi_1.default.string(),
    email: joi_1.default.string().email(),
    address: joi_1.default.string(),
    isActive: joi_1.default.boolean()
});
const getSuppliers = async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', active = true } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
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
        if (active === 'true') {
            where.isActive = true;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { contactPerson: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { email: { contains: search, mode: 'insensitive' } },
                { address: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [suppliers, total] = await Promise.all([
            prisma.supplier.findMany({
                where,
                skip,
                take,
                include: {
                    _count: {
                        select: {
                            products: true
                        }
                    }
                },
                orderBy: { name: 'asc' }
            }),
            prisma.supplier.count({ where })
        ]);
        return res.json({
            success: true,
            data: {
                suppliers,
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
        console.error('Get suppliers error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSuppliers = getSuppliers;
const getSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const where = { id };
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
        const supplier = await prisma.supplier.findFirst({
            where,
            include: {
                _count: {
                    select: {
                        products: true
                    }
                }
            }
        });
        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'Supplier not found'
            });
        }
        return res.json({
            success: true,
            data: supplier
        });
    }
    catch (error) {
        console.error('Get supplier error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSupplier = getSupplier;
const createSupplier = async (req, res) => {
    try {
        const { error } = createSupplierSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { name, contactPerson, phone, email, address } = req.body;
        const supplier = await prisma.supplier.create({
            data: {
                name,
                contactPerson,
                phone,
                email,
                address,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
        });
        return res.status(201).json({
            success: true,
            data: supplier
        });
    }
    catch (error) {
        console.error('Create supplier error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createSupplier = createSupplier;
const updateSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateSupplierSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingSupplier = await prisma.supplier.findUnique({
            where: { id }
        });
        if (!existingSupplier) {
            return res.status(404).json({
                success: false,
                message: 'Supplier not found'
            });
        }
        const supplier = await prisma.supplier.update({
            where: { id },
            data: updateData
        });
        return res.json({
            success: true,
            data: supplier
        });
    }
    catch (error) {
        console.error('Update supplier error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateSupplier = updateSupplier;
const deleteSupplier = async (req, res) => {
    try {
        const { id } = req.params;
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: true
                    }
                }
            }
        });
        if (!supplier) {
            return res.status(404).json({
                success: false,
                message: 'Supplier not found'
            });
        }
        if (supplier._count.products > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete supplier with existing products'
            });
        }
        await prisma.supplier.delete({
            where: { id }
        });
        return res.json({
            success: true,
            message: 'Supplier deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete supplier error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteSupplier = deleteSupplier;
//# sourceMappingURL=supplier.controller.js.map
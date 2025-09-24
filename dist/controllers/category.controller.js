"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategory = exports.getCategories = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createCategorySchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    description: joi_1.default.string().allow('')
});
const updateCategorySchema = joi_1.default.object({
    name: joi_1.default.string(),
    description: joi_1.default.string().allow('')
});
const getCategories = async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.role === 'ADMIN') {
            where.createdBy = req.user.createdBy || req.user.id;
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
                { description: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [categories, total] = await Promise.all([
            prisma.category.findMany({
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
            prisma.category.count({ where })
        ]);
        return res.json({
            success: true,
            data: {
                categories,
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
        console.error('Get categories error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCategories = getCategories;
const getCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const where = { id };
        if (req.user?.role === 'SUPERADMIN') {
        }
        else if (req.user?.role === 'ADMIN') {
            where.createdBy = req.user.createdBy || req.user.id;
        }
        else if (req.user?.createdBy) {
            where.createdBy = req.user.createdBy;
            where.branchId = req.user.branchId;
        }
        else if (req.user?.id) {
            where.createdBy = req.user.id;
            where.branchId = req.user.branchId;
        }
        else {
            where.createdBy = 'non-existent-admin-id';
        }
        const category = await prisma.category.findFirst({
            where,
            include: {
                _count: {
                    select: {
                        products: true
                    }
                }
            }
        });
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        return res.json({
            success: true,
            data: category
        });
    }
    catch (error) {
        console.error('Get category error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getCategory = getCategory;
const createCategory = async (req, res) => {
    try {
        console.log('=== CREATE CATEGORY REQUEST ===');
        console.log('Request body:', req.body);
        console.log('User context:', { userId: req.user?.id, createdBy: req.user?.createdBy, role: req.user?.role });
        const { error } = createCategorySchema.validate(req.body);
        if (error) {
            console.log('Validation error:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const { name, description } = req.body;
        const existingCategory = await prisma.category.findFirst({
            where: {
                name: name,
                createdBy: req.user?.createdBy || req.user?.id
            }
        });
        if (existingCategory) {
            console.log('Category with this name already exists for this admin:', existingCategory);
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }
        console.log('Creating category with data:', {
            name,
            description,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
        });
        const category = await prisma.category.create({
            data: {
                name,
                description: description || null,
                createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
            }
        });
        console.log('Category created successfully:', category);
        return res.status(201).json({
            success: true,
            data: category
        });
    }
    catch (error) {
        console.error('Create category error:', error);
        console.error('Error details:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createCategory = createCategory;
const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateCategorySchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingCategory = await prisma.category.findUnique({
            where: { id }
        });
        if (!existingCategory) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        if (updateData.name && updateData.name !== existingCategory.name) {
            const nameExists = await prisma.category.findFirst({
                where: {
                    name: updateData.name,
                    createdBy: req.user?.createdBy || req.user?.id
                }
            });
            if (nameExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists in this branch'
                });
            }
        }
        const category = await prisma.category.update({
            where: { id },
            data: updateData
        });
        return res.json({
            success: true,
            data: category
        });
    }
    catch (error) {
        console.error('Update category error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateCategory = updateCategory;
const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const category = await prisma.category.findUnique({
            where: { id },
            include: {
                _count: {
                    select: {
                        products: true
                    }
                }
            }
        });
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }
        if (category._count.products > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with existing products'
            });
        }
        await prisma.category.delete({
            where: { id }
        });
        return res.json({
            success: true,
            message: 'Category deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete category error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteCategory = deleteCategory;
//# sourceMappingURL=category.controller.js.map
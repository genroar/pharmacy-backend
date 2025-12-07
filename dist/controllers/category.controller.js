"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCategory = exports.updateCategory = exports.createCategory = exports.getCategory = exports.getCategories = void 0;
const db_util_1 = require("../utils/db.util");
const joi_1 = __importDefault(require("joi"));
const createCategorySchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    description: joi_1.default.string().allow('', null),
    type: joi_1.default.string().valid('MEDICAL', 'NON_MEDICAL', 'GENERAL').default('GENERAL'),
    color: joi_1.default.string().pattern(/^#[0-9A-Fa-f]{6}$/).default('#3B82F6'),
    branchId: joi_1.default.string().allow('', null).optional(),
    companyId: joi_1.default.string().allow('', null).optional()
});
const updateCategorySchema = joi_1.default.object({
    name: joi_1.default.string(),
    description: joi_1.default.string().allow(''),
    type: joi_1.default.string().valid('MEDICAL', 'NON_MEDICAL', 'GENERAL'),
    color: joi_1.default.string().pattern(/^#[0-9A-Fa-f]{6}$/)
});
const getCategories = async (req, res) => {
    try {
        const prisma = await (0, db_util_1.getPrisma)();
        const { page = 1, limit = 50, search = '', branchId = '' } = req.query;
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        const targetBranchId = branchId && typeof branchId === 'string' && branchId.trim() !== ''
            ? branchId
            : req.user?.selectedBranchId || req.user?.branchId;
        const targetCompanyId = req.user?.selectedCompanyId || req.user?.companyId;
        if (targetBranchId) {
            const branchConditions = [
                { branchId: targetBranchId }
            ];
            if (req.user?.role !== 'SUPERADMIN') {
                const userCreatedBy = req.user?.createdBy || req.user?.id;
                if (userCreatedBy) {
                    branchConditions.push({
                        AND: [
                            { branchId: null },
                            { createdBy: userCreatedBy }
                        ]
                    });
                }
            }
            where.OR = branchConditions;
        }
        else {
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
        }
        let finalWhere = { ...where };
        if (targetCompanyId) {
            if (finalWhere.OR) {
                finalWhere.AND = [
                    { OR: finalWhere.OR },
                    {
                        OR: [
                            { companyId: targetCompanyId },
                            { companyId: null }
                        ]
                    }
                ];
                delete finalWhere.OR;
            }
            else {
                finalWhere.OR = [
                    { companyId: targetCompanyId },
                    { companyId: null }
                ];
            }
        }
        if (targetBranchId && req.query.filterByProducts === 'true') {
            const categoriesWithProductsInBranch = await prisma.product.findMany({
                where: {
                    branchId: targetBranchId
                },
                select: {
                    categoryId: true
                },
                distinct: ['categoryId']
            });
            const categoryIds = categoriesWithProductsInBranch
                .map(p => p.categoryId)
                .filter((id) => typeof id === 'string' && id.trim() !== '');
            if (categoryIds.length > 0) {
                if (finalWhere.AND) {
                    finalWhere.AND.push({ id: { in: categoryIds } });
                }
                else {
                    finalWhere.id = { in: categoryIds };
                }
            }
            else {
                finalWhere.id = 'non-existent';
            }
        }
        if (search) {
            if (finalWhere.AND) {
                finalWhere.AND.push({
                    OR: [
                        { name: { contains: search } },
                        { description: { contains: search } }
                    ]
                });
            }
            else if (finalWhere.OR) {
                finalWhere = {
                    AND: [
                        { OR: finalWhere.OR },
                        {
                            OR: [
                                { name: { contains: search } },
                                { description: { contains: search } }
                            ]
                        }
                    ]
                };
            }
            else {
                finalWhere.OR = [
                    { name: { contains: search } },
                    { description: { contains: search } }
                ];
            }
        }
        console.log('🔍 Category query where clause:', JSON.stringify(finalWhere, null, 2));
        console.log('🔍 Target branchId:', targetBranchId);
        console.log('🔍 Target companyId:', targetCompanyId);
        const [categories, total] = await Promise.all([
            prisma.category.findMany({
                where: finalWhere,
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
            prisma.category.count({ where: finalWhere })
        ]);
        console.log('🔍 Found categories:', categories.length, 'out of', total);
        if (categories.length > 0) {
            console.log('🔍 First category:', { id: categories[0].id, name: categories[0].name, branchId: categories[0].branchId });
        }
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
        const prisma = await (0, db_util_1.getPrisma)();
        const { id } = req.params;
        const where = { id };
        const targetBranchId = req.user?.selectedBranchId || req.user?.branchId;
        const targetCompanyId = req.user?.selectedCompanyId || req.user?.companyId;
        if (targetBranchId) {
            where.branchId = targetBranchId;
        }
        else {
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
        }
        if (targetCompanyId) {
            where.companyId = targetCompanyId;
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
        const prisma = await (0, db_util_1.getPrisma)();
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
        const { name, description, type, color, branchId, companyId } = req.body;
        const headerBranchId = req.headers['x-branch-id'];
        const headerCompanyId = req.headers['x-company-id'];
        const userBranchId = req.user?.selectedBranchId || req.user?.branchId;
        const userCompanyId = req.user?.selectedCompanyId || req.user?.companyId;
        const categoryBranchId = (branchId && branchId.trim() !== '')
            ? branchId
            : (headerBranchId && headerBranchId.trim() !== '')
                ? headerBranchId
                : userBranchId;
        const categoryCompanyId = (companyId && companyId.trim() !== '')
            ? companyId
            : (headerCompanyId && headerCompanyId.trim() !== '')
                ? headerCompanyId
                : userCompanyId;
        console.log('Branch/Company resolution:', {
            providedBranchId: branchId,
            headerBranchId,
            userBranchId,
            resolvedBranchId: categoryBranchId,
            providedCompanyId: companyId,
            headerCompanyId,
            userCompanyId,
            resolvedCompanyId: categoryCompanyId
        });
        if (!categoryBranchId) {
            console.log('Category creation failed: No branchId provided');
            return res.status(400).json({
                success: false,
                message: 'Branch ID is required to create a category. Please ensure you are associated with a branch.'
            });
        }
        const where = {
            name: name,
            branchId: categoryBranchId
        };
        const existingCategory = await prisma.category.findFirst({
            where
        });
        if (existingCategory) {
            console.log('Category with this name already exists for this branch:', existingCategory);
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists in this branch'
            });
        }
        const data = {
            name,
            description: description || null,
            type: type || 'GENERAL',
            color: color || '#3B82F6',
            branchId: categoryBranchId,
            createdBy: req.user?.createdBy || req.user?.id || 'default-admin-id'
        };
        if (categoryCompanyId) {
            data.companyId = categoryCompanyId;
        }
        console.log('Creating category with data:', {
            name: data.name,
            branchId: data.branchId,
            companyId: data.companyId,
            createdBy: data.createdBy
        });
        const category = await prisma.category.create({
            data
        });
        console.log('Category created successfully:', {
            id: category.id,
            name: category.name,
            branchId: category.branchId,
            companyId: category.companyId
        });
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
        const prisma = await (0, db_util_1.getPrisma)();
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
            const targetBranchId = req.user?.selectedBranchId || req.user?.branchId || existingCategory.branchId;
            const nameExistsWhere = {
                name: updateData.name,
                id: { not: id }
            };
            if (targetBranchId) {
                nameExistsWhere.branchId = targetBranchId;
            }
            else {
                nameExistsWhere.createdBy = req.user?.createdBy || req.user?.id;
            }
            const nameExists = await prisma.category.findFirst({
                where: nameExistsWhere
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
        const prisma = await (0, db_util_1.getPrisma)();
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
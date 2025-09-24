"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEmployeeStats = exports.deleteEmployee = exports.updateEmployee = exports.createEmployee = exports.getEmployee = exports.getEmployees = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const createEmployeeSchema = joi_1.default.object({
    name: joi_1.default.string().required(),
    email: joi_1.default.string().email().required(),
    phone: joi_1.default.string().optional().allow(''),
    address: joi_1.default.string().optional().allow(''),
    position: joi_1.default.string().required(),
    department: joi_1.default.string().optional().allow(''),
    salary: joi_1.default.number().min(0).optional().allow(null, ''),
    hireDate: joi_1.default.string().required(),
    status: joi_1.default.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE').default('ACTIVE'),
    branchId: joi_1.default.string().required(),
    emergencyContactName: joi_1.default.string().optional().allow(''),
    emergencyContactPhone: joi_1.default.string().optional().allow(''),
    emergencyContactRelation: joi_1.default.string().optional().allow('')
});
const updateEmployeeSchema = joi_1.default.object({
    name: joi_1.default.string(),
    email: joi_1.default.string().email(),
    phone: joi_1.default.string().allow(''),
    address: joi_1.default.string().allow(''),
    position: joi_1.default.string(),
    department: joi_1.default.string().allow(''),
    salary: joi_1.default.number().min(0),
    hireDate: joi_1.default.string(),
    status: joi_1.default.string().valid('ACTIVE', 'INACTIVE', 'TERMINATED', 'ON_LEAVE'),
    branchId: joi_1.default.string(),
    emergencyContactName: joi_1.default.string().allow(''),
    emergencyContactPhone: joi_1.default.string().allow(''),
    emergencyContactRelation: joi_1.default.string().allow(''),
    isActive: joi_1.default.boolean()
});
const generateEmployeeId = async () => {
    const lastEmployee = await prisma.employee.findFirst({
        orderBy: { employeeId: 'desc' }
    });
    if (!lastEmployee) {
        return 'EMP001';
    }
    const lastNumber = parseInt(lastEmployee.employeeId.replace('EMP', ''));
    const newNumber = lastNumber + 1;
    return `EMP${newNumber.toString().padStart(3, '0')}`;
};
const getEmployees = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = '', branchId = '', isActive = true } = req.query;
        console.log('Getting employees with params:', { page, limit, search, status, branchId, isActive });
        const skip = (Number(page) - 1) * Number(limit);
        const take = Number(limit);
        const where = {};
        if (isActive !== 'all') {
            where.isActive = isActive === 'true';
        }
        if (branchId) {
            where.branchId = branchId;
        }
        console.log('Where clause:', where);
        if (status) {
            where.status = status;
        }
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { employeeId: { contains: search, mode: 'insensitive' } },
                { position: { contains: search, mode: 'insensitive' } }
            ];
        }
        const [employees, total] = await Promise.all([
            prisma.employee.findMany({
                where,
                skip,
                take,
                include: {
                    branch: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            }),
            prisma.employee.count({ where })
        ]);
        console.log('Found employees:', employees.length, 'Total:', total);
        return res.json({
            success: true,
            data: {
                employees,
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
        console.error('Error fetching employees:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getEmployees = getEmployees;
const getEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const employee = await prisma.employee.findUnique({
            where: { id },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        return res.json({
            success: true,
            data: employee
        });
    }
    catch (error) {
        console.error('Error fetching employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getEmployee = getEmployee;
const createEmployee = async (req, res) => {
    try {
        console.log('Creating employee with data:', req.body);
        const { error } = createEmployeeSchema.validate(req.body);
        if (error) {
            console.log('Validation error:', error.details);
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const employeeData = req.body;
        const existingEmployee = await prisma.employee.findUnique({
            where: { email: employeeData.email }
        });
        if (existingEmployee) {
            return res.status(400).json({
                success: false,
                message: 'Employee with this email already exists'
            });
        }
        const branch = await prisma.branch.findUnique({
            where: { id: employeeData.branchId }
        });
        if (!branch) {
            return res.status(400).json({
                success: false,
                message: 'Branch not found'
            });
        }
        const employeeId = await generateEmployeeId();
        const employee = await prisma.employee.create({
            data: {
                ...employeeData,
                employeeId,
                hireDate: new Date(employeeData.hireDate),
                salary: employeeData.salary && employeeData.salary > 0 ? employeeData.salary : null
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
        return res.status(201).json({
            success: true,
            data: employee,
            message: 'Employee created successfully'
        });
    }
    catch (error) {
        console.error('Error creating employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.createEmployee = createEmployee;
const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = updateEmployeeSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
        }
        const updateData = req.body;
        const existingEmployee = await prisma.employee.findUnique({
            where: { id }
        });
        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        if (updateData.email && updateData.email !== existingEmployee.email) {
            const emailExists = await prisma.employee.findUnique({
                where: { email: updateData.email }
            });
            if (emailExists) {
                return res.status(400).json({
                    success: false,
                    message: 'Employee with this email already exists'
                });
            }
        }
        if (updateData.branchId && updateData.branchId !== existingEmployee.branchId) {
            const branch = await prisma.branch.findUnique({
                where: { id: updateData.branchId }
            });
            if (!branch) {
                return res.status(400).json({
                    success: false,
                    message: 'Branch not found'
                });
            }
        }
        const employee = await prisma.employee.update({
            where: { id },
            data: {
                ...updateData,
                hireDate: updateData.hireDate ? new Date(updateData.hireDate) : undefined
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
        return res.json({
            success: true,
            data: employee,
            message: 'Employee updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateEmployee = updateEmployee;
const deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const existingEmployee = await prisma.employee.findUnique({
            where: { id }
        });
        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found'
            });
        }
        await prisma.employee.update({
            where: { id },
            data: { isActive: false }
        });
        return res.json({
            success: true,
            message: 'Employee deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting employee:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deleteEmployee = deleteEmployee;
const getEmployeeStats = async (req, res) => {
    try {
        const { branchId } = req.query;
        const where = { isActive: true };
        if (branchId) {
            where.branchId = branchId;
        }
        const [totalEmployees, activeEmployees, inactiveEmployees, terminatedEmployees, onLeaveEmployees] = await Promise.all([
            prisma.employee.count({ where }),
            prisma.employee.count({ where: { ...where, status: 'ACTIVE' } }),
            prisma.employee.count({ where: { ...where, status: 'INACTIVE' } }),
            prisma.employee.count({ where: { ...where, status: 'TERMINATED' } }),
            prisma.employee.count({ where: { ...where, status: 'ON_LEAVE' } })
        ]);
        return res.json({
            success: true,
            data: {
                totalEmployees,
                activeEmployees,
                inactiveEmployees,
                terminatedEmployees,
                onLeaveEmployees
            }
        });
    }
    catch (error) {
        console.error('Error fetching employee stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getEmployeeStats = getEmployeeStats;
//# sourceMappingURL=employee.controller.js.map
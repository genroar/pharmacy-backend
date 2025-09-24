"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTaxRate = exports.updateSettings = exports.getSettings = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const updateSettingsSchema = joi_1.default.object({
    defaultTax: joi_1.default.number().min(0).max(100).required(),
    lowStockAlert: joi_1.default.number().min(0).required(),
    expiryAlert: joi_1.default.number().min(0).required(),
    autoSync: joi_1.default.boolean().required(),
    offlineMode: joi_1.default.boolean().required(),
    receiptPrinter: joi_1.default.string().required(),
    pharmacyName: joi_1.default.string().required(),
    pharmacyAddress: joi_1.default.string().required(),
    pharmacyPhone: joi_1.default.string().required(),
    pharmacyEmail: joi_1.default.string().email().required(),
    pharmacyLicense: joi_1.default.string().required(),
    pharmacyTaxNumber: joi_1.default.string().required()
});
const getSettings = async (req, res) => {
    try {
        const createdBy = req.user?.createdBy || req.user?.id;
        if (!createdBy) {
            res.status(401).json({
                success: false,
                message: 'Admin ID not found'
            });
            return;
        }
        const settings = await prisma.settings.findMany({
            where: { createdBy },
            select: {
                key: true,
                value: true,
                description: true
            }
        });
        const settingsObj = {};
        settings.forEach(setting => {
            settingsObj[setting.key] = setting.value;
        });
        const defaultSettings = {
            defaultTax: settingsObj.defaultTax || '17',
            lowStockAlert: settingsObj.lowStockAlert || '20',
            expiryAlert: settingsObj.expiryAlert || '30',
            autoSync: settingsObj.autoSync || 'true',
            offlineMode: settingsObj.offlineMode || 'true',
            receiptPrinter: settingsObj.receiptPrinter || 'EPSON TM-T20II',
            pharmacyName: settingsObj.pharmacyName || 'Al-Shifa Pharmacy',
            pharmacyAddress: settingsObj.pharmacyAddress || 'Block A, Gulberg III, Lahore',
            pharmacyPhone: settingsObj.pharmacyPhone || '+92 42 1234567',
            pharmacyEmail: settingsObj.pharmacyEmail || 'info@alshifapharmacy.com',
            pharmacyLicense: settingsObj.pharmacyLicense || 'PHR-LHR-2024-001',
            pharmacyTaxNumber: settingsObj.pharmacyTaxNumber || '1234567890123'
        };
        res.json({
            success: true,
            data: defaultSettings
        });
    }
    catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSettings = getSettings;
const updateSettings = async (req, res) => {
    try {
        const createdBy = req.user?.createdBy || req.user?.id;
        if (!createdBy) {
            res.status(401).json({
                success: false,
                message: 'Admin ID not found'
            });
            return;
        }
        const { error } = updateSettingsSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const settingsData = req.body;
        await prisma.$transaction(async (tx) => {
            for (const [key, value] of Object.entries(settingsData)) {
                await tx.settings.upsert({
                    where: {
                        createdBy_key: {
                            createdBy,
                            key
                        }
                    },
                    update: {
                        value: String(value),
                        updatedAt: new Date()
                    },
                    create: {
                        createdBy,
                        key,
                        value: String(value),
                        description: getSettingDescription(key)
                    }
                });
            }
        });
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    }
    catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateSettings = updateSettings;
const getTaxRate = async (req, res) => {
    try {
        const createdBy = req.user?.createdBy || req.user?.id;
        if (!createdBy) {
            res.status(401).json({
                success: false,
                message: 'Admin ID not found'
            });
            return;
        }
        const taxSetting = await prisma.settings.findUnique({
            where: {
                createdBy_key: {
                    createdBy,
                    key: 'defaultTax'
                }
            }
        });
        const taxRate = taxSetting ? parseFloat(taxSetting.value) : 17;
        res.json({
            success: true,
            data: {
                taxRate
            }
        });
    }
    catch (error) {
        console.error('Get tax rate error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getTaxRate = getTaxRate;
function getSettingDescription(key) {
    const descriptions = {
        defaultTax: 'Default tax rate percentage for sales',
        lowStockAlert: 'Minimum stock level to trigger low stock alert',
        expiryAlert: 'Days before expiry to trigger alert',
        autoSync: 'Automatically sync data when online',
        offlineMode: 'Allow operations without internet connection',
        receiptPrinter: 'Default receipt printer model',
        pharmacyName: 'Pharmacy business name',
        pharmacyAddress: 'Pharmacy business address',
        pharmacyPhone: 'Pharmacy contact phone number',
        pharmacyEmail: 'Pharmacy contact email address',
        pharmacyLicense: 'Pharmacy license number',
        pharmacyTaxNumber: 'Pharmacy tax registration number'
    };
    return descriptions[key] || 'System setting';
}
//# sourceMappingURL=settings.controller.js.map
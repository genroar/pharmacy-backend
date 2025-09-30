"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadInvoice = exports.getPaymentMethods = exports.processPayment = exports.getBillingHistory = exports.deletePaymentMethod = exports.setDefaultPaymentMethod = exports.addPaymentMethod = exports.updateSubscription = exports.getSubscription = void 0;
const client_1 = require("@prisma/client");
const joi_1 = __importDefault(require("joi"));
const prisma = new client_1.PrismaClient();
const updateSubscriptionSchema = joi_1.default.object({
    plan: joi_1.default.string().valid('basic', 'premium', 'enterprise'),
    autoRenew: joi_1.default.boolean()
});
const addPaymentMethodSchema = joi_1.default.object({
    type: joi_1.default.string().valid('card', 'bank', 'mobile').required(),
    last4: joi_1.default.string().length(4).required(),
    brand: joi_1.default.string().required(),
    expiryMonth: joi_1.default.number().min(1).max(12).required(),
    expiryYear: joi_1.default.number().min(new Date().getFullYear()).required(),
    holderName: joi_1.default.string().required(),
    isDefault: joi_1.default.boolean().default(false)
});
const getSubscription = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                branch: {
                    select: {
                        id: true,
                        name: true
                    }
                }
            }
        });
        if (!user) {
            res.status(404).json({
                success: false,
                message: 'User not found'
            });
            return;
        }
        const subscription = {
            id: `sub_${userId}`,
            plan: 'premium',
            status: 'active',
            startDate: '2024-01-15',
            endDate: '2024-12-15',
            amount: 10000,
            billingCycle: 'monthly',
            autoRenew: true,
            remainingDays: 45,
            features: [
                'Up to 50 users',
                '3 branches',
                'Advanced reporting',
                'Priority support',
                'API access'
            ]
        };
        res.json({
            success: true,
            data: subscription
        });
    }
    catch (error) {
        console.error('Get subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getSubscription = getSubscription;
const updateSubscription = async (req, res) => {
    try {
        const { error } = updateSubscriptionSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const userId = req.user?.id;
        const { plan, autoRenew } = req.body;
        res.json({
            success: true,
            message: 'Subscription updated successfully',
            data: {
                plan,
                autoRenew,
                updatedAt: new Date().toISOString()
            }
        });
    }
    catch (error) {
        console.error('Update subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.updateSubscription = updateSubscription;
const addPaymentMethod = async (req, res) => {
    try {
        const { error } = addPaymentMethodSchema.validate(req.body);
        if (error) {
            res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: error.details.map(detail => detail.message)
            });
            return;
        }
        const userId = req.user?.id;
        const paymentMethodData = req.body;
        const newPaymentMethod = {
            id: `pm_${Date.now()}`,
            ...paymentMethodData,
            createdAt: new Date().toISOString()
        };
        res.status(201).json({
            success: true,
            message: 'Payment method added successfully',
            data: newPaymentMethod
        });
    }
    catch (error) {
        console.error('Add payment method error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.addPaymentMethod = addPaymentMethod;
const setDefaultPaymentMethod = async (req, res) => {
    try {
        const { methodId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        res.json({
            success: true,
            message: 'Default payment method updated successfully'
        });
    }
    catch (error) {
        console.error('Set default payment method error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.setDefaultPaymentMethod = setDefaultPaymentMethod;
const deletePaymentMethod = async (req, res) => {
    try {
        const { methodId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        res.json({
            success: true,
            message: 'Payment method deleted successfully'
        });
    }
    catch (error) {
        console.error('Delete payment method error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.deletePaymentMethod = deletePaymentMethod;
const getBillingHistory = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        const billingHistory = [
            {
                id: 'inv_1',
                amount: 10000,
                status: 'success',
                method: 'Visa ****4242',
                date: '2024-01-15',
                invoiceNumber: 'INV-2024-001',
                description: 'Premium Plan - Monthly'
            },
            {
                id: 'inv_2',
                amount: 10000,
                status: 'success',
                method: 'Visa ****4242',
                date: '2023-12-15',
                invoiceNumber: 'INV-2023-012',
                description: 'Premium Plan - Monthly'
            },
            {
                id: 'inv_3',
                amount: 10000,
                status: 'failed',
                method: 'Mastercard ****5555',
                date: '2023-11-15',
                invoiceNumber: 'INV-2023-011',
                description: 'Premium Plan - Monthly'
            }
        ];
        res.json({
            success: true,
            data: billingHistory
        });
    }
    catch (error) {
        console.error('Get billing history error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getBillingHistory = getBillingHistory;
const processPayment = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { method, phoneNumber, amount, transactionId } = req.body;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        if (!method || !phoneNumber || !amount) {
            res.status(400).json({
                success: false,
                message: 'Missing required payment information'
            });
            return;
        }
        const paymentRecord = {
            id: `pay_${Date.now()}`,
            userId,
            method,
            phoneNumber,
            amount,
            transactionId: transactionId || `TXN_${Date.now()}`,
            status: 'completed',
            createdAt: new Date().toISOString(),
            plan: 'premium'
        };
        res.json({
            success: true,
            message: 'Payment processed successfully',
            data: {
                paymentId: paymentRecord.id,
                transactionId: paymentRecord.transactionId,
                amount: paymentRecord.amount,
                method: paymentRecord.method,
                status: 'completed',
                subscription: {
                    plan: 'premium',
                    status: 'active',
                    startDate: new Date().toISOString(),
                    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }
            }
        });
    }
    catch (error) {
        console.error('Process payment error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.processPayment = processPayment;
const getPaymentMethods = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        const paymentMethods = [
            {
                id: 'easypaisa',
                name: 'EasyPaisa',
                type: 'mobile',
                icon: 'smartphone',
                description: 'Pay using your EasyPaisa account',
                features: ['Instant payment', 'Secure', 'Easy to use'],
                instructions: [
                    'Open EasyPaisa app',
                    'Go to Send Money',
                    'Enter amount and recipient',
                    'Complete transaction'
                ]
            },
            {
                id: 'jazzcash',
                name: 'JazzCash',
                type: 'mobile',
                icon: 'smartphone',
                description: 'Pay using your JazzCash account',
                features: ['Quick payment', 'Reliable', 'Bank-level security'],
                instructions: [
                    'Open JazzCash app',
                    'Go to Send Money',
                    'Enter amount and recipient',
                    'Complete transaction'
                ]
            },
            {
                id: 'bank_transfer',
                name: 'Bank Transfer',
                type: 'bank',
                icon: 'building',
                description: 'Traditional bank transfer',
                features: ['Secure', 'Traditional', 'Bank guarantee'],
                instructions: [
                    'Transfer to provided account',
                    'Use reference number',
                    'Upload receipt',
                    'Wait for confirmation'
                ]
            }
        ];
        res.json({
            success: true,
            data: paymentMethods
        });
    }
    catch (error) {
        console.error('Get payment methods error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.getPaymentMethods = getPaymentMethods;
const downloadInvoice = async (req, res) => {
    try {
        const { invoiceId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
            return;
        }
        res.json({
            success: true,
            message: 'Invoice download initiated',
            data: {
                invoiceId,
                downloadUrl: `/api/subscription/invoices/${invoiceId}/download`
            }
        });
    }
    catch (error) {
        console.error('Download invoice error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};
exports.downloadInvoice = downloadInvoice;
//# sourceMappingURL=subscription.controller.js.map
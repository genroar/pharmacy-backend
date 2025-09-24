"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyInventoryChange = exports.notifyCustomerChange = exports.notifyRefundChange = exports.notifySaleChange = exports.notifyProductChange = exports.notifyAdminGroup = exports.notifyUserReactivation = exports.notifyUserDeactivation = void 0;
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const activeConnections = new Map();
const adminConnections = new Map();
const authenticateSSE = async (req) => {
    try {
        const token = req.query.token;
        if (!token) {
            return null;
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await prisma.user.findUnique({
            where: { id: decoded.userId },
            select: {
                id: true,
                username: true,
                role: true,
                branchId: true,
                createdBy: true,
                isActive: true
            }
        });
        if (!user || !user.isActive) {
            return null;
        }
        let createdBy = user.createdBy;
        if (user.role === 'ADMIN' && (!createdBy || createdBy === '')) {
            createdBy = user.id;
        }
        return {
            userId: user.id,
            createdBy: createdBy || user.id
        };
    }
    catch (error) {
        console.error('SSE authentication error:', error);
        return null;
    }
};
router.get('/events', async (req, res) => {
    const auth = await authenticateSSE(req);
    if (!auth) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    const { userId, createdBy } = auth;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });
    activeConnections.set(userId, res);
    if (createdBy) {
        if (!adminConnections.has(createdBy)) {
            adminConnections.set(createdBy, new Set());
        }
        adminConnections.get(createdBy).add(userId);
    }
    res.write(`data: ${JSON.stringify({ type: 'connected', message: 'Connected to real-time updates' })}\n\n`);
    req.on('close', () => {
        activeConnections.delete(userId);
        if (createdBy && adminConnections.has(createdBy)) {
            adminConnections.get(createdBy).delete(userId);
            if (adminConnections.get(createdBy).size === 0) {
                adminConnections.delete(createdBy);
            }
        }
        console.log(`SSE connection closed for user ${userId}`);
    });
    const keepAlive = setInterval(() => {
        if (activeConnections.has(userId)) {
            res.write(`data: ${JSON.stringify({ type: 'ping' })}\n\n`);
        }
        else {
            clearInterval(keepAlive);
        }
    }, 30000);
});
const notifyUserDeactivation = (userId) => {
    const connection = activeConnections.get(userId);
    if (connection) {
        try {
            connection.write(`data: ${JSON.stringify({
                type: 'account_deactivated',
                message: 'Your account has been deactivated by Super Admin',
                timestamp: new Date().toISOString()
            })}\n\n`);
            console.log(`Notified user ${userId} of account deactivation`);
        }
        catch (error) {
            console.error('Error sending deactivation notification:', error);
            activeConnections.delete(userId);
        }
    }
};
exports.notifyUserDeactivation = notifyUserDeactivation;
const notifyUserReactivation = (userId) => {
    const connection = activeConnections.get(userId);
    if (connection) {
        try {
            connection.write(`data: ${JSON.stringify({
                type: 'account_reactivated',
                message: 'Your account has been reactivated by Super Admin',
                timestamp: new Date().toISOString()
            })}\n\n`);
            console.log(`Notified user ${userId} of account reactivation`);
        }
        catch (error) {
            console.error('Error sending reactivation notification:', error);
            activeConnections.delete(userId);
        }
    }
};
exports.notifyUserReactivation = notifyUserReactivation;
const notifyAdminGroup = (createdBy, eventType, data) => {
    const userConnections = adminConnections.get(createdBy);
    if (userConnections) {
        userConnections.forEach(userId => {
            const connection = activeConnections.get(userId);
            if (connection) {
                try {
                    connection.write(`data: ${JSON.stringify({
                        type: eventType,
                        data: data,
                        timestamp: new Date().toISOString()
                    })}\n\n`);
                    console.log(`Notified user ${userId} of ${eventType}`);
                }
                catch (error) {
                    console.error(`Error sending ${eventType} notification to user ${userId}:`, error);
                    activeConnections.delete(userId);
                    userConnections.delete(userId);
                }
            }
        });
    }
};
exports.notifyAdminGroup = notifyAdminGroup;
const notifyProductChange = (createdBy, action, product) => {
    (0, exports.notifyAdminGroup)(createdBy, 'product_change', {
        action,
        product,
        message: `Product ${action}: ${product.name}`
    });
};
exports.notifyProductChange = notifyProductChange;
const notifySaleChange = (createdBy, action, sale) => {
    (0, exports.notifyAdminGroup)(createdBy, 'sale_change', {
        action,
        sale,
        message: `Sale ${action}: ${sale.id}`
    });
};
exports.notifySaleChange = notifySaleChange;
const notifyRefundChange = (createdBy, action, refund) => {
    (0, exports.notifyAdminGroup)(createdBy, 'refund_change', {
        action,
        refund,
        message: `Refund ${action}: ${refund.id}`
    });
};
exports.notifyRefundChange = notifyRefundChange;
const notifyCustomerChange = (createdBy, action, customer) => {
    (0, exports.notifyAdminGroup)(createdBy, 'customer_change', {
        action,
        customer,
        message: `Customer ${action}: ${customer.name}`
    });
};
exports.notifyCustomerChange = notifyCustomerChange;
const notifyInventoryChange = (createdBy, action, data) => {
    (0, exports.notifyAdminGroup)(createdBy, 'inventory_change', {
        action,
        data,
        message: `Inventory ${action}: ${data.productName || data.name || 'Unknown'}`
    });
};
exports.notifyInventoryChange = notifyInventoryChange;
exports.default = router;
//# sourceMappingURL=sse.routes.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const branch_routes_1 = __importDefault(require("./routes/branch.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const sale_routes_1 = __importDefault(require("./routes/sale.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const supplier_routes_1 = __importDefault(require("./routes/supplier.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const shift_routes_1 = __importDefault(require("./routes/shift.routes"));
const commission_routes_1 = __importDefault(require("./routes/commission.routes"));
const role_routes_1 = __importDefault(require("./routes/role.routes"));
const refund_routes_1 = __importDefault(require("./routes/refund.routes"));
const subscription_routes_1 = __importDefault(require("./routes/subscription.routes"));
const sse_routes_1 = __importDefault(require("./routes/sse.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const error_middleware_1 = require("./middleware/error.middleware");
const notFound_middleware_1 = require("./middleware/notFound.middleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
async function testDatabaseConnection() {
    try {
        console.log('='.repeat(60));
        console.log('🔍 CHECKING DATABASE CONNECTION STATUS');
        console.log('='.repeat(60));
        console.log('📊 Database URL:', process.env.DATABASE_URL);
        console.log('⏳ Attempting to connect...');
        await prisma.$connect();
        const result = await prisma.$queryRaw `SELECT NOW() as current_time, current_database() as db_name`;
        console.log('='.repeat(60));
        console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
        console.log('='.repeat(60));
        console.log('📋 Database Name:', result[0].db_name);
        console.log('🕐 Connection Time:', result[0].current_time);
        console.log('🔗 Status: CONNECTED');
        console.log('='.repeat(60));
        return true;
    }
    catch (error) {
        console.log('='.repeat(60));
        console.log('❌ DATABASE CONNECTION: FAILED');
        console.log('='.repeat(60));
        console.log('🚨 Error:', error.message);
        console.log('🔗 Status: NOT CONNECTED');
        console.log('='.repeat(60));
        return false;
    }
}
app.use((0, helmet_1.default)());
const corsOptions = {
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
                'http://localhost:8080',
                'http://localhost:8081',
                'http://localhost:3000',
                'http://127.0.0.1:8080',
                'http://127.0.0.1:8081',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:3000'
            ])
        ];
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 200
};
app.use((0, cors_1.default)(corsOptions));
app.options('*', (0, cors_1.default)(corsOptions));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/', limiter);
app.use(express_1.default.json({ limit: process.env.MAX_FILE_SIZE || '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '10mb' }));
app.use((0, compression_1.default)());
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
    if (process.env.NODE_ENV === 'development') {
        app.use((0, morgan_1.default)('dev'));
    }
    else {
        app.use((0, morgan_1.default)('combined'));
    }
}
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/branches', branch_routes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/customers', customer_routes_1.default);
app.use('/api/sales', sale_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/suppliers', supplier_routes_1.default);
app.use('/api/employees', employee_routes_1.default);
app.use('/api/attendance', attendance_routes_1.default);
app.use('/api/shifts', shift_routes_1.default);
app.use('/api/commissions', commission_routes_1.default);
app.use('/api/roles', role_routes_1.default);
app.use('/api/refunds', refund_routes_1.default);
app.use('/api/subscription', subscription_routes_1.default);
app.use('/api/sse', sse_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use(notFound_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});
const PORT = process.env.PORT || 5000;
async function startServer() {
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
        console.log('⚠️  Server starting with database connection issues...');
        console.log('💡 Please check your database configuration');
    }
    app.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log('🚀 MEDIBILL PULSE BACKEND SERVER STARTED');
        console.log('='.repeat(60));
        console.log(`🌐 Server running on port: ${PORT}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV}`);
        console.log(`🔗 Health check: http://localhost:${PORT}/health`);
        console.log(`📋 API Base URL: http://localhost:${PORT}/api`);
        console.log('='.repeat(60));
    });
}
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map
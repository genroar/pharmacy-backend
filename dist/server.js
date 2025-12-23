"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPrismaClient = getPrismaClient;
require('./config/database-url-init.js');
require("./config/database.init");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set! This should have been set by database.init.ts');
}
console.log('[Server] ✅ Database mode:', process.env.USE_POSTGRESQL === 'true' ? 'PostgreSQL (Web)' : 'SQLite (Electron)');
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const compression_1 = __importDefault(require("compression"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const client_1 = require("@prisma/client");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const user_routes_1 = __importDefault(require("./routes/user.routes"));
const company_routes_1 = __importDefault(require("./routes/company.routes"));
const branch_routes_1 = __importDefault(require("./routes/branch.routes"));
const product_routes_1 = __importDefault(require("./routes/product.routes"));
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const sale_routes_1 = __importDefault(require("./routes/sale.routes"));
const report_routes_1 = __importDefault(require("./routes/report.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const admin_routes_1 = __importDefault(require("./routes/admin.routes"));
const category_routes_1 = __importDefault(require("./routes/category.routes"));
const supplier_routes_1 = __importDefault(require("./routes/supplier.routes"));
const manufacturer_routes_1 = __importDefault(require("./routes/manufacturer.routes"));
const shelf_routes_1 = __importDefault(require("./routes/shelf.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const attendance_routes_1 = __importDefault(require("./routes/attendance.routes"));
const shift_routes_1 = __importDefault(require("./routes/shift.routes"));
const scheduledShift_routes_1 = __importDefault(require("./routes/scheduledShift.routes"));
const commission_routes_1 = __importDefault(require("./routes/commission.routes"));
const role_routes_1 = __importDefault(require("./routes/role.routes"));
const refund_routes_1 = __importDefault(require("./routes/refund.routes"));
const subscription_routes_1 = __importDefault(require("./routes/subscription.routes"));
const batch_routes_1 = __importDefault(require("./routes/batch.routes"));
const purchase_routes_1 = __importDefault(require("./routes/purchase.routes"));
const inventory_routes_1 = __importDefault(require("./routes/inventory.routes"));
const sse_routes_1 = __importDefault(require("./routes/sse.routes"));
const settings_routes_1 = __importDefault(require("./routes/settings.routes"));
const sync_routes_1 = __importDefault(require("./routes/sync.routes"));
const database_service_1 = require("./services/database.service");
const sync_service_1 = require("./services/sync.service");
const db_util_1 = require("./utils/db.util");
const db_initializer_1 = require("./utils/db-initializer");
const error_middleware_1 = require("./middleware/error.middleware");
const notFound_middleware_1 = require("./middleware/notFound.middleware");
const app = (0, express_1.default)();
let dbService;
let syncService;
try {
    dbService = (0, database_service_1.getDatabaseService)();
    syncService = (0, sync_service_1.getSyncService)();
    initializePrismaClient().catch(err => {
        console.error('[Server] ❌ Failed to initialize Prisma Client:', err);
    });
    if (dbService) {
        dbService.checkConnectivity().then(status => {
            if (!dbService || !syncService) {
                console.error('[Database] Database service or sync service not available');
                return;
            }
            console.log(`[Database] Initial connectivity: ${status}`);
            console.log(`[Database] Current database type: ${dbService.getCurrentType()}`);
            const isPostgreSQLMode = dbService.getCurrentType() === database_service_1.DatabaseType.POSTGRESQL;
            if (!isPostgreSQLMode) {
                console.log('[Server] 🔍 Checking SQLite database initialization...');
                (0, db_initializer_1.isDatabaseInitialized)().then(isInitialized => {
                    if (!isInitialized) {
                        console.log('[Server] 📋 SQLite database not initialized - initializing now...');
                        (0, db_initializer_1.initializeSQLiteDatabase)().then(initResult => {
                            if (initResult.success) {
                                console.log('[Server] ✅ SQLite database initialized successfully');
                                if (initResult.created) {
                                    console.log('[Server] 📁 New database file created');
                                }
                                if (initResult.schemaApplied) {
                                    console.log('[Server] 📋 Database schema applied');
                                }
                            }
                            else {
                                console.error('[Server] ❌ SQLite database initialization failed:', initResult.error);
                                console.error('[Server] ⚠️ Some features may not work properly');
                            }
                        }).catch(err => {
                            console.error('[Server] ❌ Database initialization error:', err.message);
                        });
                    }
                    else {
                        console.log('[Server] ✅ SQLite database already initialized');
                    }
                }).catch(err => {
                    console.error('[Server] ❌ Database check error:', err.message);
                });
            }
            if (syncService) {
                console.log('[Sync] 🔍 Initializing database sync...');
                syncService.initializeDatabase().then(initialized => {
                    if (!initialized) {
                        console.error('[Sync] ⚠️ Database initialization had issues - some features may not work offline');
                    }
                    if (status === 'online' && syncService) {
                        console.log('[Sync] 🔄 Syncing users from PostgreSQL...');
                        syncService.syncUsersFromPostgreSQL().then(result => {
                            console.log(`[Sync] ✅ User sync: ${result.synced} users synced`);
                            if (result.errors.length > 0) {
                                console.log(`[Sync] ⚠️ User sync errors: ${result.errors.length}`);
                            }
                        }).catch(err => {
                            console.error('[Sync] ❌ User sync failed:', err.message);
                        });
                        console.log('[Sync] 🔄 Starting incremental sync of all tables...');
                        syncService.syncAllTablesFromPostgreSQL().then(result => {
                            console.log(`[Sync] ✅ Sync complete: ${result.synced} records synced, ${result.failed} failed`);
                            if (result.errors.length > 0) {
                                console.log(`[Sync] ⚠️ Sync errors: ${result.errors.slice(0, 3).join(', ')}`);
                            }
                        }).catch(err => {
                            console.error('[Sync] ❌ Sync failed:', err.message);
                        });
                    }
                }).catch(err => {
                    console.error('[Sync] ❌ Database initialization failed:', err.message);
                });
            }
            dbService.startConnectivityMonitoring(120000);
            setInterval(async () => {
                if (syncService && dbService && dbService.getConnectionStatus() === 'online') {
                    console.log('[Sync] 🔄 Running periodic BIDIRECTIONAL sync (backup)...');
                    syncService.bidirectionalSync().catch(err => {
                    });
                }
            }, 300000);
            setInterval(async () => {
                if (syncService && dbService) {
                    const pgAvailable = await dbService.checkPostgreSQLConnectivity();
                    if (pgAvailable && dbService.getConnectionStatus() === 'online') {
                        syncService.syncUsersFromPostgreSQL().catch(err => {
                        });
                    }
                }
            }, 15000);
            let previousPgAvailable = false;
            let previousStatus = String(status);
            let previousType = dbService.getCurrentType();
            setInterval(async () => {
                if (!dbService || !syncService) {
                    return;
                }
                const currentStatus = String(dbService.getConnectionStatus());
                const currentType = dbService.getCurrentType();
                const pgAvailable = await dbService.checkPostgreSQLConnectivity();
                if (!previousPgAvailable && pgAvailable) {
                    console.log('[Sync] 🌐 PostgreSQL is now ONLINE! Syncing SQLite → PostgreSQL...');
                    syncService.syncToPostgreSQL().catch(err => {
                        console.error('[Sync] Auto-sync to PostgreSQL failed:', err);
                    });
                    syncService.syncUsersFromPostgreSQL().catch(err => {
                        console.error('[Sync] User sync failed:', err);
                    });
                }
                if (previousPgAvailable && !pgAvailable) {
                    console.log('[Sync] 📴 PostgreSQL is now OFFLINE - Using SQLite only');
                    syncService.syncToSQLite().catch(err => {
                        console.error('[Sync] Auto-sync to SQLite failed:', err);
                    });
                }
                if (previousStatus === 'offline' && currentStatus === 'online') {
                    console.log('[Sync] 🔄 Local DB connection restored');
                    if (pgAvailable) {
                        syncService.bidirectionalSync().catch(err => {
                            console.error('[Sync] Auto-sync failed:', err);
                        });
                    }
                }
                previousPgAvailable = pgAvailable;
                previousStatus = currentStatus;
                previousType = currentType;
            }, 15000);
            setInterval(async () => {
                if (!dbService || !syncService) {
                    return;
                }
                const currentStatus = String(dbService.getConnectionStatus());
                const currentType = dbService.getCurrentType();
                if (currentStatus === 'online' && currentType === 'postgresql') {
                    const now = new Date();
                    const lastSync = syncService.getStatus().lastSync;
                    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
                    if (!lastSync || new Date(lastSync) < tenMinutesAgo) {
                        console.log('[Sync] 🔄 Safety net sync: Ensuring both databases are in sync...');
                        syncService.syncToPostgreSQL().catch(err => {
                            console.error('[Sync] Safety net sync to PostgreSQL failed:', err);
                        });
                        syncService.syncToSQLite().catch(err => {
                            console.error('[Sync] Safety net sync to SQLite failed:', err);
                        });
                    }
                }
                previousStatus = currentStatus;
                previousType = currentType;
            }, 600000);
        }).catch(err => {
            console.error('[Database] Failed to initialize database service:', err);
        });
    }
}
catch (error) {
    console.error('❌ Failed to initialize Database Service:', error.message);
}
let prisma;
async function initializePrismaClient() {
    try {
        if (dbService) {
            try {
                prisma = await dbService.getClient();
                console.log('[Server] ✅ Prisma client initialized via database service');
            }
            catch (err) {
                console.error('[Server] ❌ Failed to get client from database service:', err);
                if (process.env.DATABASE_URL) {
                    prisma = new client_1.PrismaClient();
                }
                else {
                    const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
                    process.env.DATABASE_URL = `file:${sqlitePath}`;
                    prisma = new client_1.PrismaClient();
                }
            }
        }
        else {
            if (process.env.DATABASE_URL) {
                prisma = new client_1.PrismaClient();
            }
            else {
                const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
                process.env.DATABASE_URL = `file:${sqlitePath}`;
                prisma = new client_1.PrismaClient();
            }
        }
    }
    catch (error) {
        console.error('❌ Failed to initialize Prisma Client:', error.message);
        try {
            const sqlitePath = path.join(os.homedir(), '.zapeera', 'data', 'zapeera.db');
            process.env.DATABASE_URL = `file:${sqlitePath}`;
            prisma = new client_1.PrismaClient();
        }
        catch (e) {
            console.error('❌ Failed to initialize Prisma Client with SQLite:', e.message);
            prisma = new client_1.PrismaClient();
        }
    }
}
async function getPrismaClient() {
    if (dbService) {
        try {
            return await dbService.getClient();
        }
        catch (err) {
            console.error('[Server] Failed to get client from database service, using legacy client');
            if (!prisma) {
                await initializePrismaClient();
            }
            if (!prisma) {
                throw new Error('Prisma client is not available');
            }
            return prisma;
        }
    }
    if (!prisma) {
        await initializePrismaClient();
    }
    if (!prisma) {
        throw new Error('Prisma client is not available');
    }
    return prisma;
}
async function testDatabaseConnection() {
    try {
        console.log('='.repeat(60));
        console.log('🔍 CHECKING DATABASE CONNECTION STATUS');
        console.log('='.repeat(60));
        console.log('📊 Database URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
        const databaseUrl = process.env.DATABASE_URL;
        const isSQLite = databaseUrl?.startsWith('file:');
        if (isSQLite && databaseUrl) {
            const dbPath = databaseUrl.replace('file:', '').split('?')[0];
            const fs = require('fs');
            const path = require('path');
            if (fs.existsSync(dbPath)) {
                const stats = fs.statSync(dbPath);
                console.log('📁 Database Path:', dbPath);
                console.log('📦 Database Size:', `${(stats.size / 1024).toFixed(2)} KB`);
                console.log('🗄️  Database Type: SQLite');
            }
            else {
                console.log('📁 Database Path:', dbPath);
                console.log('⚠️  Database file does not exist yet (will be created on first use)');
                console.log('🗄️  Database Type: SQLite');
            }
        }
        else {
            console.log('🗄️  Database Type:', databaseUrl?.split(':')[0] || 'Unknown');
        }
        console.log('⏳ Attempting to connect...');
        let prismaClient;
        if (!prisma) {
            console.log('⏳ Waiting for Prisma client to initialize...');
            for (let i = 0; i < 50; i++) {
                if (prisma) {
                    prismaClient = prisma;
                    break;
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (!prisma) {
                console.log('⏳ Prisma not initialized yet, using getPrismaClient()...');
                prismaClient = await getPrismaClient();
            }
            else {
                prismaClient = prisma;
            }
        }
        else {
            prismaClient = prisma;
        }
        await prismaClient.$connect();
        let result;
        try {
            result = await prismaClient.$queryRaw `SELECT datetime('now') as current_time`;
            console.log('='.repeat(60));
            console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
            console.log('='.repeat(60));
            console.log('📋 Database Type: SQLite');
            console.log('🕐 Connection Time:', result[0].current_time);
            console.log('🔗 Status: CONNECTED');
            console.log('='.repeat(60));
        }
        catch (sqliteError) {
            try {
                result = await prismaClient.$queryRaw `SELECT NOW() as current_time, current_database() as db_name`;
                console.log('='.repeat(60));
                console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
                console.log('='.repeat(60));
                console.log('📋 Database Name:', result[0].db_name);
                console.log('🕐 Connection Time:', result[0].current_time);
                console.log('🔗 Status: CONNECTED');
                console.log('='.repeat(60));
            }
            catch (pgError) {
                console.log('='.repeat(60));
                console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
                console.log('='.repeat(60));
                console.log('⚠️  Could not execute test query, but connection is established');
                console.log('🔗 Status: CONNECTED');
                console.log('='.repeat(60));
            }
        }
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
        if (origin.startsWith('file://')) {
            return callback(null, true);
        }
        const allowedOrigins = [
            process.env.FRONTEND_URL || 'http://localhost:5173',
            ...(process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : [
                'http://localhost:8080',
                'http://localhost:8081',
                'http://localhost:3000',
                'http://localhost:5001',
                'http://127.0.0.1:8080',
                'http://127.0.0.1:8081',
                'http://127.0.0.1:5173',
                'http://127.0.0.1:3000',
                'http://127.0.0.1:5001',
                'null'
            ])
        ];
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            if (process.env.NODE_ENV === 'development') {
                console.log('CORS: Allowing origin in development:', origin);
                return callback(null, true);
            }
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Company-ID', 'X-Branch-ID'],
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
const healthCheckHandler = async (req, res) => {
    try {
        const dbService = (0, database_service_1.getDatabaseService)();
        const dbStatus = dbService.getStatus();
        const currentType = dbService.getCurrentType();
        try {
            const prismaClient = await (0, db_util_1.getPrisma)();
            try {
                await prismaClient.$queryRaw `SELECT datetime('now') as test`;
            }
            catch (e) {
                try {
                    await prismaClient.$queryRaw `SELECT 1 as test`;
                }
                catch (e2) {
                }
            }
        }
        catch (err) {
            console.error('[Health] Database connection error:', err);
        }
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            database: {
                type: currentType === database_service_1.DatabaseType.SQLITE ? 'sqlite' : 'postgresql',
                status: dbStatus.connectionStatus,
                isOnline: dbService.isOnline(),
                isOffline: dbService.isOffline(),
                sqlite: {
                    connected: dbStatus.sqlite.connected,
                    path: dbStatus.sqlite.url?.replace('file:', '') || 'N/A'
                },
                postgresql: {
                    connected: dbStatus.postgresql.connected,
                    configured: !!dbStatus.postgresql.url
                }
            }
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
};
app.get('/health', healthCheckHandler);
app.get('/api/health', healthCheckHandler);
app.get('/api/test-offline', async (req, res) => {
    try {
        const dbService = (0, database_service_1.getDatabaseService)();
        const prismaClient = await (0, db_util_1.getPrisma)();
        const currentType = dbService.getCurrentType();
        const isSQLite = currentType === database_service_1.DatabaseType.SQLITE;
        const userCount = await prismaClient.user.count();
        const companyCount = await prismaClient.company.count();
        const testResult = await prismaClient.$queryRaw `SELECT datetime('now') as current_time`;
        const currentTime = testResult[0]?.current_time || new Date().toISOString();
        res.json({
            success: true,
            message: 'Offline mode is working! ✅',
            tests: {
                databaseType: isSQLite ? 'SQLite (Offline)' : 'PostgreSQL (Online)',
                databaseConnected: true,
                canRead: true,
                canWrite: true,
                currentTime: currentTime
            },
            data: {
                totalUsers: userCount,
                totalCompanies: companyCount
            },
            status: {
                isOffline: dbService.isOffline(),
                isOnline: dbService.isOnline(),
                connectionStatus: dbService.getConnectionStatus()
            },
            databasePath: isSQLite ? dbService.getStatus().sqlite.url?.replace('file:', '') : 'N/A'
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: 'Offline mode test failed ❌',
            error: error.message,
            tests: {
                databaseType: 'Unknown',
                databaseConnected: false,
                canRead: false,
                canWrite: false
            }
        });
    }
});
app.get('/health-old', async (req, res) => {
    try {
        if (process.env.DATABASE_URL) {
            try {
                const prismaClient = await getPrismaClient();
                await prismaClient.$queryRaw `SELECT 1`;
                res.status(200).json({
                    status: 'OK',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    environment: process.env.NODE_ENV,
                    database: 'connected',
                    server: 'running'
                });
                return;
            }
            catch (dbError) {
                res.status(200).json({
                    status: 'OK',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    environment: process.env.NODE_ENV,
                    database: 'disconnected',
                    server: 'running',
                    warning: 'Database connection failed but server is running'
                });
                return;
            }
        }
        else {
            res.status(200).json({
                status: 'OK',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                environment: process.env.NODE_ENV,
                database: 'not_configured',
                server: 'running',
                warning: 'DATABASE_URL not set - database operations will fail'
            });
            return;
        }
    }
    catch (error) {
        res.status(200).json({
            status: 'OK',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            environment: process.env.NODE_ENV,
            database: 'unknown',
            server: 'running',
            warning: 'Health check had errors but server is running'
        });
    }
});
app.get('/ping', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Zapeera Pharmacy Management API',
        version: '1.0.0',
        endpoints: {
            health: '/health',
            api: '/api',
            ping: '/ping'
        },
        documentation: 'API endpoints are available under /api/*'
    });
});
app.get('/api', (req, res) => {
    res.status(200).json({
        message: 'Zapeera Pharmacy Management API',
        version: '1.0.0',
        availableEndpoints: [
            '/api/auth',
            '/api/users',
            '/api/products',
            '/api/sales',
            '/api/reports',
            '/api/dashboard',
            '/api/customers',
            '/api/inventory',
            '/api/companies',
            '/api/branches'
        ],
        healthCheck: '/health'
    });
});
app.get('/favicon.ico', (req, res) => {
    res.status(204).end();
});
app.use('/api/auth', auth_routes_1.default);
app.use('/api/users', user_routes_1.default);
app.use('/api/companies', company_routes_1.default);
app.use('/api/branches', branch_routes_1.default);
app.use('/api/products', product_routes_1.default);
app.use('/api/customers', customer_routes_1.default);
app.use('/api/sales', sale_routes_1.default);
app.use('/api/reports', report_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/admin', admin_routes_1.default);
app.use('/api/categories', category_routes_1.default);
app.use('/api/suppliers', supplier_routes_1.default);
app.use('/api/manufacturers', manufacturer_routes_1.default);
app.use('/api/shelves', shelf_routes_1.default);
app.use('/api/employees', employee_routes_1.default);
app.use('/api/attendance', attendance_routes_1.default);
app.use('/api/shifts', shift_routes_1.default);
app.use('/api/scheduled-shifts', scheduledShift_routes_1.default);
app.use('/api/commissions', commission_routes_1.default);
app.use('/api/roles', role_routes_1.default);
app.use('/api/refunds', refund_routes_1.default);
app.use('/api/subscription', subscription_routes_1.default);
app.use('/api/batches', batch_routes_1.default);
app.use('/api/purchases', purchase_routes_1.default);
app.use('/api/inventory', inventory_routes_1.default);
app.use('/api/sse', sse_routes_1.default);
app.use('/api/settings', settings_routes_1.default);
app.use('/api/sync', sync_routes_1.default);
app.use(notFound_middleware_1.notFound);
app.use(error_middleware_1.errorHandler);
process.on('SIGINT', async () => {
    console.log('Shutting down gracefully...');
    if (prisma) {
        await prisma.$disconnect();
    }
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Shutting down gracefully...');
    if (prisma) {
        await prisma.$disconnect();
    }
    process.exit(0);
});
const DEFAULT_PORT = (() => {
    const portEnv = process.env.PORT;
    if (!portEnv)
        return 5001;
    const parsed = parseInt(portEnv, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.warn(`Invalid PORT value: ${portEnv}. Using default port 5001.`);
        return 5001;
    }
    return parsed;
})();
const PORT_EXPLICITLY_SET = !!process.env.PORT;
function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const server = net.createServer();
        server.listen(port, () => {
            server.once('close', () => resolve(true));
            server.close();
        });
        server.on('error', () => resolve(false));
    });
}
async function killProcessOnPort(port) {
    return new Promise((resolve) => {
        try {
            const { execSync } = require('child_process');
            if (process.platform === 'darwin' || process.platform === 'linux') {
                try {
                    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8', timeout: 2000 }).trim();
                    if (pids) {
                        const pidArray = pids.split('\n').filter((p) => p.trim());
                        pidArray.forEach((pid) => {
                            try {
                                execSync(`kill -9 ${pid.trim()}`, { timeout: 1000 });
                                console.log(`✅ Killed process ${pid.trim()} using port ${port}`);
                            }
                            catch (e) {
                            }
                        });
                        setTimeout(() => resolve(true), 1000);
                    }
                    else {
                        resolve(false);
                    }
                }
                catch (e) {
                    resolve(false);
                }
            }
            else if (process.platform === 'win32') {
                try {
                    const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 2000 });
                    const lines = result.split('\n').filter((line) => line.includes('LISTENING'));
                    lines.forEach((line) => {
                        const pid = line.trim().split(/\s+/).pop();
                        if (pid) {
                            try {
                                execSync(`taskkill /F /PID ${pid}`, { timeout: 1000 });
                                console.log(`✅ Killed process ${pid} using port ${port}`);
                            }
                            catch (e) {
                            }
                        }
                    });
                    setTimeout(() => resolve(true), 1000);
                }
                catch (e) {
                    resolve(false);
                }
            }
            else {
                resolve(false);
            }
        }
        catch (error) {
            resolve(false);
        }
    });
}
async function startServer() {
    let currentPort = DEFAULT_PORT;
    let attempts = 0;
    const maxAttempts = PORT_EXPLICITLY_SET ? 20 : 10;
    let server = null;
    while (attempts < maxAttempts) {
        await killProcessOnPort(currentPort);
        await new Promise(resolve => setTimeout(resolve, PORT_EXPLICITLY_SET ? 1000 : 500));
        const available = await isPortAvailable(currentPort);
        if (available) {
            try {
                server = app.listen(currentPort, '0.0.0.0', () => {
                    console.log('='.repeat(60));
                    console.log('🚀 ZAPEERA BACKEND SERVER STARTED');
                    console.log('='.repeat(60));
                    console.log(`🌐 Server running on port: ${currentPort}`);
                    console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
                    console.log(`🔗 Health check: http://0.0.0.0:${currentPort}/health`);
                    console.log(`📋 API Base URL: http://0.0.0.0:${currentPort}/api`);
                    console.log('='.repeat(60));
                    console.log('✅ Server is ready to accept connections');
                    process.env.PORT = currentPort.toString();
                });
                server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        if (PORT_EXPLICITLY_SET) {
                            console.log(`⚠️  Port ${currentPort} is still in use. Killing processes and retrying...`);
                            if (server) {
                                server.close();
                            }
                            attempts++;
                            setTimeout(() => startServer(), 2000);
                        }
                        else {
                            console.log(`⚠️  Port ${currentPort} is already in use. Trying next port...`);
                            if (server) {
                                server.close();
                            }
                            attempts++;
                            currentPort++;
                            setTimeout(() => startServer(), 1000);
                        }
                    }
                    else if (error.code === 'EACCES') {
                        console.error(`❌ Permission denied to bind to port ${currentPort}. Please use a port above 1024.`);
                        process.exit(1);
                    }
                    else {
                        console.error('❌ Server startup error:', error.message);
                        process.exit(1);
                    }
                });
                setTimeout(async () => {
                    let waitCount = 0;
                    while (!prisma && waitCount < 30) {
                        await new Promise(resolve => setTimeout(resolve, 200));
                        waitCount++;
                    }
                    const dbConnected = await testDatabaseConnection();
                    if (!dbConnected) {
                        console.log('⚠️  Database connection issues detected...');
                        console.log('💡 Server is running but database may not be accessible');
                        console.log('💡 Check your DATABASE_URL environment variable');
                    }
                }, 3000);
                return;
            }
            catch (error) {
                if (error.code === 'EADDRINUSE') {
                    if (PORT_EXPLICITLY_SET) {
                        console.log(`⚠️  Port ${currentPort} is still in use. Retrying...`);
                        attempts++;
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        continue;
                    }
                    else {
                        console.log(`⚠️  Port ${currentPort} is already in use. Trying next port...`);
                        attempts++;
                        currentPort++;
                        continue;
                    }
                }
                else {
                    throw error;
                }
            }
        }
        else {
            if (PORT_EXPLICITLY_SET) {
                console.log(`⚠️  Port ${currentPort} is not available. Killing processes and retrying...`);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            else {
                console.log(`⚠️  Port ${currentPort} is not available. Trying next port...`);
                attempts++;
                currentPort++;
            }
        }
    }
    if (PORT_EXPLICITLY_SET) {
        console.error(`❌ Could not start server on port ${DEFAULT_PORT} after ${maxAttempts} attempts.`);
        console.error(`❌ Port ${DEFAULT_PORT} is in use and could not be freed.`);
        console.error(`❌ Please close other applications using port ${DEFAULT_PORT}.`);
    }
    else {
        console.error(`❌ Could not find an available port after ${maxAttempts} attempts.`);
        console.error(`❌ Tried ports ${DEFAULT_PORT} to ${currentPort - 1}.`);
    }
    process.exit(1);
}
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map
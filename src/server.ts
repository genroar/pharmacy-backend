import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Import routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import companyRoutes from './routes/company.routes';
import branchRoutes from './routes/branch.routes';
import productRoutes from './routes/product.routes';
import customerRoutes from './routes/customer.routes';
import saleRoutes from './routes/sale.routes';
import reportRoutes from './routes/report.routes';
import dashboardRoutes from './routes/dashboard.routes';
import adminRoutes from './routes/admin.routes';
import categoryRoutes from './routes/category.routes';
import supplierRoutes from './routes/supplier.routes';
import manufacturerRoutes from './routes/manufacturer.routes';
import shelfRoutes from './routes/shelf.routes';
import employeeRoutes from './routes/employee.routes';
import attendanceRoutes from './routes/attendance.routes';
import shiftRoutes from './routes/shift.routes';
import scheduledShiftRoutes from './routes/scheduledShift.routes';
import commissionRoutes from './routes/commission.routes';
import roleRoutes from './routes/role.routes';
import refundRoutes from './routes/refund.routes';
import subscriptionRoutes from './routes/subscription.routes';
import batchRoutes from './routes/batch.routes';
import purchaseRoutes from './routes/purchase.routes';
import inventoryRoutes from './routes/inventory.routes';
import sseRoutes from './routes/sse.routes';
import settingsRoutes from './routes/settings.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';

// Load environment variables
dotenv.config();

// Check if DATABASE_URL is set, if not, provide a warning but continue
if (!process.env.DATABASE_URL) {
  console.warn('⚠️  WARNING: DATABASE_URL is not set.');
  console.warn('⚠️  The backend will start but database operations will fail.');
  console.warn('⚠️  Please set DATABASE_URL in your .env file.');
  console.warn('⚠️  Example: DATABASE_URL="postgresql://user:password@localhost:5432/dbname"');
}

const app = express();

// Initialize Prisma client - but handle errors gracefully
let prisma: PrismaClient;
try {
  prisma = new PrismaClient();
} catch (error: any) {
  console.error('❌ Failed to initialize Prisma Client:', error.message);
  console.error('❌ This usually means DATABASE_URL is missing or invalid.');
  // Create a dummy Prisma client that will fail gracefully
  prisma = new PrismaClient();
}

// BigInt serialization will be handled in individual controllers

// Database connection test function
async function testDatabaseConnection() {
  try {
    console.log('='.repeat(60));
    console.log('🔍 CHECKING DATABASE CONNECTION STATUS');
    console.log('='.repeat(60));
    console.log('📊 Database URL:', process.env.DATABASE_URL);
    console.log('⏳ Attempting to connect...');

    await prisma.$connect();

    // Test a simple query
    const result = await prisma.$queryRaw`SELECT NOW() as current_time, current_database() as db_name` as any[];

    console.log('='.repeat(60));
    console.log('✅ DATABASE CONNECTION: SUCCESSFUL');
    console.log('='.repeat(60));
    console.log('📋 Database Name:', result[0].db_name);
    console.log('🕐 Connection Time:', result[0].current_time);
    console.log('🔗 Status: CONNECTED');
    console.log('='.repeat(60));

    return true;
  } catch (error: any) {
    console.log('='.repeat(60));
    console.log('❌ DATABASE CONNECTION: FAILED');
    console.log('='.repeat(60));
    console.log('🚨 Error:', error.message);
    console.log('🔗 Status: NOT CONNECTED');
    console.log('='.repeat(60));
    return false;
  }
}

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: function (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) {
    // Allow requests with no origin (like mobile apps, curl requests, or Electron file:// protocol)
    if (!origin) return callback(null, true);

    // Allow file:// protocol (Electron apps)
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
        'null' // Electron sometimes sends 'null' as origin
      ])
    ];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      // In development, log but allow (for easier debugging)
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
  optionsSuccessStatus: 200 // Some legacy browsers (IE11, various SmartTVs) choke on 204
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate limiting - More generous for dashboard usage
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // limit each IP to 1000 requests per windowMs (increased for dashboard)
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: process.env.MAX_FILE_SIZE || '10mb' }));
app.use(express.urlencoded({ extended: true, limit: process.env.MAX_FILE_SIZE || '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }
}

// Health check endpoint - Always return OK even if database is not connected
// This allows the frontend to connect even if DATABASE_URL is missing
app.get('/health', async (req, res) => {
  try {
    // Test database connection only if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({
          status: 'OK',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          environment: process.env.NODE_ENV,
          database: 'connected',
          server: 'running'
        });
        return;
      } catch (dbError) {
        // Database connection failed but server is running
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
    } else {
      // No DATABASE_URL set - server is still running
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
  } catch (error) {
    // Even if everything fails, return 200 for basic health check
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

// Simple health check for Railway (no database dependency)
app.get('/ping', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});

// Root route - return API info
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

// API root route - return API info
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

// Ignore favicon requests (prevent 404 errors)
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/products', productRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/manufacturers', manufacturerRoutes);
app.use('/api/shelves', shelfRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/scheduled-shifts', scheduledShiftRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/sse', sseRoutes);
app.use('/api/settings', settingsRoutes);

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Graceful shutdown
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

// Ensure PORT is always a valid number
const DEFAULT_PORT: number = (() => {
  const portEnv = process.env.PORT;
  if (!portEnv) return 5001;

  const parsed = parseInt(portEnv, 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`Invalid PORT value: ${portEnv}. Using default port 5001.`);
    return 5001;
  }

  return parsed;
})();

// Check if PORT was explicitly set (not default)
const PORT_EXPLICITLY_SET = !!process.env.PORT;

// Function to check if a port is available
function isPortAvailable(port: number): Promise<boolean> {
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

// Function to kill process using a port (macOS/Linux)
async function killProcessOnPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'darwin' || process.platform === 'linux') {
        try {
          const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8', timeout: 2000 }).trim();
          if (pids) {
            const pidArray = pids.split('\n').filter((p: string) => p.trim());
            pidArray.forEach((pid: string) => {
              try {
                execSync(`kill -9 ${pid.trim()}`, { timeout: 1000 });
                console.log(`✅ Killed process ${pid.trim()} using port ${port}`);
              } catch (e) {
                // Ignore errors
              }
            });
            setTimeout(() => resolve(true), 1000);
          } else {
            resolve(false);
          }
        } catch (e) {
          resolve(false);
        }
      } else if (process.platform === 'win32') {
        try {
          const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', timeout: 2000 });
          const lines = result.split('\n').filter((line: string) => line.includes('LISTENING'));
          lines.forEach((line: string) => {
            const pid = line.trim().split(/\s+/).pop();
            if (pid) {
              try {
                execSync(`taskkill /F /PID ${pid}`, { timeout: 1000 });
                console.log(`✅ Killed process ${pid} using port ${port}`);
              } catch (e) {
                // Ignore errors
              }
            }
          });
          setTimeout(() => resolve(true), 1000);
        } catch (e) {
          resolve(false);
        }
      } else {
        resolve(false);
      }
    } catch (error) {
      resolve(false);
    }
  });
}

// Start server with database connection check and automatic port selection
async function startServer(): Promise<void> {
  let currentPort = DEFAULT_PORT;
  let attempts = 0;
  // If PORT is explicitly set, keep trying the same port (for Electron)
  // Otherwise, try alternative ports
  const maxAttempts = PORT_EXPLICITLY_SET ? 20 : 10; // More attempts if port is explicitly set
  let server: any = null;

  while (attempts < maxAttempts) {
    // Try to kill any process using the port first (especially important if PORT is explicitly set)
    await killProcessOnPort(currentPort);

    // Wait a bit for port to be released (longer wait if port is explicitly set)
    await new Promise(resolve => setTimeout(resolve, PORT_EXPLICITLY_SET ? 1000 : 500));

    // Check if port is available
    const available = await isPortAvailable(currentPort);

    if (available) {
      try {
        // Start the server on this port
        server = app.listen(currentPort, '0.0.0.0', () => {
          console.log('='.repeat(60));
          console.log('🚀 ZAPEERA BACKEND SERVER STARTED');
          console.log('='.repeat(60));
          console.log(`🌐 Server running on port: ${currentPort}`);
          console.log(`📊 Environment: ${process.env.NODE_ENV || 'production'}`);
          console.log(`🔗 Health check: http://0.0.0.0:${currentPort}/health`);
          console.log(`📋 API Base URL: http://0.0.0.0:${currentPort}/api`);
          console.log('='.repeat(60));

          // Emit ready signal for Electron detection
          console.log('✅ Server is ready to accept connections');

          // Update process.env.PORT so other parts of the app know the actual port
          process.env.PORT = currentPort.toString();
        });

        // Handle server startup errors
        server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            if (PORT_EXPLICITLY_SET) {
              // If port is explicitly set, keep trying the same port
              console.log(`⚠️  Port ${currentPort} is still in use. Killing processes and retrying...`);
              if (server) {
                server.close();
              }
              attempts++;
              // Retry with same port after killing processes
              setTimeout(() => startServer(), 2000);
            } else {
              // If port is not explicitly set, try next port
              console.log(`⚠️  Port ${currentPort} is already in use. Trying next port...`);
              if (server) {
                server.close();
              }
              attempts++;
              currentPort++;
              // Retry with next port
              setTimeout(() => startServer(), 1000);
            }
          } else if (error.code === 'EACCES') {
            console.error(`❌ Permission denied to bind to port ${currentPort}. Please use a port above 1024.`);
            process.exit(1);
          } else {
            console.error('❌ Server startup error:', error.message);
            process.exit(1);
          }
        });

        // Test database connection in background (non-blocking)
        setTimeout(async () => {
          const dbConnected = await testDatabaseConnection();
          if (!dbConnected) {
            console.log('⚠️  Database connection issues detected...');
            console.log('💡 Server is running but database may not be accessible');
            console.log('💡 Check your DATABASE_URL environment variable');
          }
        }, 1000); // Wait 1 second after server starts

        return; // Successfully started
      } catch (error: any) {
        if (error.code === 'EADDRINUSE') {
          if (PORT_EXPLICITLY_SET) {
            // Keep trying the same port
            console.log(`⚠️  Port ${currentPort} is still in use. Retrying...`);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          } else {
            console.log(`⚠️  Port ${currentPort} is already in use. Trying next port...`);
            attempts++;
            currentPort++;
            continue;
          }
        } else {
          throw error;
        }
      }
    } else {
      if (PORT_EXPLICITLY_SET) {
        // Keep trying the same port
        console.log(`⚠️  Port ${currentPort} is not available. Killing processes and retrying...`);
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`⚠️  Port ${currentPort} is not available. Trying next port...`);
        attempts++;
        currentPort++;
      }
    }
  }

  // If we've exhausted all attempts
  if (PORT_EXPLICITLY_SET) {
    console.error(`❌ Could not start server on port ${DEFAULT_PORT} after ${maxAttempts} attempts.`);
    console.error(`❌ Port ${DEFAULT_PORT} is in use and could not be freed.`);
    console.error(`❌ Please close other applications using port ${DEFAULT_PORT}.`);
  } else {
    console.error(`❌ Could not find an available port after ${maxAttempts} attempts.`);
    console.error(`❌ Tried ports ${DEFAULT_PORT} to ${currentPort - 1}.`);
  }
  process.exit(1);
}

startServer();

export default app;

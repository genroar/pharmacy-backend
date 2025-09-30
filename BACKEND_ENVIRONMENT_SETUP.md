# Backend Environment Variables Setup

This document explains how to configure the MediBill Pulse backend using environment variables.

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your specific configuration values.

3. Restart your backend server to load the new environment variables.

## Environment Variables

### Database Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Required | `postgresql://user:pass@localhost:5432/medibill_pulse` |

### JWT Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `JWT_SECRET` | Secret key for JWT tokens | Required | `your-super-secret-jwt-key-here` |
| `JWT_EXPIRES_IN` | JWT token expiration time | `7d` | `24h`, `7d`, `30d` |

### Server Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `PORT` | Server port | `5001` | `3000`, `8080` |
| `NODE_ENV` | Environment mode | `development` | `production`, `staging` |

### Frontend Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `FRONTEND_URL` | Frontend application URL | `http://localhost:5173` | `https://app.medibillpulse.com` |

### CORS Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `CORS_ORIGINS` | Comma-separated list of allowed origins | Auto-detected | `https://app.com,https://admin.com` |

### Rate Limiting Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `RATE_LIMIT_WINDOW_MS` | Rate limit window in milliseconds | `900000` (15 min) | `600000` (10 min) |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | `1000` | `500`, `2000` |

### Logging Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `LOG_LEVEL` | Logging level | `info` | `error`, `warn`, `info`, `debug` |
| `ENABLE_REQUEST_LOGGING` | Enable request logging | `true` | `false` |

### Security Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `BCRYPT_ROUNDS` | Bcrypt salt rounds | `12` | `10`, `14`, `16` |
| `SESSION_SECRET` | Session secret key | Required | `your-session-secret-here` |

### File Upload Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `MAX_FILE_SIZE` | Maximum file upload size | `10mb` | `5mb`, `20mb` |
| `UPLOAD_PATH` | File upload directory | `./uploads` | `/var/uploads` |

### Development Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEBUG_MODE` | Enable debug mode | `true` | `false` |
| `ENABLE_SWAGGER` | Enable Swagger documentation | `true` | `false` |
| `SWAGGER_URL` | Swagger documentation URL | `/api-docs` | `/docs` |

### Default Settings

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEFAULT_PHARMACY_NAME` | Default pharmacy name | `MediBill Pulse Pharmacy` | `Your Pharmacy Name` |
| `DEFAULT_PHARMACY_EMAIL` | Default pharmacy email | `info@medibillpulse.com` | `info@yourpharmacy.com` |
| `DEFAULT_PHARMACY_PHONE` | Default pharmacy phone | `+92 42 1234567` | `+1 555 123 4567` |
| `DEFAULT_PHARMACY_LICENSE` | Default pharmacy license | `PHR-LHR-2024-001` | `PHR-2024-001` |
| `DEFAULT_TAX_RATE` | Default tax rate percentage | `17` | `15`, `20` |

### System Defaults

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `DEFAULT_ADMIN_EMAIL` | Default admin email | `admin@medibillpulse.com` | `admin@yourcompany.com` |
| `DEFAULT_ADMIN_PHONE` | Default admin phone | `+92 300 0000000` | `+1 555 000 0000` |
| `SYSTEM_EMAIL` | System-generated email | `system@default.com` | `system@yourcompany.com` |
| `BRANCH_EMAIL` | Default branch email | `default@branch.com` | `branch@yourcompany.com` |

### Optional: Email Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `SMTP_HOST` | SMTP server host | Not set | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | Not set | `587`, `465` |
| `SMTP_USER` | SMTP username | Not set | `your-email@gmail.com` |
| `SMTP_PASS` | SMTP password | Not set | `your-app-password` |
| `FROM_EMAIL` | From email address | Not set | `noreply@medibillpulse.com` |

### Optional: Redis Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `REDIS_URL` | Redis connection string | Not set | `redis://localhost:6379` |

### Optional: Analytics Configuration

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENABLE_ANALYTICS` | Enable analytics tracking | `false` | `true` |
| `ANALYTICS_API_KEY` | Analytics API key | Not set | `your-analytics-key` |

## Environment-Specific Configuration

### Development
```env
NODE_ENV=development
DEBUG_MODE=true
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=debug
RATE_LIMIT_MAX_REQUESTS=1000
```

### Staging
```env
NODE_ENV=staging
DEBUG_MODE=true
ENABLE_REQUEST_LOGGING=true
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=500
```

### Production
```env
NODE_ENV=production
DEBUG_MODE=false
ENABLE_REQUEST_LOGGING=false
LOG_LEVEL=error
RATE_LIMIT_MAX_REQUESTS=200
ENABLE_ANALYTICS=true
```

## Security Best Practices

### Required Environment Variables
- `DATABASE_URL` - Database connection string
- `JWT_SECRET` - Strong, random JWT secret (at least 32 characters)
- `SESSION_SECRET` - Strong, random session secret

### Security Recommendations
1. **Never commit `.env` files** to version control
2. **Use strong, random secrets** for JWT_SECRET and SESSION_SECRET
3. **Rotate secrets regularly** in production
4. **Use different secrets** for different environments
5. **Limit CORS origins** to only necessary domains
6. **Set appropriate rate limits** for your use case
7. **Use HTTPS** in production
8. **Regularly update dependencies** for security patches

## Database Setup

### PostgreSQL Configuration
```env
DATABASE_URL="postgresql://username:password@localhost:5432/medibill_pulse?schema=public"
```

### Database Migration
```bash
# Run database migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check `DATABASE_URL` format
   - Ensure PostgreSQL is running
   - Verify database exists

2. **JWT Token Issues**
   - Ensure `JWT_SECRET` is set
   - Check `JWT_EXPIRES_IN` format
   - Verify token expiration

3. **CORS Errors**
   - Check `FRONTEND_URL` and `CORS_ORIGINS`
   - Ensure frontend URL is in allowed origins
   - Verify CORS configuration

4. **Rate Limiting Issues**
   - Adjust `RATE_LIMIT_MAX_REQUESTS`
   - Check `RATE_LIMIT_WINDOW_MS`
   - Monitor request patterns

### Environment Validation

The application will validate required environment variables on startup and show helpful error messages if any are missing.

## Examples

### Complete Development Environment
```env
# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/medibill_pulse?schema=public"

# JWT
JWT_SECRET=your-super-secret-jwt-key-here-make-it-long-and-random
JWT_EXPIRES_IN=7d

# Server
PORT=5001
NODE_ENV=development

# Frontend
FRONTEND_URL=http://localhost:5173

# CORS
CORS_ORIGINS=http://localhost:5173,http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000

# Logging
LOG_LEVEL=debug
ENABLE_REQUEST_LOGGING=true

# Security
BCRYPT_ROUNDS=12
SESSION_SECRET=your-session-secret-here

# Development
DEBUG_MODE=true
ENABLE_SWAGGER=true
```

### Production Environment
```env
# Database
DATABASE_URL="postgresql://prod_user:secure_pass@prod_host:5432/medibill_pulse_prod?schema=public"

# JWT
JWT_SECRET=production-super-secret-jwt-key-very-long-and-random
JWT_EXPIRES_IN=24h

# Server
PORT=5001
NODE_ENV=production

# Frontend
FRONTEND_URL=https://app.medibillpulse.com

# CORS
CORS_ORIGINS=https://app.medibillpulse.com,https://admin.medibillpulse.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=200

# Logging
LOG_LEVEL=error
ENABLE_REQUEST_LOGGING=false

# Security
BCRYPT_ROUNDS=14
SESSION_SECRET=production-session-secret-very-secure

# Production
DEBUG_MODE=false
ENABLE_SWAGGER=false
ENABLE_ANALYTICS=true
```

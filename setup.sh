#!/bin/bash

echo "🚀 Setting up MediBill Pulse Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    exit 1
fi

# Check if PostgreSQL is installed
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL v13 or higher."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Check if .env file exists
if [ ! -f .env ]; then
    echo "�� Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update the .env file with your database credentials"
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npm run db:generate

# Push database schema
echo "🗄️  Setting up database..."
npm run db:push

# Seed database
echo "🌱 Seeding database..."
npm run db:seed

echo "✅ Setup complete!"
echo ""
echo "🎉 Your MediBill Pulse backend is ready!"
echo ""
echo "📋 Next steps:"
echo "1. Update .env file with your database credentials"
echo "2. Start the development server: npm run dev"
echo "3. The API will be available at http://localhost:5000"
echo ""
echo "�� API Documentation: http://localhost:5000/health"
echo "📊 Database Studio: npm run db:studio"

// Test script to check products in database
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function testDatabaseProducts() {
  try {
    console.log('=== TESTING DATABASE PRODUCTS ===');
    
    // Get all products
    const allProducts = await prisma.product.findMany({
      include: {
        category: true,
        supplier: true,
        branch: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });
    
    console.log('Total products in database:', allProducts.length);
    console.log('\nRecent products:');
    allProducts.forEach((product, index) => {
      console.log(`${index + 1}. ${product.name}`);
      console.log(`   - ID: ${product.id}`);
      console.log(`   - Branch: ${product.branch.name} (${product.branch.id})`);
      console.log(`   - Category: ${product.category.name}`);
      console.log(`   - Stock: ${product.stock}`);
      console.log(`   - Created: ${product.createdAt}`);
      console.log('');
    });
    
    // Get products by branch
    const branches = await prisma.branch.findMany();
    console.log('\n=== PRODUCTS BY BRANCH ===');
    for (const branch of branches) {
      const branchProducts = await prisma.product.findMany({
        where: { branchId: branch.id },
        select: { id: true, name: true, stock: true, createdAt: true }
      });
      console.log(`Branch: ${branch.name} (${branch.id})`);
      console.log(`Products: ${branchProducts.length}`);
      branchProducts.forEach(p => {
        console.log(`  - ${p.name} (Stock: ${p.stock}, Created: ${p.createdAt})`);
      });
      console.log('');
    }
    
  } catch (error) {
    console.error('Error testing database products:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabaseProducts();

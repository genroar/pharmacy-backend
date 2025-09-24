
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyFix() {
  try {
    console.log('🔍 Verifying cashier fix...\n');
    
    // Check cashier user
    const cashier = await prisma.user.findFirst({
      where: { username: 'cashier' },
      include: { branch: true }
    });
    
    if (!cashier) {
      console.log('❌ Cashier user not found!');
      return;
    }
    
    console.log(`✅ Cashier found: ${cashier.username}`);
    console.log(`   - Role: ${cashier.role}`);
    console.log(`   - Branch: ${cashier.branch?.name || 'NO BRANCH'}`);
    console.log(`   - Branch ID: ${cashier.branchId}`);
    console.log(`   - Is Active: ${cashier.isActive}`);
    
    // Check South Branch
    const southBranch = await prisma.branch.findFirst({
      where: { name: 'South Branch' }
    });
    
    if (!southBranch) {
      console.log('❌ South Branch not found!');
      return;
    }
    
    console.log(`\n✅ South Branch found: ${southBranch.name}`);
    console.log(`   - ID: ${southBranch.id}`);
    console.log(`   - Is Active: ${southBranch.isActive}`);
    
    // Check if they match
    console.log(`\n🔍 Verification:`);
    console.log(`Cashier branch ID: ${cashier.branchId}`);
    console.log(`South Branch ID: ${southBranch.id}`);
    console.log(`Match: ${cashier.branchId === southBranch.id ? 'YES' : 'NO'}`);
    
    // Test the exact query that login uses
    console.log(`\n🔍 Testing login query...`);
    const loginUser = await prisma.user.findFirst({
      where: {
        username: 'cashier',
        isActive: true,
        branch: {
          name: 'South Branch',
          isActive: true
        }
      },
      include: {
        branch: true
      }
    });
    
    if (loginUser) {
      console.log('✅ Login query successful!');
      console.log(`   - User: ${loginUser.username}`);
      console.log(`   - Branch: ${loginUser.branch.name}`);
    } else {
      console.log('❌ Login query failed!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyFix();






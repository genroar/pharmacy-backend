import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedEmployees() {
  try {
    console.log('🌱 Seeding employee data...');

    // First, get the first branch
    const branch = await prisma.branch.findFirst();
    if (!branch) {
      console.log('❌ No branches found. Please create a branch first.');
      return;
    }

    // Create sample employees
    const employees = [
      {
        employeeId: 'EMP001',
        name: 'John Doe',
        email: 'john.doe@pharmacy.com',
        phone: '+1234567890',
        address: '123 Main St, City',
        position: 'Cashier',
        department: 'Sales',
        salary: 3000,
        hireDate: new Date('2024-01-15'),
        status: 'ACTIVE',
        branchId: branch.id,
        emergencyContactName: 'Jane Doe',
        emergencyContactPhone: '+1234567891',
        emergencyContactRelation: 'Spouse'
      },
      {
        employeeId: 'EMP002',
        name: 'Sarah Smith',
        email: 'sarah.smith@pharmacy.com',
        phone: '+1234567892',
        address: '456 Oak Ave, City',
        position: 'Manager',
        department: 'Management',
        salary: 5000,
        hireDate: new Date('2023-06-01'),
        status: 'ACTIVE',
        branchId: branch.id,
        emergencyContactName: 'Mike Smith',
        emergencyContactPhone: '+1234567893',
        emergencyContactRelation: 'Brother'
      },
      {
        employeeId: 'EMP003',
        name: 'Mike Johnson',
        email: 'mike.johnson@pharmacy.com',
        phone: '+1234567894',
        address: '789 Pine St, City',
        position: 'Pharmacist',
        department: 'Pharmacy',
        salary: 6000,
        hireDate: new Date('2023-03-10'),
        status: 'ACTIVE',
        branchId: branch.id,
        emergencyContactName: 'Lisa Johnson',
        emergencyContactPhone: '+1234567895',
        emergencyContactRelation: 'Wife'
      },
      {
        employeeId: 'EMP004',
        name: 'Emily Brown',
        email: 'emily.brown@pharmacy.com',
        phone: '+1234567896',
        address: '321 Elm St, City',
        position: 'Cashier',
        department: 'Sales',
        salary: 2800,
        hireDate: new Date('2024-02-20'),
        status: 'ON_LEAVE',
        branchId: branch.id,
        emergencyContactName: 'Robert Brown',
        emergencyContactPhone: '+1234567897',
        emergencyContactRelation: 'Father'
      }
    ];

    // Create employees
    for (const employeeData of employees) {
      await prisma.employee.create({
        data: employeeData
      });
      console.log(`✅ Created employee: ${employeeData.name} (${employeeData.employeeId})`);
    }

    console.log('🎉 Employee seeding completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding employees:', error);
  } finally {
    await prisma.$disconnect();
  }
}

seedEmployees();

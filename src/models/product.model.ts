


export interface CreateProductData {
    name: string;
    description?: string;
    sku: string;
    categoryId: string;
    categoryName?: string; // For bulk import - category name when categoryId doesn't exist
    supplierId: string;
    branchId: string;
    costPrice: number;
    sellingPrice: number;
    stock: number;
    minStock: number;
    maxStock?: bigint;
    unitType: string;
    unitsPerPack?: number;
    barcode?: string;
    requiresPrescription: boolean;
  }

  export interface UpdateProductData {
    name?: string;
    description?: string;
    sku?: string;
    categoryId?: string;
    supplierId?: string;
    branchId?: string;
    costPrice?: number;
    sellingPrice?: number;
    stock?: number;
    minStock?: number;
    maxStock?: bigint;
    unitType?: string;
    unitsPerPack?: number;
    barcode?: string;
    requiresPrescription?: boolean;
    isActive?: boolean;
  }

  export interface StockMovementData {
    productId: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
    quantity: number;
    reason?: string;
    reference?: string;
    createdBy?: string;
  }
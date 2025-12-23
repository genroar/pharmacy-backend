export interface CreateProductData {
    name: string;
    description?: string;
    formula?: string;
    sku: string;
    categoryId: string;
    categoryName?: string;
    supplierId?: string;
    branchId: string;
    barcode?: string;
    requiresPrescription: boolean;
    costPrice?: number;
    sellingPrice?: number;
    stock?: number;
    minStock?: number;
    maxStock?: bigint;
    unitsPerPack?: number;
}
export interface UpdateProductData {
    name?: string;
    description?: string;
    formula?: string;
    sku?: string;
    categoryId?: string;
    supplierId?: string;
    branchId?: string;
    barcode?: string;
    requiresPrescription?: boolean;
    isActive?: boolean;
    costPrice?: number;
    sellingPrice?: number;
    stock?: number;
    minStock?: number;
    maxStock?: bigint;
    unitsPerPack?: number;
}
export interface StockMovementData {
    productId: string;
    type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';
    quantity: number;
    reason?: string;
    reference?: string;
    createdBy?: string;
}
//# sourceMappingURL=product.model.d.ts.map
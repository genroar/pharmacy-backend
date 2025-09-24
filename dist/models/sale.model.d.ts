import { PaymentMethod, PaymentStatus, SaleStatus } from '@prisma/client';
export interface CreateSaleData {
    customerId?: string;
    userId: string;
    branchId: string;
    items: SaleItemData[];
    paymentMethod: PaymentMethod;
    discountAmount?: number;
}
export interface SaleItemData {
    productId: string;
    quantity: number;
    unitPrice: number;
    batchNumber?: string;
    expiryDate?: string;
}
export interface SaleResponse {
    id: string;
    customer?: {
        id: string;
        name: string;
        phone: string;
    };
    items: Array<{
        id: string;
        product: {
            id: string;
            name: string;
            unitType: string;
        };
        quantity: number;
        unitPrice: number;
        totalPrice: number;
        batchNumber?: string;
        expiryDate?: string;
    }>;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    totalAmount: number;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    status: SaleStatus;
    createdAt: string;
    receiptNumber?: string;
}
//# sourceMappingURL=sale.model.d.ts.map
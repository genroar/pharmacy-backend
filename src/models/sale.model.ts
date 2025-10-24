import { PaymentMethod, PaymentStatus, SaleStatus } from '@prisma/client';

export interface CreateSaleData {
  customerId?: string;
  userId: string;
  branchId: string;
  items: SaleItemData[];
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  discountPercentage?: number;
  saleDate?: string;
}

export interface SaleItemData {
  productId: string;
  quantity: number;
  unitPrice: number;
  batchId?: string; // Link to specific batch
  batchNumber?: string; // Keep for backward compatibility
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
  discountPercentage?: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  saleDate?: string;
  createdAt: string;
  receiptNumber?: string;
}
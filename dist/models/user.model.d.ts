import { UserRole } from '@prisma/client';
export interface CreateUserData {
    username: string;
    email: string;
    password: string;
    name: string;
    role: UserRole;
    branchId: string;
}
export interface UpdateUserData {
    username?: string;
    email?: string;
    password?: string;
    name?: string;
    role?: UserRole;
    branchId?: string;
    isActive?: boolean;
}
export interface LoginData {
    usernameOrEmail: string;
    password: string;
}
export interface AuthResponse {
    user: {
        id: string;
        username: string;
        name: string;
        role: string;
        branch: {
            id: string;
            name: string;
        };
    };
    token: string;
}
//# sourceMappingURL=user.model.d.ts.map
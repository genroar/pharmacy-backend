import { Router } from 'express';
import { login, register, getProfile, changePassword, updateProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.get('/profile', authenticate, getProfile);
router.post('/change-password', authenticate, changePassword);
router.put('/update-profile', authenticate, updateProfile);

export default router;

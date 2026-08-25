import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

// Single shared PrismaClient instance (hot-reload safe)
export const prisma = new PrismaClient();

export default prisma;
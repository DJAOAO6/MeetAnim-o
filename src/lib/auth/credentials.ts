import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

export async function findActiveUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

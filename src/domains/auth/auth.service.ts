import { prisma } from '../../db/prisma';
import { hashPassword, comparePassword } from '../../utils/password';
import { signAccessToken, signRefreshToken } from '../../utils/token';
import { generateApiKey, hashApiKey } from '../../utils/apiKey';

export const authService = {
  async register(name: string, email: string, password: string) {
    const existing = await prisma.organization.findUnique({ where: { email } });
    if (existing) {
      throw new Error('Email already in use');
    }

    const hashedPassword = await hashPassword(password);
    const organization = await prisma.organization.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        createdAt: true,
      },
    });

    return organization;
  },

  async login(email: string, password: string) {
    const organization = await prisma.organization.findUnique({
      where: { email },
    });

    if (!organization) {
      throw new Error('Invalid credentials');
    }

    const valid = await comparePassword(password, organization.password);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const payload = { sub: organization.id, email: organization.email };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        email: organization.email,
        plan: organization.plan,
      },
      accessToken,
      refreshToken,
    };
  },

  async createApiKey(organizationId: string, name: string) {
    const key = generateApiKey();
    const keyHash = hashApiKey(key);

    const apiKey = await prisma.apiKey.create({
      data: {
        organizationId,
        name,
        keyHash,
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    // Return the raw key only once
    return {
      ...apiKey,
      key,
    };
  },

  async listApiKeys(organizationId: string) {
    return prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      select: {
        id: true,
        name: true,
        lastUsedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async revokeApiKey(organizationId: string, id: string) {
    const apiKey = await prisma.apiKey.findFirst({
      where: { id, organizationId },
    });

    if (!apiKey) {
      throw new Error('API key not found');
    }

    await prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  },

  async updateProfile(organizationId: string, data: { webhookUrl?: string }) {
    return prisma.organization.update({
      where: { id: organizationId },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        webhookUrl: true,
      },
    });
  },
};

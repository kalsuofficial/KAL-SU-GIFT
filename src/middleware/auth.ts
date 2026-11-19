import type { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifySessionToken } from '../lib/crypto.ts';
import { db } from '../db/index.ts';
import { profiles, roles } from '../db/schema.ts';

export interface AuthenticatedProfile {
  id: number;
  uid: string | null;
  fullName: string;
  email: string;
  phone: string | null;
  roleId: number;
  roleName: string;
  permissions: string[];
  loyaltyPoints: number;
  preferredLang: string;
  preferredCurrency: string;
  cashierStation: string | null;
}

export interface AuthRequest extends Request {
  profile?: AuthenticatedProfile;
}

async function fetchProfileWithRoleById(profileId: number): Promise<AuthenticatedProfile | null> {
  const rows = await db
    .select({
      id: profiles.id,
      uid: profiles.uid,
      fullName: profiles.fullName,
      email: profiles.email,
      phone: profiles.phone,
      roleId: profiles.roleId,
      roleName: roles.name,
      permissions: roles.permissions,
      loyaltyPoints: profiles.loyaltyPoints,
      preferredLang: profiles.preferredLang,
      preferredCurrency: profiles.preferredCurrency,
      cashierStation: profiles.cashierStation,
      isActive: profiles.isActive,
    })
    .from(profiles)
    .innerJoin(roles, eq(profiles.roleId, roles.id))
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!rows[0] || !rows[0].isActive) return null;
  return rows[0];
}

async function upsertFirebaseProfile(
  uid: string,
  email: string,
  name?: string
): Promise<AuthenticatedProfile | null> {
  const existingByUid = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.uid, uid))
    .limit(1);

  if (existingByUid[0]) {
    return fetchProfileWithRoleById(existingByUid[0].id);
  }

  const existingByEmail = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email.toLowerCase()))
    .limit(1);

  if (existingByEmail[0]) {
    await db
      .update(profiles)
      .set({ uid, updatedAt: new Date() })
      .where(eq(profiles.id, existingByEmail[0].id));
    return fetchProfileWithRoleById(existingByEmail[0].id);
  }

  const isDesignatedAdmin = email.toLowerCase() === 'michelwadley2@gmail.com';
  const adminRoleRows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'super_admin'))
    .limit(1);
  const customerRoleRows = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, 'customer'))
    .limit(1);

  const existingProfiles = await db.select({ id: profiles.id }).from(profiles).limit(1);
  const assignedRoleId =
    (isDesignatedAdmin || existingProfiles.length === 0) && adminRoleRows[0]
      ? adminRoleRows[0].id
      : customerRoleRows[0]?.id;

  if (!assignedRoleId) return null;

  const inserted = await db
    .insert(profiles)
    .values({
      uid,
      email: email.toLowerCase(),
      fullName: name || email.split('@')[0],
      roleId: assignedRoleId,
    })
    .onConflictDoUpdate({
      target: profiles.email,
      set: {
        uid,
        ...(isDesignatedAdmin && adminRoleRows[0] ? { roleId: adminRoleRows[0].id } : {}),
        updatedAt: new Date(),
      },
    })
    .returning({ id: profiles.id });

  return inserted[0] ? fetchProfileWithRoleById(inserted[0].id) : null;
}

export async function resolveAuthFromHeader(
  authHeader: string | undefined
): Promise<AuthenticatedProfile | null> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  if (token.startsWith('ksg.')) {
    const payload = verifySessionToken(token);
    if (!payload) return null;
    return fetchProfileWithRoleById(payload.profileId);
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    if (!decoded.email) return null;
    return upsertFirebaseProfile(decoded.uid, decoded.email, decoded.name);
  } catch {
    return null;
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const profile = await resolveAuthFromHeader(req.headers.authorization);
    if (!profile) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.profile = profile;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(401).json({ error: 'Invalid or expired credentials' });
  }
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const profile = await resolveAuthFromHeader(req.headers.authorization);
    if (profile) {
      req.profile = profile;
    }
  } catch {
    // Ignore optional auth failures
  }
  next();
};

export const requirePermission = (permission: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.profile) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const perms = req.profile.permissions || [];
    if (perms.includes('*') || perms.includes(permission)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
};

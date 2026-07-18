import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Request, Response, NextFunction } from 'express';
import { TenantManager } from '../helpers/TenantManager';

// Extender la interfaz Request para incluir tenant info
declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: number;
        name: string;
        subdomain: string;
        schemaName: string;
        settings: any;
      };
    }
  }
}

/**
 * Middleware para detectar y configurar el tenant actual
 * Puede extraer el tenant de:
 * 1. Subdominio (app1.chateam.com)
 * 2. Header X-Tenant
 * 3. Query parameter ?tenant=
 * 4. JWT token
 */
export const tenantMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    let tenantIdentifier: string | null = null;

    // ==========================================
    // 1. DETECTAR TENANT POR SUBDOMINIO
    // ==========================================
    const hostname = req.get('host') || req.hostname;
    const subdomain = extractSubdomain(hostname);

    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      tenantIdentifier = subdomain;
    }

    // ==========================================
    // 2. DETECTAR TENANT POR HEADER
    // ==========================================
    if (!tenantIdentifier) {
      tenantIdentifier = req.get('X-Tenant') || null;
    }

    // ==========================================
    // 3. DETECTAR TENANT POR QUERY PARAM
    // ==========================================
    if (!tenantIdentifier) {
      tenantIdentifier = req.query.tenant as string || null;
    }

    // ==========================================
    // 4. DETECTAR TENANT POR JWT
    // ==========================================
    if (!tenantIdentifier && req.headers.authorization) {
      tenantIdentifier = await extractTenantFromJWT(req.headers.authorization);
    }

    // ==========================================
    // 5. USAR TENANT POR DEFECTO
    // ==========================================
    if (!tenantIdentifier) {
      tenantIdentifier = process.env.DEFAULT_TENANT || 'default';
    }

    // ==========================================
    // 6. OBTENER Y CONFIGURAR TENANT
    // ==========================================
    const tenant = await TenantManager.getTenantByIdentifier(tenantIdentifier);

    if (!tenant) {
      return res.status(404).json({
        error: 'Tenant not found',
        code: 'TENANT_NOT_FOUND',
        identifier: tenantIdentifier
      });
    }

    if (tenant.status !== 'active') {
      return res.status(403).json({
        error: 'Tenant not active',
        code: 'TENANT_INACTIVE',
        status: tenant.status
      });
    }

    // Agregar tenant info al request
    req.tenant = {
      id: tenant.id,
      name: tenant.name,
      subdomain: tenant.subdomain,
      schemaName: tenant.schema_name,
      settings: tenant.settings || {}
    };

    // ==========================================
    // 7. CONFIGURAR SEARCH PATH
    // ==========================================
    await TenantManager.setSearchPath(tenant.schema_name);

    // Log para debugging en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log(`🏢 Tenant: ${tenant.name} (${tenant.schema_name})`);
    }

    next();
  } catch (error) {
    console.error('❌ Error in tenant middleware:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'TENANT_MIDDLEWARE_ERROR'
    });
  }
};

/**
 * Middleware para rutas que requieren tenant específico
 */
export const requireTenant = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.tenant) {
    res.status(400).json({
      error: 'Tenant required',
      code: 'TENANT_REQUIRED'
    });
    return;
  }
  next();
};

/**
 * Middleware para verificar permisos del tenant
 */
export const checkTenantPermissions = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.tenant) {
      res.status(400).json({
        error: 'Tenant required',
        code: 'TENANT_REQUIRED'
      });
      return;
    }

    const permissions = req.tenant.settings?.permissions || [];

    if (!permissions.includes(permission) && !permissions.includes('*')) {
      res.status(403).json({
        error: 'Permission denied',
        code: 'PERMISSION_DENIED',
        required: permission
      });
      return;
    }

    next();
  };
};

/**
 * Extrae el subdominio del hostname
 */
function extractSubdomain(hostname: string): string | null {
  if (!hostname) return null;

  // Remover puerto si existe
  const cleanHostname = hostname.split(':')[0];

  // Dividir por puntos
  const parts = cleanHostname.split('.');

  // Si tiene al menos 3 partes (sub.domain.com), el primer parte es el subdominio
  if (parts.length >= 3) {
    return parts[0];
  }

  // Para localhost o desarrollo
  if (parts.length === 2 && parts[1] === 'localhost') {
    return parts[0];
  }

  return null;
}

/**
 * Extrae tenant del JWT token
 */
async function extractTenantFromJWT(authHeader: string): Promise<string | null> {
  try {
    const token = authHeader.replace('Bearer ', '');
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(token) as any;

    return decoded?.tenant || decoded?.subdomain || null;
  } catch (error) {
    return null;
  }
}

/**
 * Middleware para limpiar el context del tenant al final del request
 */
export const cleanupTenantContext = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.on('finish', async () => {
    try {
      // Resetear search path a public
      await TenantManager.resetSearchPath();
    } catch (error) {
      console.error('Error cleaning up tenant context:', error);
    }
  });

  next();
};

export default tenantMiddleware;
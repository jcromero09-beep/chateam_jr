-- =====================================================
-- MIGRATION: Sistema de Permisos Granulares por Módulo
-- Fecha: 6 de octubre de 2025
-- Fase: 6 - Expansión
-- =====================================================

-- 1. Tabla de Módulos del Sistema
CREATE TABLE IF NOT EXISTS system_modules (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  route VARCHAR(255),
  parent_module_id BIGINT REFERENCES system_modules(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Acciones por Módulo
CREATE TABLE IF NOT EXISTS module_actions (
  id BIGSERIAL PRIMARY KEY,
  module_id BIGINT NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
  action_key VARCHAR(50) NOT NULL, -- view, create, edit, delete, export, import
  action_label VARCHAR(100) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(module_id, action_key)
);

-- 3. Tabla de Permisos (Rol + Módulo + Acción)
CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  profile VARCHAR(100) NOT NULL, -- admin, user, supervisor, etc.
  module_id BIGINT NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
  action_id BIGINT NOT NULL REFERENCES module_actions(id) ON DELETE CASCADE,
  is_granted BOOLEAN DEFAULT FALSE,
  conditions JSONB DEFAULT '{}', -- Condiciones adicionales (ej: "own_data_only": true)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, profile, module_id, action_id)
);

-- 4. Tabla de Permisos de Usuario (sobrescribe permisos de rol)
CREATE TABLE IF NOT EXISTS user_permissions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id BIGINT NOT NULL REFERENCES system_modules(id) ON DELETE CASCADE,
  action_id BIGINT NOT NULL REFERENCES module_actions(id) ON DELETE CASCADE,
  is_granted BOOLEAN DEFAULT FALSE,
  conditions JSONB DEFAULT '{}',
  granted_by BIGINT REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(user_id, module_id, action_id)
);

-- 5. Tabla de Auditoría de Permisos
CREATE TABLE IF NOT EXISTS permission_audit_log (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  module_id BIGINT REFERENCES system_modules(id) ON DELETE SET NULL,
  action_id BIGINT REFERENCES module_actions(id) ON DELETE SET NULL,
  permission_type VARCHAR(50), -- role_permission, user_permission
  action_type VARCHAR(50), -- granted, revoked, checked
  is_allowed BOOLEAN,
  metadata JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- SEED DATA: Módulos del Sistema
-- =====================================================

INSERT INTO system_modules (name, display_name, description, icon, route, display_order) VALUES
-- Módulos principales
('dashboard', 'Dashboard', 'Panel principal de control', 'dashboard', '/dashboard', 1),
('tickets', 'Tickets', 'Gestión de tickets y conversaciones', 'chat', '/tickets', 2),
('contacts', 'Contactos', 'Gestión de contactos y clientes', 'contacts', '/contacts', 3),
('campaigns', 'Campañas', 'Campañas de marketing', 'campaign', '/campaigns', 4),
('email_marketing', 'Email Marketing', 'Gestión de email marketing', 'email', '/email-marketing', 5),
('appointments', 'Citas', 'Sistema de agendamiento', 'calendar', '/appointments', 6),
('webchat', 'WebChat', 'Canal de chat web', 'web', '/webchat', 7),
('integrations', 'Integraciones', 'Integraciones externas', 'integration', '/integrations', 8),
('analytics', 'Analytics', 'Analíticas y reportes', 'analytics', '/analytics', 9),
('queues', 'Colas', 'Gestión de colas', 'queue', '/queues', 10),
('users', 'Usuarios', 'Gestión de usuarios', 'people', '/users', 11),
('settings', 'Configuración', 'Configuración del sistema', 'settings', '/settings', 12);

-- Submódulos de Configuración
INSERT INTO system_modules (name, display_name, description, icon, route, parent_module_id, display_order) VALUES
('settings_company', 'Empresa', 'Configuración de empresa', 'business', '/settings/company',
  (SELECT id FROM system_modules WHERE name = 'settings'), 1),
('settings_billing', 'Facturación', 'Configuración de facturación', 'payment', '/settings/billing',
  (SELECT id FROM system_modules WHERE name = 'settings'), 2),
('settings_api', 'API', 'Configuración de API', 'api', '/settings/api',
  (SELECT id FROM system_modules WHERE name = 'settings'), 3),
('settings_permissions', 'Permisos', 'Gestión de permisos', 'security', '/settings/permissions',
  (SELECT id FROM system_modules WHERE name = 'settings'), 4);

-- =====================================================
-- SEED DATA: Acciones Estándar
-- =====================================================

-- Acciones para cada módulo principal
DO $$
DECLARE
  module_record RECORD;
BEGIN
  FOR module_record IN
    SELECT id, name FROM system_modules WHERE parent_module_id IS NULL
  LOOP
    -- Acciones básicas para todos los módulos
    INSERT INTO module_actions (module_id, action_key, action_label, description) VALUES
    (module_record.id, 'view', 'Ver', 'Ver registros del módulo'),
    (module_record.id, 'create', 'Crear', 'Crear nuevos registros'),
    (module_record.id, 'edit', 'Editar', 'Editar registros existentes'),
    (module_record.id, 'delete', 'Eliminar', 'Eliminar registros'),
    (module_record.id, 'export', 'Exportar', 'Exportar datos a CSV/Excel');

    -- Acciones específicas según el módulo
    IF module_record.name = 'tickets' THEN
      INSERT INTO module_actions (module_id, action_key, action_label, description) VALUES
      (module_record.id, 'assign', 'Asignar', 'Asignar tickets a usuarios'),
      (module_record.id, 'close', 'Cerrar', 'Cerrar tickets'),
      (module_record.id, 'transfer', 'Transferir', 'Transferir tickets entre colas');
    END IF;

    IF module_record.name = 'campaigns' THEN
      INSERT INTO module_actions (module_id, action_key, action_label, description) VALUES
      (module_record.id, 'launch', 'Lanzar', 'Lanzar campañas'),
      (module_record.id, 'pause', 'Pausar', 'Pausar campañas activas'),
      (module_record.id, 'clone', 'Clonar', 'Duplicar campañas');
    END IF;

    IF module_record.name = 'users' THEN
      INSERT INTO module_actions (module_id, action_key, action_label, description) VALUES
      (module_record.id, 'manage_roles', 'Gestionar Roles', 'Asignar y modificar roles'),
      (module_record.id, 'reset_password', 'Resetear Password', 'Resetear contraseñas de usuarios');
    END IF;

    IF module_record.name = 'analytics' THEN
      INSERT INTO module_actions (module_id, action_key, action_label, description) VALUES
      (module_record.id, 'view_all', 'Ver Todo', 'Ver analytics de toda la empresa'),
      (module_record.id, 'view_own', 'Ver Propios', 'Ver solo analytics propios');
    END IF;
  END LOOP;
END $$;

-- =====================================================
-- SEED DATA: Permisos por Perfil (Template)
-- =====================================================

-- Crear permisos para perfil ADMIN (primera empresa como ejemplo)
DO $$
DECLARE
  first_company_id BIGINT;
  module_rec RECORD;
  action_rec RECORD;
BEGIN
  SELECT id INTO first_company_id FROM companies ORDER BY id LIMIT 1;

  IF first_company_id IS NOT NULL THEN
    -- Admin tiene todos los permisos
    FOR module_rec IN SELECT id FROM system_modules LOOP
      FOR action_rec IN SELECT id FROM module_actions WHERE module_id = module_rec.id LOOP
        INSERT INTO role_permissions (company_id, profile, module_id, action_id, is_granted)
        VALUES (first_company_id, 'admin', module_rec.id, action_rec.id, TRUE)
        ON CONFLICT (company_id, profile, module_id, action_id) DO NOTHING;
      END LOOP;
    END LOOP;

    -- User: permisos limitados
    FOR module_rec IN SELECT id, name FROM system_modules WHERE name IN ('tickets', 'contacts', 'dashboard') LOOP
      FOR action_rec IN SELECT id, action_key FROM module_actions WHERE module_id = module_rec.id
        AND action_key IN ('view', 'create', 'edit') LOOP
        INSERT INTO role_permissions (company_id, profile, module_id, action_id, is_granted)
        VALUES (first_company_id, 'user', module_rec.id, action_rec.id, TRUE)
        ON CONFLICT (company_id, profile, module_id, action_id) DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;
END $$;

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_system_modules_parent ON system_modules(parent_module_id);
CREATE INDEX idx_system_modules_active ON system_modules(is_active);
CREATE INDEX idx_module_actions_module ON module_actions(module_id);
CREATE INDEX idx_role_permissions_lookup ON role_permissions(company_id, profile, module_id);
CREATE INDEX idx_user_permissions_lookup ON user_permissions(user_id, module_id);
CREATE INDEX idx_permission_audit_company ON permission_audit_log(company_id, created_at);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger para actualizar updated_at
CREATE OR REPLACE FUNCTION update_permission_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_modules_timestamp
  BEFORE UPDATE ON system_modules
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

CREATE TRIGGER trigger_update_role_permissions_timestamp
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

-- =====================================================
-- FUNCIONES HELPER
-- =====================================================

-- Función para verificar si un usuario tiene permiso
CREATE OR REPLACE FUNCTION check_user_permission(
  p_user_id BIGINT,
  p_module_name VARCHAR,
  p_action_key VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_has_permission BOOLEAN := FALSE;
  v_company_id BIGINT;
  v_profile VARCHAR;
  v_module_id BIGINT;
  v_action_id BIGINT;
BEGIN
  -- Obtener company_id y profile del usuario
  SELECT company_id, profile INTO v_company_id, v_profile
  FROM users WHERE id = p_user_id;

  -- Obtener module_id
  SELECT id INTO v_module_id FROM system_modules WHERE name = p_module_name;

  -- Obtener action_id
  SELECT id INTO v_action_id FROM module_actions
  WHERE module_id = v_module_id AND action_key = p_action_key;

  -- Verificar permiso de usuario específico (prioridad 1)
  SELECT is_granted INTO v_has_permission
  FROM user_permissions
  WHERE user_id = p_user_id
    AND module_id = v_module_id
    AND action_id = v_action_id
    AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

  -- Si no hay permiso de usuario, verificar permiso de rol (prioridad 2)
  IF v_has_permission IS NULL THEN
    SELECT is_granted INTO v_has_permission
    FROM role_permissions
    WHERE company_id = v_company_id
      AND profile = v_profile
      AND module_id = v_module_id
      AND action_id = v_action_id;
  END IF;

  -- Registrar en audit log
  INSERT INTO permission_audit_log (
    company_id, user_id, module_id, action_id,
    permission_type, action_type, is_allowed
  ) VALUES (
    v_company_id, p_user_id, v_module_id, v_action_id,
    'check', 'checked', COALESCE(v_has_permission, FALSE)
  );

  RETURN COALESCE(v_has_permission, FALSE);
END;
$$ LANGUAGE plpgsql;

-- Función para obtener permisos de un usuario
CREATE OR REPLACE FUNCTION get_user_permissions(p_user_id BIGINT)
RETURNS TABLE (
  module_name VARCHAR,
  module_label VARCHAR,
  action_key VARCHAR,
  action_label VARCHAR,
  is_granted BOOLEAN,
  source VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  WITH user_company AS (
    SELECT company_id, profile FROM users WHERE id = p_user_id
  )
  SELECT
    sm.name AS module_name,
    sm.display_name AS module_label,
    ma.action_key,
    ma.action_label,
    COALESCE(up.is_granted, rp.is_granted, FALSE) AS is_granted,
    CASE
      WHEN up.id IS NOT NULL THEN 'user_override'
      WHEN rp.id IS NOT NULL THEN 'role'
      ELSE 'denied'
    END AS source
  FROM system_modules sm
  CROSS JOIN module_actions ma
  LEFT JOIN user_permissions up ON (
    up.user_id = p_user_id
    AND up.module_id = sm.id
    AND up.action_id = ma.id
    AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP)
  )
  LEFT JOIN user_company uc ON TRUE
  LEFT JOIN role_permissions rp ON (
    rp.company_id = uc.company_id
    AND rp.profile = uc.profile
    AND rp.module_id = sm.id
    AND rp.action_id = ma.id
  )
  WHERE ma.module_id = sm.id
    AND sm.is_active = TRUE
    AND ma.is_active = TRUE
  ORDER BY sm.display_order, sm.display_name, ma.action_key;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE system_modules IS 'Módulos del sistema con jerarquía';
COMMENT ON TABLE module_actions IS 'Acciones disponibles por módulo';
COMMENT ON TABLE role_permissions IS 'Permisos por rol de usuario';
COMMENT ON TABLE user_permissions IS 'Permisos específicos de usuario (sobrescribe rol)';
COMMENT ON TABLE permission_audit_log IS 'Auditoría de verificación de permisos';

-- [Fase3·N2.0] Roles configurables por empresa + roleId en Users. Idempotente y aditivo.
-- roleId nullable => usuarios existentes sin rol caen al comportamiento actual (solo-plan): CERO regresión.
-- Los presets se siembran con companyId=NULL (plantillas de sistema). No auto-asigna roles a nadie.

BEGIN;

-- 1) Tabla Roles
CREATE TABLE IF NOT EXISTS "Roles" (
  "id"           SERIAL PRIMARY KEY,
  "companyId"    INTEGER NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "name"         VARCHAR(255) NOT NULL,
  "key"          VARCHAR(255) NOT NULL,
  "isSystem"     BOOLEAN NOT NULL DEFAULT false,
  "unrestricted" BOOLEAN NOT NULL DEFAULT false,
  "editable"     BOOLEAN NOT NULL DEFAULT true,
  "permissions"  JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- índice: un preset de sistema único por key (companyId NULL)
CREATE UNIQUE INDEX IF NOT EXISTS "roles_system_key_uidx"
  ON "Roles" ("key") WHERE "companyId" IS NULL;

-- 2) Columna roleId en Users (nullable, aditiva)
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS "roleId" INTEGER NULL
  REFERENCES "Roles"("id") ON UPDATE CASCADE ON DELETE SET NULL;

-- 3) Seed de presets del sistema (companyId=NULL, isSystem=true). ON CONFLICT => idempotente.
INSERT INTO "Roles" ("companyId","name","key","isSystem","unrestricted","editable","permissions")
VALUES
  (NULL,'Super admin','super_admin',true,true,false,'{}'::jsonb),
  (NULL,'Admin de empresa','company_admin',true,true,true,'{}'::jsonb),
  (NULL,'Supervisor','supervisor',true,false,true,
    '{"dashboard":true,"tickets":true,"contacts":true,"quick_replies":true,"kanban":true,
      "internal_chats":true,"schedules":true,"tags":true,"realtime_chats":true,"webchat":true,
      "webchat_chats":true,"customer_origins":true,"customer_origins_reports":true,
      "reports":true,"queues":true,"queue_integrations":true,"funnel":true,
      "campaigns_insights":true,"campaigns_audit":true,"marketing_insights":true,
      "marketing_audit":true,"appointments_reports":true}'::jsonb),
  (NULL,'Agente de atención','agent',true,false,true,
    '{"dashboard":true,"tickets":true,"contacts":true,"quick_replies":true,"kanban":true,
      "internal_chats":true,"schedules":true,"tags":true,"realtime_chats":true,"webchat":true,
      "webchat_chats":true,"customer_origins":true}'::jsonb),
  (NULL,'Marketing','marketing',true,false,true,
    '{"dashboard":true,"tickets":true,"contacts":true,"internal_chats":true,
      "campaigns":true,"campaigns_contacts":true,"campaigns_settings":true,"campaigns_insights":true,
      "campaigns_attribution":true,"campaigns_audit":true,"campaigns_ai":true,"campaigns_rules":true,
      "marketing":true,"marketing_insights":true,"marketing_attribution":true,"marketing_audit":true,
      "facebook_conversions":true,"whatsapp_campaigns":true,
      "ugc_dashboard":true,"ugc_campaigns":true,"ugc_creators":true,"ugc_optimization":true,
      "ugc_settings":true,"ugc_analytics":true,"ugc_social_accounts":true,"ugc_social_posts":true,
      "ugc_video_studio":true,
      "email_marketing":true,"email_marketing_campaigns":true,"email_marketing_templates":true,
      "email_marketing_analytics":true,"email_credit_packs":true,"email_provider_settings":true,
      "comment_autoreply":true,"comment_autoreply_campaigns":true,"social_comments":true,
      "agent_comments":true,
      "flowbuilder":true,"flowbuilder_campaign":true,"flowbuilder_conversation":true}'::jsonb)
ON CONFLICT DO NOTHING;

COMMIT;

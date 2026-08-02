--
-- database/schema.sql — esquema completo de ChatEAM, volcado de producción.
--
-- [2026-08-01] Por qué existe: el job `test` del CI construía la base aplicando las
-- 387 migraciones desde cero, y eso NUNCA había funcionado. El runner estaba roto
-- (escrito para CommonJS en un proyecto ESM) y, una vez arreglado, 28 migraciones
-- siguen fallando en cadena sobre una base vacía. Mientras eso no se limpie, el CI
-- no podía ejecutar un solo test.
--
-- Con este fichero el CI parte del MISMO esquema que producción, que además es lo
-- que se quiere para un golden-master: si el harness valida contra un esquema
-- distinto al real, valida otra cosa.
--
-- ## Lo que este fichero NO hace
--
-- NO valida que las migraciones funcionen. Una migración nueva puede colarse rota sin
-- que el CI se entere.
--
-- ## Por qué no basta con "arreglar las migraciones" (medido 2026-08-01)
--
-- Se investigó, y el objetivo estaba mal planteado. De las 28 que fallan al levantar
-- desde cero, solo 7 fallan por su cuenta; las otras 21 son cascada: esperan tablas
-- que nadie crea. Y esas tablas SÍ existen en producción:
--
--   Roles · AIAffiliatePrograms · AISubplans · UGCSocialPosts · WhatsAppTemplates
--   AIAgentConfigs · AIProviderConfigs · AISupportCorrections · AffiliateWallets
--   FacebookDatasets · UGCPostComments · reminder_templates
--
-- No hay NINGUNA migración que las cree. Se hicieron con `sequelize.sync()` o a mano.
--
-- Hay además un lote entero (20250101*: tenants, CompanyBilling, Refunds, LeadSources,
-- Media) REGISTRADO en SequelizeMeta como aplicado cuyas tablas no existen en
-- producción: se marcó sin ejecutarse.
--
-- Conclusión: **el esquema real no se puede reconstruir desde el histórico de
-- migraciones**, y forzar las 28 crearía en CI un esquema DISTINTO al de producción —
-- justo lo contrario de lo que se busca. Recuperar esa capacidad exige generar las
-- migraciones que faltan a partir de este volcado, que es un proyecto propio.
-- Mientras tanto, este fichero es la fuente de verdad.
--
-- ## Cómo se regenera
--
--   docker exec -e PGPASSWORD=… chateam-postgres \
--     pg_dump -U atendimento -d chateamjr --schema-only --no-owner --no-privileges
--
-- OJO: pg_dump tiene que ser de la MISMA versión mayor que el servidor (17). El
-- binario del NAS es el 15 y aborta con "server version mismatch"; por eso se
-- ejecuta dentro del contenedor.
--
-- Requiere las extensiones pg_trgm, unaccent y vector (pgvector), así que el CI
-- levanta la imagen pgvector/pgvector:pg17 — la misma que corre en el NAS.
--
-- Al final se repuebla "SequelizeMeta" con las 390 migraciones ya registradas en
-- producción, para que el runner no intente reaplicarlas sobre este esquema.
--
--
-- PostgreSQL database dump
--

-- [2026-08-01] Se eliminaron las líneas \restrict/\unrestrict que emite pg_dump 17.6+:
-- son meta-comandos de psql RECIENTE y el cliente del runner de GitHub es más antiguo,
-- donde fallan con "invalid command". No aportan nada al esquema; son una salvaguarda
-- del propio dump. Si se regenera este fichero, hay que volver a quitarlas.

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: campaign_recommendation_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_recommendation_category AS ENUM (
    'timing',
    'content',
    'segmentation',
    'budget',
    'channel'
);


--
-- Name: campaign_recommendation_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_recommendation_priority AS ENUM (
    'critical',
    'high',
    'medium',
    'low'
);


--
-- Name: campaign_recommendation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_recommendation_status AS ENUM (
    'active',
    'applied',
    'dismissed'
);


--
-- Name: campaign_recommendation_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.campaign_recommendation_type AS ENUM (
    'optimization',
    'warning',
    'opportunity',
    'insight'
);


--
-- Name: enum_CampaignAlerts_alertType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignAlerts_alertType" AS ENUM (
    'cpa_high',
    'ctr_low',
    'budget_depleted',
    'frequency_high',
    'no_conversions',
    'spend_anomaly',
    'no_impressions',
    'performance_drop',
    'custom'
);


--
-- Name: enum_CampaignAlerts_severity; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignAlerts_severity" AS ENUM (
    'critical',
    'warning',
    'info'
);


--
-- Name: enum_CampaignAlerts_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignAlerts_status" AS ENUM (
    'active',
    'acknowledged',
    'resolved'
);


--
-- Name: enum_CampaignRuleLogs_result; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignRuleLogs_result" AS ENUM (
    'success',
    'failed',
    'skipped',
    'cooldown'
);


--
-- Name: enum_CampaignRules_frequency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignRules_frequency" AS ENUM (
    'every_15min',
    'every_30min',
    'hourly',
    'every_6h',
    'daily'
);


--
-- Name: enum_CampaignRules_scope; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignRules_scope" AS ENUM (
    'account',
    'campaign',
    'adset',
    'ad'
);


--
-- Name: enum_CampaignRules_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_CampaignRules_status" AS ENUM (
    'active',
    'paused',
    'error'
);


--
-- Name: enum_ContactTemperatures_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_ContactTemperatures_category" AS ENUM (
    'cold',
    'warm',
    'hot'
);


--
-- Name: enum_FacebookConversionEvents_messagingChannel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_FacebookConversionEvents_messagingChannel" AS ENUM (
    'whatsapp',
    'messenger',
    'instagram'
);


--
-- Name: enum_FacebookConversionEvents_responseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_FacebookConversionEvents_responseStatus" AS ENUM (
    'pending',
    'sent',
    'success',
    'failed'
);


--
-- Name: enum_FacebookDatasets_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_FacebookDatasets_status" AS ENUM (
    'active',
    'inactive'
);


--
-- Name: enum_KanbanLeadConversionEvents_responseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_KanbanLeadConversionEvents_responseStatus" AS ENUM (
    'pending',
    'sent',
    'success',
    'failed',
    'skipped'
);


--
-- Name: enum_WhatsAppTemplates_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_WhatsAppTemplates_category" AS ENUM (
    'MARKETING',
    'UTILITY',
    'AUTHENTICATION'
);


--
-- Name: enum_WhatsAppTemplates_headerType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_WhatsAppTemplates_headerType" AS ENUM (
    'NONE',
    'TEXT',
    'IMAGE',
    'VIDEO',
    'DOCUMENT'
);


--
-- Name: enum_WhatsAppTemplates_parameterFormat; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_WhatsAppTemplates_parameterFormat" AS ENUM (
    'named',
    'positional'
);


--
-- Name: enum_WhatsAppTemplates_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."enum_WhatsAppTemplates_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'PAUSED',
    'DISABLED'
);


--
-- Name: enum_messages_messagestatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.enum_messages_messagestatus AS ENUM (
    'pending',
    'sent',
    'failed',
    'deleted'
);


--
-- Name: touch_historical_qa_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_historical_qa_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW."updatedAt" := NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_contact_memory_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_contact_memory_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AIABTestVariants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIABTestVariants" (
    id integer NOT NULL,
    "testId" integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    "isControl" boolean DEFAULT false,
    config jsonb DEFAULT '{}'::jsonb,
    impressions integer DEFAULT 0,
    conversions integer DEFAULT 0,
    "avgLatencyMs" numeric(10,2) DEFAULT 0,
    "avgCostUsd" numeric(10,6) DEFAULT 0,
    "avgCsat" numeric(3,2) DEFAULT 0,
    "escalationCount" integer DEFAULT 0,
    "resolutionCount" integer DEFAULT 0,
    "totalTokensUsed" bigint DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIABTestVariants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIABTestVariants_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIABTestVariants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIABTestVariants_id_seq" OWNED BY public."AIABTestVariants".id;


--
-- Name: AIABTests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIABTests" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    "testType" character varying(30) DEFAULT 'prompt'::character varying,
    "agentType" character varying(30),
    status character varying(20) DEFAULT 'draft'::character varying,
    "trafficSplit" jsonb DEFAULT '{}'::jsonb,
    "winnerVariantId" integer,
    "minSampleSize" integer DEFAULT 100,
    "confidenceLevel" numeric(3,2) DEFAULT 0.95,
    "primaryMetric" character varying(30) DEFAULT 'resolution_rate'::character varying,
    "totalImpressions" integer DEFAULT 0,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AIABTests_primaryMetric_check" CHECK ((("primaryMetric")::text = ANY (ARRAY[('resolution_rate'::character varying)::text, ('csat'::character varying)::text, ('latency'::character varying)::text, ('cost'::character varying)::text, ('escalation_rate'::character varying)::text, ('engagement'::character varying)::text]))),
    CONSTRAINT "AIABTests_status_check" CHECK (((status)::text = ANY (ARRAY[('draft'::character varying)::text, ('running'::character varying)::text, ('paused'::character varying)::text, ('completed'::character varying)::text, ('archived'::character varying)::text]))),
    CONSTRAINT "AIABTests_testType_check" CHECK ((("testType")::text = ANY (ARRAY[('prompt'::character varying)::text, ('model'::character varying)::text, ('temperature'::character varying)::text, ('system_message'::character varying)::text, ('rag_config'::character varying)::text])))
);


--
-- Name: AIABTests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIABTests_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIABTests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIABTests_id_seq" OWNED BY public."AIABTests".id;


--
-- Name: AIAffiliatePrograms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAffiliatePrograms" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "referralCode" character varying(50) NOT NULL,
    "commissionRate" numeric(5,2) DEFAULT 20.00,
    "minimumWithdrawal" numeric(10,2) DEFAULT 50.00,
    "totalEarnings" numeric(10,2) DEFAULT 0,
    "pendingEarnings" numeric(10,2) DEFAULT 0,
    "withdrawnEarnings" numeric(10,2) DEFAULT 0,
    "referralsCount" integer DEFAULT 0,
    "activeReferrals" integer DEFAULT 0,
    status character varying(20) DEFAULT 'pending_approval'::character varying,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    name character varying(255) DEFAULT 'Programa de Afiliados'::character varying,
    description text,
    "parentAffiliateId" integer,
    "tierId" integer,
    level integer DEFAULT 1 NOT NULL,
    "paymentMethod" character varying(30),
    "paymentDetails" jsonb,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    "rewardType" character varying(20) DEFAULT 'tokens'::character varying NOT NULL,
    "rewardTokens" bigint DEFAULT 0 NOT NULL,
    "rewardDays" integer DEFAULT 0 NOT NULL
);


--
-- Name: AIAffiliatePrograms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIAffiliatePrograms_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIAffiliatePrograms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIAffiliatePrograms_id_seq" OWNED BY public."AIAffiliatePrograms".id;


--
-- Name: AIAffiliateReferrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAffiliateReferrals" (
    id integer NOT NULL,
    "affiliateId" integer NOT NULL,
    "referredCompanyId" integer NOT NULL,
    "subscriptionId" integer,
    "commissionAmount" numeric(10,2) DEFAULT 0,
    status character varying(20) DEFAULT 'pending'::character varying,
    "paidAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    level integer DEFAULT 1 NOT NULL,
    "sourceType" character varying(20) DEFAULT 'signup'::character varying NOT NULL,
    "affiliateCompanyId" integer,
    "linkId" integer,
    "referralSlug" character varying(80),
    "rewardType" character varying(20),
    "rewardTokens" bigint DEFAULT 0 NOT NULL,
    "rewardDays" integer DEFAULT 0 NOT NULL,
    "activatedAt" timestamp with time zone,
    "rewardProcessedAt" timestamp with time zone,
    "updatedAt" timestamp with time zone,
    "rewardStatus" character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "rewardClaimedAt" timestamp with time zone,
    "rewardClaimedBy" integer
);


--
-- Name: AIAffiliateReferrals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIAffiliateReferrals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIAffiliateReferrals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIAffiliateReferrals_id_seq" OWNED BY public."AIAffiliateReferrals".id;


--
-- Name: AIAgentAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAgentAssignments" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "agentConfigId" integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "assignedAt" timestamp with time zone DEFAULT now(),
    "deactivatedAt" timestamp with time zone,
    "pricingModel" character varying(30) DEFAULT 'included'::character varying,
    "executionQuota" integer DEFAULT 0,
    "executionsUsed" integer DEFAULT 0,
    "monthlyPrice" numeric(10,2) DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AIAgentAssignments_pricingModel_check" CHECK ((("pricingModel")::text = ANY (ARRAY[('included'::character varying)::text, ('pay_per_execution'::character varying)::text, ('monthly_quota'::character varying)::text])))
);


--
-- Name: AIAgentAssignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIAgentAssignments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIAgentAssignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIAgentAssignments_id_seq" OWNED BY public."AIAgentAssignments".id;


--
-- Name: AIAgentConfigs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAgentConfigs" (
    id integer NOT NULL,
    "companyId" integer,
    "agentType" character varying(50) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "modelKey" character varying(100) NOT NULL,
    "systemPrompt" text NOT NULL,
    temperature numeric(3,2) DEFAULT 0.7,
    "maxTokens" integer DEFAULT 1024,
    tools jsonb DEFAULT '[]'::jsonb,
    guardrails jsonb DEFAULT '{}'::jsonb,
    "confidenceThreshold" numeric(3,2) DEFAULT 0.7,
    "isActive" boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    department character varying(50) DEFAULT NULL::character varying,
    category character varying(50) DEFAULT NULL::character varying,
    capabilities jsonb DEFAULT '[]'::jsonb,
    icon character varying(50) DEFAULT 'bot'::character varying,
    tier character varying(20) DEFAULT 'mini'::character varying,
    slug character varying(100) DEFAULT NULL::character varying,
    "sortOrder" integer DEFAULT 0,
    version character varying(20) DEFAULT '1.0.0'::character varying
);


--
-- Name: COLUMN "AIAgentConfigs".department; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentConfigs".department IS 'Departamento: customer_service, sales_crm, marketing, knowledge_rag, automation, analytics_bi, multimedia, security';


--
-- Name: COLUMN "AIAgentConfigs".capabilities; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentConfigs".capabilities IS 'Array JSONB de capabilities: ["memory","rag","web_search","sentiment_analysis",...]';


--
-- Name: COLUMN "AIAgentConfigs".icon; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentConfigs".icon IS 'Nombre del icono lucide-react (ej: headphones, trending-up, shield)';


--
-- Name: COLUMN "AIAgentConfigs".tier; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentConfigs".tier IS 'Tier de modelo requerido: nano, mini, full, premium';


--
-- Name: COLUMN "AIAgentConfigs".slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentConfigs".slug IS 'Identificador URL-friendly unico del agente';


--
-- Name: AIAgentConfigs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIAgentConfigs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIAgentConfigs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIAgentConfigs_id_seq" OWNED BY public."AIAgentConfigs".id;


--
-- Name: AIAgentLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIAgentLogs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "ticketId" integer,
    "contactId" integer,
    "agentType" character varying(50) NOT NULL,
    "modelUsed" character varying(100),
    "inputTokens" integer DEFAULT 0,
    "outputTokens" integer DEFAULT 0,
    "costUsd" numeric(10,6) DEFAULT 0,
    "latencyMs" integer DEFAULT 0,
    confidence numeric(3,2),
    "wasEscalated" boolean DEFAULT false,
    "escalationReason" character varying(255),
    "cacheHit" boolean DEFAULT false,
    "toolsUsed" jsonb DEFAULT '[]'::jsonb,
    "inputSummary" text,
    "outputSummary" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "feedbackImplicit" character varying(20),
    "humanCorrection" text,
    "correctionDeltaMs" integer,
    "parentLogId" integer
);


--
-- Name: COLUMN "AIAgentLogs"."feedbackImplicit"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentLogs"."feedbackImplicit" IS 'positive | negative | escalated | corrected - se infiere automáticamente';


--
-- Name: COLUMN "AIAgentLogs"."humanCorrection"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentLogs"."humanCorrection" IS 'Texto de la respuesta humana que reemplazó/corrigió la respuesta de la IA';


--
-- Name: COLUMN "AIAgentLogs"."correctionDeltaMs"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentLogs"."correctionDeltaMs" IS 'Milisegundos desde la respuesta IA hasta la corrección humana';


--
-- Name: COLUMN "AIAgentLogs"."parentLogId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIAgentLogs"."parentLogId" IS 'ID del log de IA que fue corregido por este humano';


--
-- Name: AIAgentLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIAgentLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIAgentLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIAgentLogs_id_seq" OWNED BY public."AIAgentLogs".id;


--
-- Name: AIChatbotConfigs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIChatbotConfigs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "queueId" integer,
    name character varying(255) NOT NULL,
    role text,
    "firstMessage" text,
    "modelKey" character varying(100) DEFAULT 'gpt-4.1-mini'::character varying,
    instructions text,
    interests text[] DEFAULT '{}'::text[],
    temperature numeric(3,2) DEFAULT 0.7,
    "maxTokens" integer DEFAULT 1024,
    "widgetColor" character varying(7) DEFAULT '#007bff'::character varying,
    "widgetPosition" character varying(20) DEFAULT 'bottom-right'::character varying,
    "avatarUrl" text,
    "widgetTitle" character varying(100),
    status character varying(20) DEFAULT 'draft'::character varying,
    "trainedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIChatbotConfigs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIChatbotConfigs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIChatbotConfigs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIChatbotConfigs_id_seq" OWNED BY public."AIChatbotConfigs".id;


--
-- Name: AIChatbotDataSources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIChatbotDataSources" (
    id integer NOT NULL,
    "chatbotId" integer NOT NULL,
    "companyId" integer NOT NULL,
    type character varying(30) NOT NULL,
    content text,
    "fileUrl" text,
    "sourceUrl" text,
    status character varying(20) DEFAULT 'pending'::character varying,
    "chunksCount" integer DEFAULT 0,
    "tokensCount" integer DEFAULT 0,
    "errorMessage" text,
    "processedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIChatbotDataSources_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIChatbotDataSources_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIChatbotDataSources_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIChatbotDataSources_id_seq" OWNED BY public."AIChatbotDataSources".id;


--
-- Name: AIChatbotDomains; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIChatbotDomains" (
    id integer NOT NULL,
    uuid character varying(36) DEFAULT (gen_random_uuid())::character varying NOT NULL,
    "chatbotId" integer NOT NULL,
    "companyId" integer NOT NULL,
    domain character varying(255) NOT NULL,
    "appKey" character varying(64) NOT NULL,
    "sslEnabled" boolean DEFAULT false,
    "customCss" text,
    "customJs" text,
    "allowedOrigins" jsonb DEFAULT '["*"]'::jsonb,
    status character varying(20) DEFAULT 'pending_dns'::character varying,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIChatbotDomains_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIChatbotDomains_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIChatbotDomains_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIChatbotDomains_id_seq" OWNED BY public."AIChatbotDomains".id;


--
-- Name: AIChunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIChunks" (
    id integer NOT NULL,
    "documentId" integer NOT NULL,
    "companyId" integer NOT NULL,
    content text NOT NULL,
    "chunkIndex" integer DEFAULT 0 NOT NULL,
    "tokenCount" integer DEFAULT 0,
    embedding public.vector(1536),
    topic character varying(255),
    keywords text[],
    "parentChunkId" integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AIChunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIChunks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIChunks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIChunks_id_seq" OWNED BY public."AIChunks".id;


--
-- Name: AICompanyExtensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AICompanyExtensions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "extensionId" integer NOT NULL,
    installed boolean DEFAULT false,
    "configOverride" jsonb DEFAULT '{}'::jsonb,
    "installedAt" timestamp with time zone
);


--
-- Name: AICompanyExtensions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AICompanyExtensions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AICompanyExtensions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AICompanyExtensions_id_seq" OWNED BY public."AICompanyExtensions".id;


--
-- Name: AICreditBalances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AICreditBalances" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "creditTypeId" integer NOT NULL,
    "totalCredits" numeric(15,4) DEFAULT 0,
    "usedCredits" numeric(15,4) DEFAULT 0,
    "resetAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AICreditBalances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AICreditBalances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AICreditBalances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AICreditBalances_id_seq" OWNED BY public."AICreditBalances".id;


--
-- Name: AICreditTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AICreditTransactions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "creditTypeId" integer NOT NULL,
    amount integer NOT NULL,
    direction character varying(10) DEFAULT 'debit'::character varying NOT NULL,
    "balanceBefore" integer DEFAULT 0 NOT NULL,
    "balanceAfter" integer DEFAULT 0 NOT NULL,
    source character varying(50) DEFAULT 'consumo'::character varying NOT NULL,
    "sourceId" character varying(255),
    description text,
    "userId" integer,
    "createdAt" timestamp with time zone DEFAULT now(),
    "tokensUsed" bigint,
    "realCostUsd" numeric(12,6)
);


--
-- Name: AICreditTransactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AICreditTransactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AICreditTransactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AICreditTransactions_id_seq" OWNED BY public."AICreditTransactions".id;


--
-- Name: AICreditTypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AICreditTypes" (
    id integer NOT NULL,
    key character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    unit character varying(30) DEFAULT 'unit'::character varying NOT NULL,
    "defaultCost" numeric(10,6) DEFAULT 0,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    category character varying(255)
);


--
-- Name: AICreditTypes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AICreditTypes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AICreditTypes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AICreditTypes_id_seq" OWNED BY public."AICreditTypes".id;


--
-- Name: AIDocuments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIDocuments" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    title character varying(500) NOT NULL,
    "sourceType" character varying(50) DEFAULT 'text'::character varying NOT NULL,
    "sourceUrl" text,
    "filePath" text,
    "fileSizeBytes" bigint DEFAULT 0,
    "chunksCount" integer DEFAULT 0,
    "tokensCount" integer DEFAULT 0,
    status character varying(30) DEFAULT 'pending'::character varying,
    "errorMessage" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "processedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AIDocuments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIDocuments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIDocuments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIDocuments_id_seq" OWNED BY public."AIDocuments".id;


--
-- Name: AIEmailTemplates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIEmailTemplates" (
    id integer NOT NULL,
    "companyId" integer,
    type character varying(20) DEFAULT 'system'::character varying,
    slug character varying(100) NOT NULL,
    subject character varying(500) NOT NULL,
    body text NOT NULL,
    variables text[] DEFAULT '{}'::text[],
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIEmailTemplates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIEmailTemplates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIEmailTemplates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIEmailTemplates_id_seq" OWNED BY public."AIEmailTemplates".id;


--
-- Name: AIEntities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIEntities" (
    id integer NOT NULL,
    key character varying(100) NOT NULL,
    title character varying(150) NOT NULL,
    engine character varying(50) NOT NULL,
    type character varying(30) NOT NULL,
    "inputPrice" numeric(10,6) DEFAULT 0,
    "outputPrice" numeric(10,6) DEFAULT 0,
    "maxTokens" integer DEFAULT 4096,
    capabilities jsonb DEFAULT '[]'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    "isSelected" boolean DEFAULT false,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AIEntities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIEntities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIEntities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIEntities_id_seq" OWNED BY public."AIEntities".id;


--
-- Name: AIExtensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIExtensions" (
    id integer NOT NULL,
    slug character varying(100) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    version character varying(20) DEFAULT '1.0.0'::character varying,
    "isCore" boolean DEFAULT false,
    "requiredPlan" character varying(50),
    config jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIExtensions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIExtensions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIExtensions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIExtensions_id_seq" OWNED BY public."AIExtensions".id;


--
-- Name: AIFineTuningJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIFineTuningJobs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "jobId" character varying(100),
    provider character varying(30) DEFAULT 'openai'::character varying,
    "baseModel" character varying(60) NOT NULL,
    "fineTunedModel" character varying(120),
    "trainingFileId" character varying(100),
    "validationFileId" character varying(100),
    status character varying(30) DEFAULT 'pending'::character varying,
    hyperparameters jsonb DEFAULT '{"n_epochs": 3, "batch_size": "auto", "learning_rate_multiplier": "auto"}'::jsonb,
    "trainingSamples" integer DEFAULT 0,
    "validationSamples" integer DEFAULT 0,
    "trainedTokens" integer DEFAULT 0,
    "estimatedCostUsd" numeric(10,4) DEFAULT 0,
    "actualCostUsd" numeric(10,4) DEFAULT 0,
    "errorMessage" text,
    "dataSource" character varying(30) DEFAULT 'tickets'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AIFineTuningJobs_dataSource_check" CHECK ((("dataSource")::text = ANY (ARRAY[('tickets'::character varying)::text, ('kb'::character varying)::text, ('manual'::character varying)::text, ('mixed'::character varying)::text]))),
    CONSTRAINT "AIFineTuningJobs_status_check" CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('preparing'::character varying)::text, ('uploading'::character varying)::text, ('training'::character varying)::text, ('succeeded'::character varying)::text, ('failed'::character varying)::text, ('cancelled'::character varying)::text])))
);


--
-- Name: AIFineTuningJobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIFineTuningJobs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIFineTuningJobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIFineTuningJobs_id_seq" OWNED BY public."AIFineTuningJobs".id;


--
-- Name: AIHistoricalQA; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIHistoricalQA" (
    id bigint NOT NULL,
    "companyId" integer NOT NULL,
    "sourceTicketId" integer,
    "sourceMessageId" integer,
    "sourceContactId" integer,
    "sourceAgentLogId" integer,
    question text NOT NULL,
    "normalizedQuestion" text NOT NULL,
    answer text NOT NULL,
    "answerType" character varying(20) DEFAULT 'ai_verified'::character varying NOT NULL,
    intent character varying(100),
    language character varying(10) DEFAULT 'es'::character varying,
    channel character varying(30),
    tags text[] DEFAULT ARRAY[]::text[],
    "productKey" character varying(100),
    embedding public.vector(1536),
    "usedCount" integer DEFAULT 0 NOT NULL,
    "lastUsedAt" timestamp with time zone,
    rating numeric(3,2),
    verified boolean DEFAULT false NOT NULL,
    superseded boolean DEFAULT false NOT NULL,
    "supersededBy" bigint,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AIHistoricalQA_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIHistoricalQA_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIHistoricalQA_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIHistoricalQA_id_seq" OWNED BY public."AIHistoricalQA".id;


--
-- Name: AIImageCreditTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIImageCreditTransactions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    "aiImageGenerationId" integer,
    "transactionType" character varying(50) NOT NULL,
    "creditsAmount" integer NOT NULL,
    "costUsd" numeric(10,5),
    description character varying(100),
    metadata jsonb,
    status character varying(50) DEFAULT 'completed'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_credits_amount CHECK (("creditsAmount" > 0)),
    CONSTRAINT check_transaction_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('refunded'::character varying)::text]))),
    CONSTRAINT check_transaction_type CHECK ((("transactionType")::text = ANY (ARRAY[('debit'::character varying)::text, ('credit'::character varying)::text, ('refund'::character varying)::text])))
);


--
-- Name: TABLE "AIImageCreditTransactions"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AIImageCreditTransactions" IS 'Registro de transacciones de créditos para generación de imágenes';


--
-- Name: COLUMN "AIImageCreditTransactions"."transactionType"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageCreditTransactions"."transactionType" IS 'Tipo de transacción: debit (resta), credit (suma), refund (reembolso)';


--
-- Name: COLUMN "AIImageCreditTransactions"."creditsAmount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageCreditTransactions"."creditsAmount" IS 'Cantidad de créditos (siempre positivo, el tipo indica si suma o resta)';


--
-- Name: AIImageCreditTransactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIImageCreditTransactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIImageCreditTransactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIImageCreditTransactions_id_seq" OWNED BY public."AIImageCreditTransactions".id;


--
-- Name: AIImageGenerationItems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIImageGenerationItems" (
    id integer NOT NULL,
    "aiImageGenerationId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "originalUrl" character varying(500),
    "fileSize" bigint,
    "mimeType" character varying(50) DEFAULT 'image/png'::character varying,
    "downloadCount" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_download_count CHECK (("downloadCount" >= 0)),
    CONSTRAINT check_file_size CHECK ((("fileSize" > 0) OR ("fileSize" IS NULL)))
);


--
-- Name: TABLE "AIImageGenerationItems"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AIImageGenerationItems" IS 'Almacena cada imagen individual generada';


--
-- Name: COLUMN "AIImageGenerationItems"."fileName"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerationItems"."fileName" IS 'Nombre del archivo almacenado en el servidor';


--
-- Name: COLUMN "AIImageGenerationItems"."originalUrl"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerationItems"."originalUrl" IS 'URL temporal de OpenAI (expira en 1 hora)';


--
-- Name: COLUMN "AIImageGenerationItems"."downloadCount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerationItems"."downloadCount" IS 'Contador de descargas de la imagen';


--
-- Name: AIImageGenerationItems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIImageGenerationItems_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIImageGenerationItems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIImageGenerationItems_id_seq" OWNED BY public."AIImageGenerationItems".id;


--
-- Name: AIImageGenerations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIImageGenerations" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    "aiProviderConfigId" integer,
    prompt text NOT NULL,
    "imageSize" character varying(50) NOT NULL,
    "numberOfImages" integer DEFAULT 1 NOT NULL,
    "stylePreset" character varying(100),
    model character varying(50) DEFAULT 'dall-e-3'::character varying NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    "errorMessage" text,
    "totalCreditsUsed" integer NOT NULL,
    "totalCostUsd" numeric(10,5),
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT check_image_size CHECK ((("imageSize")::text = ANY (ARRAY[('1024x1024'::character varying)::text, ('512x512'::character varying)::text, ('256x256'::character varying)::text]))),
    CONSTRAINT check_model CHECK (((model)::text = ANY (ARRAY[('dall-e-2'::character varying)::text, ('dall-e-3'::character varying)::text]))),
    CONSTRAINT check_number_of_images CHECK ((("numberOfImages" >= 1) AND ("numberOfImages" <= 10))),
    CONSTRAINT check_status CHECK (((status)::text = ANY (ARRAY[('pending'::character varying)::text, ('processing'::character varying)::text, ('completed'::character varying)::text, ('failed'::character varying)::text, ('partial_failure'::character varying)::text])))
);


--
-- Name: TABLE "AIImageGenerations"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."AIImageGenerations" IS 'Almacena las solicitudes de generación de imágenes con IA';


--
-- Name: COLUMN "AIImageGenerations"."imageSize"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerations"."imageSize" IS 'Tamaño de imagen: 1024x1024, 512x512, 256x256';


--
-- Name: COLUMN "AIImageGenerations".status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerations".status IS 'Estado: pending, processing, completed, failed, partial_failure';


--
-- Name: COLUMN "AIImageGenerations"."totalCreditsUsed"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIImageGenerations"."totalCreditsUsed" IS 'Total de créditos consumidos en esta generación';


--
-- Name: AIImageGenerations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIImageGenerations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIImageGenerations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIImageGenerations_id_seq" OWNED BY public."AIImageGenerations".id;


--
-- Name: AIPromptTemplates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIPromptTemplates" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "createdBy" integer,
    name character varying(100) NOT NULL,
    description text,
    category character varying(50) DEFAULT 'general'::character varying,
    "systemPrompt" text NOT NULL,
    "userPromptTemplate" text,
    variables jsonb DEFAULT '[]'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    "preferredModel" character varying(50),
    "maxTokens" integer DEFAULT 1000,
    temperature numeric(3,2) DEFAULT 0.7,
    "topP" numeric(3,2) DEFAULT 1,
    "frequencyPenalty" numeric(3,2) DEFAULT 0,
    "presencePenalty" numeric(3,2) DEFAULT 0,
    "usageCount" integer DEFAULT 0,
    "totalTokensUsed" bigint DEFAULT 0,
    "avgResponseTime" numeric(10,5) DEFAULT 0,
    "successRate" numeric(5,2) DEFAULT 0,
    "isActive" boolean DEFAULT true,
    "isPublic" boolean DEFAULT false,
    "isSystem" boolean DEFAULT false,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: AIPromptTemplates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIPromptTemplates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIPromptTemplates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIPromptTemplates_id_seq" OWNED BY public."AIPromptTemplates".id;


--
-- Name: AIProviderConfigs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIProviderConfigs" (
    id integer NOT NULL,
    "companyId" integer,
    provider character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    "apiKey" text NOT NULL,
    "apiSecret" text,
    "baseUrl" character varying(255),
    "isActive" boolean DEFAULT true,
    "isDefault" boolean DEFAULT false,
    settings jsonb DEFAULT '{}'::jsonb,
    "dailyTokenLimit" integer DEFAULT 100000,
    "hourlyTokenLimit" integer DEFAULT 10000,
    "requestsPerMinute" integer DEFAULT 1000,
    "totalTokensUsed" bigint DEFAULT 0,
    "totalRequests" bigint DEFAULT 0,
    "totalCost" numeric(12,5) DEFAULT 0,
    "connectionStatus" character varying(50) DEFAULT 'pending'::character varying,
    "lastTestedAt" timestamp without time zone,
    "lastError" text,
    "availableModels" jsonb DEFAULT '[]'::jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "textGenerationEnabled" boolean DEFAULT true NOT NULL,
    "translationEnabled" boolean DEFAULT false NOT NULL,
    "imageGenerationEnabled" boolean DEFAULT false NOT NULL,
    "imageAnalysisEnabled" boolean DEFAULT false NOT NULL,
    "speechToTextEnabled" boolean DEFAULT false NOT NULL,
    "textToSpeechEnabled" boolean DEFAULT false,
    "isDefaultForText" boolean DEFAULT false,
    "isDefaultForTranslation" boolean DEFAULT false,
    "isDefaultForImages" boolean DEFAULT false,
    "isDefaultForImageAnalysis" boolean DEFAULT false,
    "isDefaultForSTT" boolean DEFAULT false,
    "isDefaultForTTS" boolean DEFAULT false,
    "textGenerationPricing" numeric(10,4) DEFAULT 2,
    "translationPricing" numeric(10,4) DEFAULT 3,
    "imageGenerationPricing" jsonb DEFAULT '{"256x256": 10, "512x512": 20, "1024x1024": 30}'::jsonb,
    "imageAnalysisPricing" numeric(10,4) DEFAULT 15,
    "speechToTextPricing" numeric(10,4) DEFAULT 10
);


--
-- Name: COLUMN "AIProviderConfigs"."textGenerationEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIProviderConfigs"."textGenerationEnabled" IS 'Habilita generacion de texto (chat, completions, respuestas de IA)';


--
-- Name: COLUMN "AIProviderConfigs"."translationEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIProviderConfigs"."translationEnabled" IS 'Habilita traduccion de texto entre idiomas';


--
-- Name: COLUMN "AIProviderConfigs"."imageGenerationEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIProviderConfigs"."imageGenerationEnabled" IS 'Habilita generacion de imagenes (DALL-E, Stable Diffusion)';


--
-- Name: COLUMN "AIProviderConfigs"."imageAnalysisEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIProviderConfigs"."imageAnalysisEnabled" IS 'Habilita Vision AI (analisis de imagenes, OCR, chat con imagenes)';


--
-- Name: COLUMN "AIProviderConfigs"."speechToTextEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AIProviderConfigs"."speechToTextEnabled" IS 'Habilita Speech-to-Text (transcripcion de audio con Whisper)';


--
-- Name: AIProviderConfigs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIProviderConfigs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIProviderConfigs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIProviderConfigs_id_seq" OWNED BY public."AIProviderConfigs".id;


--
-- Name: AIScheduledTasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIScheduledTasks" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    "taskType" character varying(40) NOT NULL,
    "cronExpression" character varying(50) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    status character varying(20) DEFAULT 'active'::character varying,
    "lastRunAt" timestamp with time zone,
    "nextRunAt" timestamp with time zone,
    "lastRunStatus" character varying(20),
    "lastRunDurationMs" integer,
    "lastRunError" text,
    "totalRuns" integer DEFAULT 0,
    "totalErrors" integer DEFAULT 0,
    "maxRetries" integer DEFAULT 3,
    "timeoutMs" integer DEFAULT 300000,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AIScheduledTasks_lastRunStatus_check" CHECK ((("lastRunStatus")::text = ANY (ARRAY[('success'::character varying)::text, ('error'::character varying)::text, ('timeout'::character varying)::text, ('skipped'::character varying)::text]))),
    CONSTRAINT "AIScheduledTasks_status_check" CHECK (((status)::text = ANY (ARRAY[('active'::character varying)::text, ('paused'::character varying)::text, ('disabled'::character varying)::text, ('error'::character varying)::text]))),
    CONSTRAINT "AIScheduledTasks_taskType_check" CHECK ((("taskType")::text = ANY (ARRAY[('kb_refresh'::character varying)::text, ('metrics_aggregation'::character varying)::text, ('ticket_auto_index'::character varying)::text, ('rss_ingest'::character varying)::text, ('cache_cleanup'::character varying)::text, ('credit_reset'::character varying)::text, ('fine_tuning_check'::character varying)::text, ('ab_test_evaluate'::character varying)::text, ('report_generate'::character varying)::text, ('custom'::character varying)::text])))
);


--
-- Name: AIScheduledTasks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIScheduledTasks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIScheduledTasks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIScheduledTasks_id_seq" OWNED BY public."AIScheduledTasks".id;


--
-- Name: AISemanticCache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AISemanticCache" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "queryEmbedding" public.vector(1536),
    "queryText" text NOT NULL,
    response text NOT NULL,
    "modelUsed" character varying(100),
    "agentUsed" character varying(50),
    "tokensInput" integer DEFAULT 0,
    "tokensOutput" integer DEFAULT 0,
    "costUsd" numeric(10,6) DEFAULT 0,
    "hitCount" integer DEFAULT 1,
    "lastHitAt" timestamp with time zone DEFAULT now(),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "expiresAt" timestamp with time zone DEFAULT (now() + '24:00:00'::interval)
);


--
-- Name: AISemanticCache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AISemanticCache_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AISemanticCache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AISemanticCache_id_seq" OWNED BY public."AISemanticCache".id;


--
-- Name: AISpans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AISpans" (
    id integer NOT NULL,
    "traceId" character varying(64) NOT NULL,
    "spanId" character varying(64) NOT NULL,
    "parentSpanId" character varying(64),
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(30) DEFAULT 'llm'::character varying,
    model character varying(60),
    provider character varying(30),
    input jsonb DEFAULT '{}'::jsonb,
    output jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "tokensInput" integer DEFAULT 0,
    "tokensOutput" integer DEFAULT 0,
    "costUsd" numeric(10,6) DEFAULT 0,
    "latencyMs" integer DEFAULT 0,
    status character varying(20) DEFAULT 'running'::character varying,
    "errorMessage" text,
    level character varying(10) DEFAULT 'DEFAULT'::character varying,
    "startedAt" timestamp with time zone DEFAULT now(),
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AISpans_level_check" CHECK (((level)::text = ANY (ARRAY[('DEBUG'::character varying)::text, ('DEFAULT'::character varying)::text, ('WARNING'::character varying)::text, ('ERROR'::character varying)::text]))),
    CONSTRAINT "AISpans_status_check" CHECK (((status)::text = ANY (ARRAY[('running'::character varying)::text, ('completed'::character varying)::text, ('error'::character varying)::text]))),
    CONSTRAINT "AISpans_type_check" CHECK (((type)::text = ANY (ARRAY[('llm'::character varying)::text, ('retrieval'::character varying)::text, ('tool'::character varying)::text, ('agent'::character varying)::text, ('embedding'::character varying)::text, ('reranking'::character varying)::text, ('guard'::character varying)::text, ('custom'::character varying)::text])))
);


--
-- Name: AISpans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AISpans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AISpans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AISpans_id_seq" OWNED BY public."AISpans".id;


--
-- Name: AISubplans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AISubplans" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    tokens bigint DEFAULT 0 NOT NULL,
    "priceUsd" numeric(10,2) DEFAULT 0,
    "tokensConsumed" bigint DEFAULT 0,
    "isActive" boolean DEFAULT true,
    "isPublic" boolean DEFAULT false,
    "stripeProductId" character varying(255),
    "stripePriceId" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "maxAgents" integer DEFAULT 1,
    "paypalProductId" character varying(255),
    "paypalPriceId" character varying(255)
);


--
-- Name: AISubplans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AISubplans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AISubplans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AISubplans_id_seq" OWNED BY public."AISubplans".id;


--
-- Name: AISupportCorrections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AISupportCorrections" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    problem text NOT NULL,
    solution text NOT NULL,
    category character varying(50) DEFAULT 'general'::character varying,
    embedding public.vector(1536),
    "isActive" boolean DEFAULT true NOT NULL,
    "usageCount" integer DEFAULT 0,
    "lastUsedAt" timestamp with time zone,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AISupportCorrections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AISupportCorrections_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AISupportCorrections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AISupportCorrections_id_seq" OWNED BY public."AISupportCorrections".id;


--
-- Name: AITeamMembers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AITeamMembers" (
    id integer NOT NULL,
    "teamId" integer NOT NULL,
    "userId" integer NOT NULL,
    role character varying(20) DEFAULT 'agent'::character varying,
    "unlimitedCredits" boolean DEFAULT false,
    "individualCredits" jsonb DEFAULT '{}'::jsonb,
    "usedCredits" jsonb DEFAULT '{}'::jsonb,
    "joinedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AITeamMembers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AITeamMembers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AITeamMembers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AITeamMembers_id_seq" OWNED BY public."AITeamMembers".id;


--
-- Name: AITeams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AITeams" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "managerId" integer NOT NULL,
    "maxSeats" integer DEFAULT 5,
    "aiModelsAllowed" jsonb DEFAULT '[]'::jsonb,
    features jsonb DEFAULT '[]'::jsonb,
    "sharedCredits" jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AITeams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AITeams_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AITeams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AITeams_id_seq" OWNED BY public."AITeams".id;


--
-- Name: AITraces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AITraces" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "traceId" character varying(64) NOT NULL,
    name character varying(100) NOT NULL,
    "sessionId" character varying(100),
    "userId" integer,
    "ticketId" integer,
    "contactId" integer,
    input jsonb DEFAULT '{}'::jsonb,
    output jsonb DEFAULT '{}'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    tags text[] DEFAULT '{}'::text[],
    status character varying(20) DEFAULT 'running'::character varying,
    "totalTokensInput" integer DEFAULT 0,
    "totalTokensOutput" integer DEFAULT 0,
    "totalCostUsd" numeric(10,6) DEFAULT 0,
    "totalLatencyMs" integer DEFAULT 0,
    "startedAt" timestamp with time zone DEFAULT now(),
    "completedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    CONSTRAINT "AITraces_status_check" CHECK (((status)::text = ANY (ARRAY[('running'::character varying)::text, ('completed'::character varying)::text, ('error'::character varying)::text])))
);


--
-- Name: AITraces_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AITraces_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AITraces_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AITraces_id_seq" OWNED BY public."AITraces".id;


--
-- Name: AIUsageLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIUsageLogs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "providerId" integer,
    "templateId" integer,
    model character varying(50),
    "inputTokens" integer DEFAULT 0,
    "outputTokens" integer DEFAULT 0,
    "totalTokens" integer DEFAULT 0,
    cost numeric(10,6) DEFAULT 0,
    "responseTime" integer DEFAULT 0,
    status character varying(20) DEFAULT 'success'::character varying,
    "errorMessage" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: AIUsageLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIUsageLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIUsageLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIUsageLogs_id_seq" OWNED BY public."AIUsageLogs".id;


--
-- Name: AIUsageMetrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIUsageMetrics" (
    id integer NOT NULL,
    "companyId" integer,
    date date NOT NULL,
    period character varying(10) DEFAULT 'daily'::character varying,
    "totalMessages" integer DEFAULT 0,
    "aiMessages" integer DEFAULT 0,
    "humanMessages" integer DEFAULT 0,
    "aiResolutions" integer DEFAULT 0,
    escalations integer DEFAULT 0,
    "routerCalls" integer DEFAULT 0,
    "ragCalls" integer DEFAULT 0,
    "salesCalls" integer DEFAULT 0,
    "supportCalls" integer DEFAULT 0,
    "escalationCalls" integer DEFAULT 0,
    "totalTokensInput" bigint DEFAULT 0,
    "totalTokensOutput" bigint DEFAULT 0,
    "totalCostUsd" numeric(10,4) DEFAULT 0,
    "avgLatencyMs" integer DEFAULT 0,
    "cacheHitRate" numeric(5,2) DEFAULT 0,
    "avgConfidence" numeric(3,2) DEFAULT 0,
    "newCompanies" integer DEFAULT 0,
    "activeCompanies" integer DEFAULT 0,
    "mrrUsd" numeric(10,2) DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: AIUsageMetrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIUsageMetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIUsageMetrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIUsageMetrics_id_seq" OWNED BY public."AIUsageMetrics".id;


--
-- Name: AIVideoCreditTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIVideoCreditTransactions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    "aiVideoGenerationId" integer,
    "transactionType" character varying(50) NOT NULL,
    "creditsAmount" integer NOT NULL,
    "costUsd" numeric(10,5),
    description character varying(100),
    metadata jsonb,
    status character varying(50) DEFAULT 'completed'::character varying NOT NULL,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: AIVideoCreditTransactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIVideoCreditTransactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIVideoCreditTransactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIVideoCreditTransactions_id_seq" OWNED BY public."AIVideoCreditTransactions".id;


--
-- Name: AIVideoGenerationItems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIVideoGenerationItems" (
    id integer NOT NULL,
    "aiVideoGenerationId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "originalUrl" character varying(500),
    "fileSize" bigint,
    "mimeType" character varying(50) DEFAULT 'video/mp4'::character varying,
    duration integer,
    "downloadCount" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: AIVideoGenerationItems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIVideoGenerationItems_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIVideoGenerationItems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIVideoGenerationItems_id_seq" OWNED BY public."AIVideoGenerationItems".id;


--
-- Name: AIVideoGenerations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AIVideoGenerations" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    "aiProviderConfigId" integer,
    prompt text NOT NULL,
    "videoSize" character varying(50) NOT NULL,
    duration integer NOT NULL,
    "stylePreset" character varying(100),
    model character varying(50) DEFAULT 'sora-2'::character varying NOT NULL,
    status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    "errorMessage" text,
    "totalCreditsUsed" integer NOT NULL,
    "totalCostUsd" numeric(10,5),
    "openaiVideoId" character varying(255),
    progress integer,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: AIVideoGenerations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AIVideoGenerations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AIVideoGenerations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AIVideoGenerations_id_seq" OWNED BY public."AIVideoGenerations".id;


--
-- Name: AffiliateLinks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateLinks" (
    id integer NOT NULL,
    "affiliateId" integer NOT NULL,
    "companyId" integer NOT NULL,
    slug character varying(50) NOT NULL,
    "targetUrl" text NOT NULL,
    source character varying(50),
    medium character varying(50),
    clicks integer DEFAULT 0 NOT NULL,
    conversions integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AffiliateLinks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateLinks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateLinks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateLinks_id_seq" OWNED BY public."AffiliateLinks".id;


--
-- Name: AffiliateTiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateTiers" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(50) NOT NULL,
    level integer DEFAULT 1 NOT NULL,
    "commissionRate" numeric(5,2) DEFAULT 10.00 NOT NULL,
    "level2Rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "level3Rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "minReferrals" integer DEFAULT 0 NOT NULL,
    "minEarnings" numeric(10,2) DEFAULT 0 NOT NULL,
    "bonusRate" numeric(5,2) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AffiliateTiers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateTiers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateTiers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateTiers_id_seq" OWNED BY public."AffiliateTiers".id;


--
-- Name: AffiliateTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateTransactions" (
    id integer NOT NULL,
    "walletId" integer NOT NULL,
    "companyId" integer NOT NULL,
    type character varying(30) NOT NULL,
    amount numeric(12,2) NOT NULL,
    "balanceBefore" numeric(12,2) DEFAULT 0 NOT NULL,
    "balanceAfter" numeric(12,2) DEFAULT 0 NOT NULL,
    description text,
    "referenceType" character varying(50),
    "referenceId" integer,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AffiliateTransactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateTransactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateTransactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateTransactions_id_seq" OWNED BY public."AffiliateTransactions".id;


--
-- Name: AffiliateWallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateWallets" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "affiliateId" integer NOT NULL,
    "availableBalance" numeric(12,2) DEFAULT 0 NOT NULL,
    "pendingBalance" numeric(12,2) DEFAULT 0 NOT NULL,
    "totalEarned" numeric(12,2) DEFAULT 0 NOT NULL,
    "totalWithdrawn" numeric(12,2) DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'USD'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AffiliateWallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateWallets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateWallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateWallets_id_seq" OWNED BY public."AffiliateWallets".id;


--
-- Name: AffiliateWithdrawals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AffiliateWithdrawals" (
    id integer NOT NULL,
    "walletId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "affiliateId" integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    fee numeric(10,2) DEFAULT 0 NOT NULL,
    "netAmount" numeric(12,2) NOT NULL,
    "paymentMethod" character varying(30) NOT NULL,
    "paymentDetails" jsonb,
    status character varying(20) DEFAULT 'requested'::character varying NOT NULL,
    "requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "processedAt" timestamp with time zone,
    "processedBy" integer,
    "rejectionReason" text,
    "transactionRef" character varying(100),
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AffiliateWithdrawals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AffiliateWithdrawals_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AffiliateWithdrawals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AffiliateWithdrawals_id_seq" OWNED BY public."AffiliateWithdrawals".id;


--
-- Name: AgentDevices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentDevices" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "deviceId" character varying(255) NOT NULL,
    name character varying(255),
    model character varying(255),
    "androidVersion" character varying(50),
    ip character varying(50),
    "proxyConfig" jsonb DEFAULT '{}'::jsonb,
    fingerprint jsonb DEFAULT '{}'::jsonb,
    "simNumber" character varying(50),
    "assignedIdentityId" integer,
    status character varying(50) DEFAULT 'offline'::character varying,
    "lastHeartbeat" timestamp with time zone,
    "dailyActionCount" integer DEFAULT 0,
    "dailyActionLimit" integer DEFAULT 100,
    "cooldownUntil" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AgentDevices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AgentDevices_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AgentDevices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AgentDevices_id_seq" OWNED BY public."AgentDevices".id;


--
-- Name: AgentIdentities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentIdentities" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "usernameSuggestion" character varying(255),
    age integer,
    city character varying(255),
    occupation character varying(255),
    "bioInstagram" text,
    "bioTiktok" text,
    "personalityTraits" jsonb DEFAULT '[]'::jsonb,
    "communicationStyle" text,
    "writingExamples" jsonb DEFAULT '[]'::jsonb,
    interests jsonb DEFAULT '[]'::jsonb,
    catchphrases jsonb DEFAULT '[]'::jsonb,
    "favoriteBrands" jsonb DEFAULT '[]'::jsonb,
    "contentPillars" jsonb DEFAULT '[]'::jsonb,
    "activeHours" jsonb DEFAULT '{}'::jsonb,
    "responseStyle" jsonb DEFAULT '{}'::jsonb,
    "physicalDescription" jsonb DEFAULT '{}'::jsonb,
    backstory text,
    niche character varying(100),
    "platformFocus" jsonb DEFAULT '[]'::jsonb,
    status character varying(50) DEFAULT 'draft'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AgentIdentities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AgentIdentities_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AgentIdentities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AgentIdentities_id_seq" OWNED BY public."AgentIdentities".id;


--
-- Name: AgentInteractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentInteractions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "agentIdentityId" integer NOT NULL,
    "agentDeviceId" integer,
    type character varying(50) NOT NULL,
    platform character varying(50) NOT NULL,
    content text,
    "targetPostId" character varying(255),
    "targetUserId" character varying(255),
    "targetCommentId" character varying(255),
    sentiment character varying(50),
    "consistencyScore" numeric(3,2),
    "executedAt" timestamp with time zone,
    "executionStatus" character varying(50) DEFAULT 'pending'::character varying,
    "failureReason" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AgentInteractions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AgentInteractions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AgentInteractions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AgentInteractions_id_seq" OWNED BY public."AgentInteractions".id;


--
-- Name: AgentMemories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentMemories" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "agentIdentityId" integer NOT NULL,
    "memoryType" character varying(50) DEFAULT 'past_post'::character varying,
    content text NOT NULL,
    context text,
    "extractedBy" character varying(50) DEFAULT 'seed'::character varying,
    confidence numeric(3,2) DEFAULT 1.00,
    "validUntil" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AgentMemories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AgentMemories_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AgentMemories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AgentMemories_id_seq" OWNED BY public."AgentMemories".id;


--
-- Name: AgentProfilePhotos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AgentProfilePhotos" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "agentIdentityId" integer NOT NULL,
    "photoType" character varying(50) DEFAULT 'profile'::character varying,
    url character varying(1024) NOT NULL,
    "originalUrl" character varying(1024),
    "dallePrompt" text,
    "dalleRevisedPrompt" text,
    "localPath" character varying(1024),
    "fileSize" integer,
    "isActive" boolean DEFAULT true,
    version integer DEFAULT 1,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AgentProfilePhotos_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AgentProfilePhotos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AgentProfilePhotos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AgentProfilePhotos_id_seq" OWNED BY public."AgentProfilePhotos".id;


--
-- Name: AiTokenPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiTokenPlans" (
    id integer NOT NULL,
    code character varying(40),
    name character varying(50) NOT NULL,
    "priceUsd" numeric(10,2) NOT NULL,
    tokens bigint NOT NULL,
    "isRecurring" boolean DEFAULT false,
    "stripePriceIdOneTime" character varying(120),
    "stripePriceIdRecurring" character varying(120),
    "stripeProductId" character varying(120),
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "planAiTools" jsonb DEFAULT '[]'::jsonb,
    "planFeatures" jsonb DEFAULT '[]'::jsonb,
    "aiModels" jsonb DEFAULT '[]'::jsonb,
    "multiModelSupport" boolean DEFAULT false,
    "trialDays" integer DEFAULT 0,
    "resetCreditsOnRenewal" boolean DEFAULT true,
    "isTeamPlan" boolean DEFAULT false,
    "maxSeats" integer DEFAULT 1,
    "maxKbDocuments" integer DEFAULT 10,
    "maxChatbots" integer DEFAULT 1,
    "extensionsIncluded" jsonb DEFAULT '[]'::jsonb
);


--
-- Name: AiTokenPlans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AiTokenPlans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AiTokenPlans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AiTokenPlans_id_seq" OWNED BY public."AiTokenPlans".id;


--
-- Name: AiTokenTransactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AiTokenTransactions" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "planId" integer,
    type character varying(20) NOT NULL,
    tokens bigint NOT NULL,
    "amountUsd" numeric(18,10),
    "stripePaymentIntentId" character varying(255),
    "stripeSubscriptionId" character varying(255),
    "userId" integer,
    description text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    module character varying(50),
    "referenceId" character varying(120),
    "stripeSessionId" character varying(120),
    meta jsonb,
    "balanceAfter" bigint
);


--
-- Name: COLUMN "AiTokenTransactions"."amountUsd"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AiTokenTransactions"."amountUsd" IS 'Monto en USD de compras o consumos';


--
-- Name: COLUMN "AiTokenTransactions".module; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."AiTokenTransactions".module IS 'Módulo que consumió tokens';


--
-- Name: AiTokenTransactions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AiTokenTransactions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AiTokenTransactions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AiTokenTransactions_id_seq" OWNED BY public."AiTokenTransactions".id;


--
-- Name: Announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Announcements" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    text text NOT NULL,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    priority integer DEFAULT 1,
    status boolean DEFAULT true,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Announcements_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Announcements_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Announcements_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Announcements_id_seq" OWNED BY public."Announcements".id;


--
-- Name: ApiFailedMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiFailedMessages" (
    id integer NOT NULL,
    "companyId" integer DEFAULT 0,
    "whatsappId" integer,
    number character varying(50),
    message text,
    error text,
    "errorCode" character varying(50),
    "errorSubcode" character varying(50),
    "fbtraceId" character varying(100),
    status character varying(20) DEFAULT 'pending'::character varying,
    "retryCount" integer DEFAULT 0,
    "ticketId" integer,
    endpoint character varying(50) DEFAULT 'send-template'::character varying,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: ApiFailedMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ApiFailedMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ApiFailedMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ApiFailedMessages_id_seq" OWNED BY public."ApiFailedMessages".id;


--
-- Name: ApiUsages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApiUsages" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "dateUsed" date NOT NULL,
    "usedOnDay" integer DEFAULT 0,
    "usedText" integer DEFAULT 0,
    "usedPDF" integer DEFAULT 0,
    "usedImage" integer DEFAULT 0,
    "usedVideo" integer DEFAULT 0,
    "usedOther" integer DEFAULT 0,
    "usedCheckNumber" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "successCount" integer DEFAULT 0,
    "failedCount" integer DEFAULT 0,
    "totalSent" integer DEFAULT 0
);


--
-- Name: ApiUsages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ApiUsages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ApiUsages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ApiUsages_id_seq" OWNED BY public."ApiUsages".id;


--
-- Name: ApplePurchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ApplePurchases" (
    id integer NOT NULL,
    "companyId" integer,
    "planId" integer,
    "userId" integer,
    "transactionId" character varying(255),
    "originalTransactionId" character varying(255),
    "productId" character varying(255),
    "bundleId" character varying(255),
    "purchaseDate" timestamp without time zone,
    "expiresDate" timestamp without time zone,
    "isTrialPeriod" boolean DEFAULT false,
    "isInIntroOfferPeriod" boolean DEFAULT false,
    quantity integer DEFAULT 1,
    "webOrderLineItemId" character varying(255),
    "subscriptionGroupIdentifier" character varying(255),
    environment character varying(50),
    status character varying(50),
    "rawReceipt" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ApplePurchases_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ApplePurchases_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ApplePurchases_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ApplePurchases_id_seq" OWNED BY public."ApplePurchases".id;


--
-- Name: AttributionChannelAggregates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttributionChannelAggregates" (
    id integer NOT NULL,
    "companyId" integer,
    channel character varying(255),
    period character varying(20),
    "periodStart" timestamp without time zone,
    "periodEnd" timestamp without time zone,
    touchpoints integer DEFAULT 0,
    conversions integer DEFAULT 0,
    revenue numeric(12,2) DEFAULT 0,
    model character varying(50),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "campaignId" character varying(100)
);


--
-- Name: AttributionChannelAggregates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AttributionChannelAggregates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AttributionChannelAggregates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AttributionChannelAggregates_id_seq" OWNED BY public."AttributionChannelAggregates".id;


--
-- Name: AttributionConversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttributionConversions" (
    id integer NOT NULL,
    "companyId" integer,
    "contactId" integer,
    "conversionType" character varying(255),
    "conversionValue" numeric(10,2),
    currency character varying(10) DEFAULT 'USD'::character varying,
    "ticketId" integer,
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "totalRevenue" numeric(15,2) DEFAULT 0,
    "orderId" character varying(100),
    "orderDate" timestamp with time zone,
    "conversionDurationHours" numeric(10,2)
);


--
-- Name: AttributionConversions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AttributionConversions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AttributionConversions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AttributionConversions_id_seq" OWNED BY public."AttributionConversions".id;


--
-- Name: AttributionResults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttributionResults" (
    id integer NOT NULL,
    "companyId" integer,
    "conversionId" integer,
    "touchpointId" integer,
    model character varying(50),
    credit numeric(5,4),
    "creditValue" numeric(10,2),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: AttributionResults_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AttributionResults_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AttributionResults_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AttributionResults_id_seq" OWNED BY public."AttributionResults".id;


--
-- Name: AttributionTouchpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AttributionTouchpoints" (
    id integer NOT NULL,
    "companyId" integer,
    "contactId" integer,
    channel character varying(255),
    "touchpointType" character varying(255),
    "campaignId" integer,
    "campaignShippingId" integer,
    "messageId" integer,
    "ticketId" integer,
    "ctwaClid" character varying(255),
    fbclid character varying(255),
    "utmSource" character varying(255),
    "utmMedium" character varying(255),
    "utmCampaign" character varying(255),
    "utmContent" character varying(255),
    "utmTerm" character varying(255),
    metadata jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: AttributionTouchpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AttributionTouchpoints_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AttributionTouchpoints_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AttributionTouchpoints_id_seq" OWNED BY public."AttributionTouchpoints".id;


--
-- Name: AutomationRules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."AutomationRules" (
    id integer NOT NULL,
    "companyId" integer,
    name character varying(255),
    event character varying(255),
    conditions jsonb DEFAULT '[]'::jsonb,
    actions jsonb DEFAULT '[]'::jsonb,
    active boolean DEFAULT true,
    priority integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: AutomationRules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."AutomationRules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: AutomationRules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."AutomationRules_id_seq" OWNED BY public."AutomationRules".id;


--
-- Name: Baileys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Baileys" (
    id integer NOT NULL,
    "whatsappId" integer NOT NULL,
    contacts text,
    chats text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Baileys_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Baileys_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Baileys_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Baileys_id_seq" OWNED BY public."Baileys".id;


--
-- Name: CampaignAlerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignAlerts" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" character varying(50) NOT NULL,
    "campaignName" character varying(255) NOT NULL,
    "alertType" public."enum_CampaignAlerts_alertType" NOT NULL,
    severity public."enum_CampaignAlerts_severity" DEFAULT 'warning'::public."enum_CampaignAlerts_severity" NOT NULL,
    title character varying(255) NOT NULL,
    message text NOT NULL,
    metric character varying(50),
    "currentValue" double precision,
    "thresholdValue" double precision,
    status public."enum_CampaignAlerts_status" DEFAULT 'active'::public."enum_CampaignAlerts_status" NOT NULL,
    "acknowledgedBy" integer,
    "acknowledgedAt" timestamp with time zone,
    "resolvedAt" timestamp with time zone,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CampaignAlerts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignAlerts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignAlerts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignAlerts_id_seq" OWNED BY public."CampaignAlerts".id;


--
-- Name: CampaignMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignMessages" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "contactId" integer NOT NULL,
    "messageId" integer,
    "ticketId" integer,
    "whatsappId" integer,
    "sourceId" character varying(100),
    "sourceType" character varying(50),
    "sourceUrl" text,
    headline character varying(255),
    body text,
    "ctwaClid" character varying(255),
    thumbnail text,
    channel character varying(50),
    "rawData" jsonb,
    "conversionNote" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "conversionStatus" character varying(255),
    "adSetId" character varying,
    "campaignId" character varying,
    "campaignName" character varying,
    "adName" character varying,
    "adSetName" character varying
);


--
-- Name: TABLE "CampaignMessages"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."CampaignMessages" IS 'Mensajes que vienen de campañas publicitarias (Click-to-WhatsApp Ads)';


--
-- Name: COLUMN "CampaignMessages"."sourceId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CampaignMessages"."sourceId" IS 'ID del anuncio (ad_id)';


--
-- Name: COLUMN "CampaignMessages"."ctwaClid"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CampaignMessages"."ctwaClid" IS 'Click-to-WhatsApp tracking ID para atribución exacta';


--
-- Name: COLUMN "CampaignMessages"."conversionNote"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CampaignMessages"."conversionNote" IS 'Valor de conversión manual (ej: $100)';


--
-- Name: CampaignMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignMessages_id_seq" OWNED BY public."CampaignMessages".id;


--
-- Name: CampaignRecommendations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignRecommendations" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" character varying(50) NOT NULL,
    "campaignName" character varying(255) NOT NULL,
    type public.campaign_recommendation_type DEFAULT 'optimization'::public.campaign_recommendation_type NOT NULL,
    priority public.campaign_recommendation_priority DEFAULT 'medium'::public.campaign_recommendation_priority NOT NULL,
    category public.campaign_recommendation_category DEFAULT 'content'::public.campaign_recommendation_category NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    impact character varying(255),
    effort character varying(100),
    "potentialGain" character varying(255),
    "actionData" jsonb,
    status public.campaign_recommendation_status DEFAULT 'active'::public.campaign_recommendation_status NOT NULL,
    "appliedAt" timestamp with time zone,
    "appliedBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE "CampaignRecommendations"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."CampaignRecommendations" IS 'Recomendaciones de IA para campanas de Facebook';


--
-- Name: COLUMN "CampaignRecommendations"."campaignId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CampaignRecommendations"."campaignId" IS 'ID de Facebook guardado como STRING para evitar perdida de precision';


--
-- Name: COLUMN "CampaignRecommendations"."actionData"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CampaignRecommendations"."actionData" IS 'Datos estructurados para aplicar la recomendacion';


--
-- Name: CampaignRecommendations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignRecommendations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignRecommendations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignRecommendations_id_seq" OWNED BY public."CampaignRecommendations".id;


--
-- Name: CampaignRuleLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignRuleLogs" (
    id integer NOT NULL,
    "ruleId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" character varying(50),
    "campaignName" character varying(255),
    "executedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "conditionsMet" boolean DEFAULT false NOT NULL,
    "metricsSnapshot" jsonb,
    "actionsTaken" jsonb,
    result public."enum_CampaignRuleLogs_result" DEFAULT 'skipped'::public."enum_CampaignRuleLogs_result" NOT NULL,
    error text,
    "notificationsSent" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CampaignRuleLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignRuleLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignRuleLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignRuleLogs_id_seq" OWNED BY public."CampaignRuleLogs".id;


--
-- Name: CampaignRules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignRules" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    scope public."enum_CampaignRules_scope" DEFAULT 'campaign'::public."enum_CampaignRules_scope" NOT NULL,
    "scopeIds" jsonb,
    conditions jsonb NOT NULL,
    actions jsonb NOT NULL,
    "notificationPhones" jsonb,
    frequency public."enum_CampaignRules_frequency" DEFAULT 'hourly'::public."enum_CampaignRules_frequency" NOT NULL,
    "cooldownMinutes" integer DEFAULT 60 NOT NULL,
    status public."enum_CampaignRules_status" DEFAULT 'active'::public."enum_CampaignRules_status" NOT NULL,
    "lastExecutedAt" timestamp with time zone,
    "lastTriggeredAt" timestamp with time zone,
    "executionCount" integer DEFAULT 0,
    "triggerCount" integer DEFAULT 0,
    "consecutiveErrors" integer DEFAULT 0,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CampaignRules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignRules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignRules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignRules_id_seq" OWNED BY public."CampaignRules".id;


--
-- Name: CampaignSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignSettings" (
    id integer NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: CampaignSettings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignSettings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignSettings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignSettings_id_seq" OWNED BY public."CampaignSettings".id;


--
-- Name: CampaignShipping; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignShipping" (
    id integer NOT NULL,
    "jobId" character varying(255),
    number character varying(255) NOT NULL,
    message text NOT NULL,
    "confirmationMessage" text,
    confirmation boolean,
    "contactId" integer,
    "campaignId" integer NOT NULL,
    "confirmationRequestedAt" timestamp without time zone,
    "confirmedAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "failedAt" timestamp without time zone,
    "errorMessage" text,
    "metaMessageId" character varying(255)
);


--
-- Name: CampaignShipping_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignShipping_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignShipping_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignShipping_id_seq" OWNED BY public."CampaignShipping".id;


--
-- Name: CampaignShippings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CampaignShippings" (
    id integer NOT NULL,
    "jobId" character varying(255),
    number character varying(255),
    message text,
    "confirmationMessage" text,
    confirmation boolean,
    "confirmationRequestedAt" timestamp without time zone,
    "confirmedAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone,
    "campaignId" integer NOT NULL,
    "contactId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: CampaignShippings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CampaignShippings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CampaignShippings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CampaignShippings_id_seq" OWNED BY public."CampaignShippings".id;


--
-- Name: Campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Campaigns" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    message1 text DEFAULT ''::text,
    message2 text DEFAULT ''::text,
    message3 text DEFAULT ''::text,
    message4 text DEFAULT ''::text,
    message5 text DEFAULT ''::text,
    "confirmationMessage1" text DEFAULT ''::text,
    "confirmationMessage2" text DEFAULT ''::text,
    "confirmationMessage3" text DEFAULT ''::text,
    "confirmationMessage4" text DEFAULT ''::text,
    "confirmationMessage5" text DEFAULT ''::text,
    status character varying(255) DEFAULT 'INATIVA'::character varying,
    confirmation boolean,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    "scheduledAt" timestamp without time zone,
    "completedAt" timestamp without time zone,
    "companyId" integer NOT NULL,
    "contactListId" integer,
    "whatsappId" integer,
    "userId" integer,
    "queueId" integer,
    "statusTicket" character varying(255) DEFAULT 'closed'::character varying,
    "openTicket" character varying(255) DEFAULT 'disabled'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "whastsAppTemplateId" integer,
    "templateParams" jsonb DEFAULT '{}'::jsonb,
    "useTemplate" boolean DEFAULT false
);


--
-- Name: Campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Campaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Campaigns_id_seq" OWNED BY public."Campaigns".id;


--
-- Name: ChatMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatMessages" (
    id integer NOT NULL,
    "chatId" integer NOT NULL,
    "senderId" integer NOT NULL,
    message text NOT NULL,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "companyId" integer,
    status character varying,
    "isPinned" boolean,
    "readAt" timestamp without time zone,
    "deliveredAt" timestamp without time zone
);


--
-- Name: ChatMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatMessages_id_seq" OWNED BY public."ChatMessages".id;


--
-- Name: ChatUsers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ChatUsers" (
    id integer NOT NULL,
    "chatId" integer NOT NULL,
    "userId" integer NOT NULL,
    unreads integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ChatUsers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ChatUsers_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ChatUsers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ChatUsers_id_seq" OWNED BY public."ChatUsers".id;


--
-- Name: Chatbots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Chatbots" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "queueId" integer,
    "greetingMessage" text,
    options text,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "closeTicket" boolean DEFAULT false,
    "optUserId" integer,
    "chatbotId" integer,
    "isAgent" boolean,
    "queueType" character varying(255),
    "optQueueId" integer,
    "optIntegrationId" integer,
    "optFileId" integer
);


--
-- Name: Chatbots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Chatbots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Chatbots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Chatbots_id_seq" OWNED BY public."Chatbots".id;


--
-- Name: Chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Chats" (
    id integer NOT NULL,
    title character varying(255),
    "ownerId" integer NOT NULL,
    "lastMessage" text,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    uuid character varying(255)
);


--
-- Name: Chats_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Chats_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Chats_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Chats_id_seq" OWNED BY public."Chats".id;


--
-- Name: CommentAutoReplyCampaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommentAutoReplyCampaigns" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "campaignType" character varying(20) DEFAULT 'post'::character varying NOT NULL,
    platform character varying(20) DEFAULT 'facebook'::character varying NOT NULL,
    "pageId" character varying(255),
    "pageName" character varying(255),
    "pageAccessToken" text,
    "postId" character varying(255),
    "postPermalink" character varying(1024),
    "postDescription" text,
    "postThumbnail" character varying(1024),
    "replyMode" character varying(20) DEFAULT 'keyword'::character varying,
    "triggerMatchingType" character varying(10) DEFAULT 'contains'::character varying,
    "keywordRules" jsonb DEFAULT '[]'::jsonb,
    "defaultPublicReply" text,
    "defaultPrivateReply" text,
    "aiEnabled" boolean DEFAULT false,
    "aiTrainingData" text,
    "aiAgentIdentityId" integer,
    "autoLikeComment" boolean DEFAULT false,
    "hideCommentAfterReply" boolean DEFAULT false,
    "sendPrivateReply" boolean DEFAULT true,
    "sendPublicReply" boolean DEFAULT true,
    "offensiveWordsEnabled" boolean DEFAULT false,
    "offensiveWords" text,
    "offensiveAction" character varying(10) DEFAULT 'hide'::character varying,
    "offensivePrivateMessage" text,
    "multipleReply" boolean DEFAULT false,
    "delayEnabled" boolean DEFAULT false,
    "delayMinSeconds" integer DEFAULT 5,
    "delayMaxSeconds" integer DEFAULT 30,
    status character varying(20) DEFAULT 'active'::character varying,
    "totalRepliesSent" integer DEFAULT 0,
    "totalPrivateRepliesSent" integer DEFAULT 0,
    "totalCommentsHidden" integer DEFAULT 0,
    "totalCommentsDeleted" integer DEFAULT 0,
    "totalLikesGiven" integer DEFAULT 0,
    "lastReplyAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: CommentAutoReplyCampaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CommentAutoReplyCampaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CommentAutoReplyCampaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CommentAutoReplyCampaigns_id_seq" OWNED BY public."CommentAutoReplyCampaigns".id;


--
-- Name: CommentAutoReplyLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommentAutoReplyLogs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" integer NOT NULL,
    "platformCommentId" character varying(255) NOT NULL,
    "postId" character varying(255),
    "commentText" text NOT NULL,
    "commenterName" character varying(255),
    "commenterId" character varying(255),
    "commenterProfileUrl" character varying(1024),
    "commentedAt" timestamp with time zone,
    "publicReplyText" text,
    "publicReplyId" character varying(255),
    "publicReplyStatus" character varying(20) DEFAULT 'pending'::character varying,
    "privateReplyText" text,
    "privateReplyId" character varying(255),
    "privateReplyStatus" character varying(20) DEFAULT 'pending'::character varying,
    "wasLiked" boolean DEFAULT false,
    "wasHidden" boolean DEFAULT false,
    "wasDeleted" boolean DEFAULT false,
    "wasBlocked" boolean DEFAULT false,
    "matchedKeyword" character varying(255),
    "replySource" character varying(20) DEFAULT 'keyword'::character varying,
    "aiClassification" character varying(50),
    "aiSentiment" character varying(20),
    "aiPurchaseIntentScore" numeric(3,2),
    "errorMessage" text,
    "processedAt" timestamp with time zone DEFAULT now(),
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: CommentAutoReplyLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CommentAutoReplyLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CommentAutoReplyLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CommentAutoReplyLogs_id_seq" OWNED BY public."CommentAutoReplyLogs".id;


--
-- Name: CommentResponseSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CommentResponseSettings" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "whatsappId" integer NOT NULL,
    "socialPostId" integer,
    mode character varying(20) DEFAULT 'manual'::character varying NOT NULL,
    "autoMessage" text,
    "aiAgentConfigId" integer,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CommentResponseSettings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CommentResponseSettings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CommentResponseSettings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CommentResponseSettings_id_seq" OWNED BY public."CommentResponseSettings".id;


--
-- Name: Companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Companies" (
    id integer NOT NULL,
    name character varying(255),
    phone character varying(255),
    email character varying(255),
    document character varying(255) DEFAULT ''::character varying,
    "paymentMethod" character varying(255) DEFAULT ''::character varying,
    "lastLogin" timestamp with time zone,
    status boolean DEFAULT true,
    "dueDate" timestamp without time zone,
    recurrence character varying(255),
    "facebookAppId" character varying(255),
    "facebookAppSecret" character varying(255),
    schedules jsonb,
    "planId" integer,
    "folderSize" character varying(255) DEFAULT 0,
    "numberFileFolder" character varying(255) DEFAULT 0,
    "updatedAtFolder" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "paypalClientId" text,
    "paypalSecretKey" text,
    "stripePublicKey" text,
    "stripeSecretKey" text,
    "imageGenerationCredits" integer DEFAULT 0 NOT NULL,
    "totalImageGenerationCreditsUsed" integer DEFAULT 0 NOT NULL,
    "planDetail" text,
    "aiTokenBalance" bigint DEFAULT 0 NOT NULL,
    "activeAISubplanId" integer,
    "referredByCode" character varying(50) DEFAULT NULL::character varying,
    "aiTokensPurchased" bigint DEFAULT 0,
    "emailCreditsTotal" bigint DEFAULT 0,
    "activeEmailPlanId" integer,
    "expirationWarningSentAt" timestamp with time zone,
    "expirationNotifiedAt" timestamp with time zone,
    CONSTRAINT check_image_gen_credits CHECK (("imageGenerationCredits" >= 0)),
    CONSTRAINT check_total_image_credits_used CHECK (("totalImageGenerationCreditsUsed" >= 0))
);


--
-- Name: COLUMN "Companies"."imageGenerationCredits"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Companies"."imageGenerationCredits" IS 'Créditos disponibles para generación de imágenes';


--
-- Name: COLUMN "Companies"."totalImageGenerationCreditsUsed"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Companies"."totalImageGenerationCreditsUsed" IS 'Total histórico de créditos usados en generación de imágenes';


--
-- Name: CompaniesSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompaniesSettings" (
    id integer NOT NULL,
    "hoursCloseTicketsAuto" character varying(255),
    "chatBotType" character varying(255),
    "acceptCallWhatsapp" character varying(255),
    "userRandom" character varying(255),
    "sendGreetingMessageOneQueues" character varying(255),
    "sendSignMessage" character varying(255),
    "sendFarewellWaitingTicket" character varying(255),
    "userRating" character varying(255),
    "sendGreetingAccepted" character varying(255),
    "CheckMsgIsGroup" character varying(255),
    "sendQueuePosition" character varying(255),
    "scheduleType" character varying(255),
    "acceptAudioMessageContact" character varying(255),
    "enableLGPD" character varying(255),
    "requiredTag" character varying(255),
    "lgpdDeleteMessage" character varying(255),
    "lgpdHideNumber" character varying(255),
    "lgpdConsent" character varying(255),
    "lgpdLink" text,
    "lgpdMessage" text,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "showNotificationPending" boolean DEFAULT false,
    "DirectTicketsToWallets" boolean DEFAULT false,
    "closeTicketOnTransfer" boolean DEFAULT false,
    "transferMessage" character varying,
    "greetingAcceptedMessage" character varying(255),
    "AcceptCallWhatsappMessage" character varying(255),
    "sendQueuePositionMessage" character varying(255),
    "sendMsgTransfTicket" character varying(255) DEFAULT 'disabled'::character varying,
    "facebookAdAccountId" character varying(255),
    "facebookBusinessId" character varying(255),
    "facebookSystemUserToken" text,
    "facebookAppId" character varying(255),
    "facebookAppSecret" character varying(255),
    "instagramAppId" character varying(255),
    "instagramAppSecret" character varying(255),
    "facebookTokenExpiresAt" timestamp with time zone,
    "facebookTokenLastRefreshed" timestamp with time zone,
    "facebookMode" character varying(20) DEFAULT 'production'::character varying,
    "facebookLastError" text,
    "facebookLastErrorAt" timestamp with time zone,
    "themePrimaryLight" character varying(255) DEFAULT '#5BC2D2'::character varying,
    "themePrimaryDark" character varying(255) DEFAULT '#6FD4E4'::character varying,
    "themeSecondaryLight" character varying(255) DEFAULT '#4caf50'::character varying,
    "themeSecondaryDark" character varying(255) DEFAULT '#4caf50'::character varying,
    "facebookMarketingUserId" character varying(255),
    "facebookMarketingUserName" character varying(255),
    "facebookMarketingConnectedAt" timestamp with time zone,
    "googleClientId" character varying(255),
    "googleClientSecret" character varying(255),
    "newCompanyAlertEnabled" character varying(20) DEFAULT 'disabled'::character varying,
    "newCompanyAlertPhone" character varying(50),
    "newCompanyAlertWhatsappId" integer,
    "aiCacheTTL" integer DEFAULT 300 NOT NULL,
    "cloudAPIEnabled" boolean DEFAULT false NOT NULL,
    "tiktokClientKey" character varying(255),
    "tiktokClientSecret" character varying(255),
    "tiktokBusinessAppId" character varying(255),
    "tiktokBusinessSecret" character varying(255),
    "googleDriveEnabled" boolean DEFAULT false,
    "googleDriveTokens" jsonb,
    "lastDriveBackupAt" timestamp without time zone,
    "googleDriveFolderId" character varying(255),
    "expirationAlertEnabled" character varying(255) DEFAULT 'disabled'::character varying,
    "expirationAlertPhone" character varying(255),
    "expirationAlertWhatsappId" integer,
    "metaMcpStatus" character varying DEFAULT 'not_connected'::character varying,
    "metaMcpServerUrl" character varying DEFAULT 'https://mcp.facebook.com/ads'::character varying,
    "metaMcpConnectedAt" timestamp with time zone,
    "metaMcpLastCheckedAt" timestamp with time zone,
    "metaEmbeddedSignupConfigId" character varying(255)
);


--
-- Name: COLUMN "CompaniesSettings"."facebookMode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."facebookMode" IS 'sandbox o production';


--
-- Name: COLUMN "CompaniesSettings"."aiCacheTTL"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."aiCacheTTL" IS 'TTL en segundos para cache de prompts IA por company (default: 300 = 5min)';


--
-- Name: COLUMN "CompaniesSettings"."tiktokClientKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."tiktokClientKey" IS 'TikTok Login Kit App ID (Client Key) — obtenido de developers.tiktok.com';


--
-- Name: COLUMN "CompaniesSettings"."tiktokClientSecret"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."tiktokClientSecret" IS 'TikTok Login Kit App Secret — obtenido de developers.tiktok.com';


--
-- Name: COLUMN "CompaniesSettings"."tiktokBusinessAppId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."tiktokBusinessAppId" IS 'TikTok Business API App ID — obtenido de business-api.tiktok.com';


--
-- Name: COLUMN "CompaniesSettings"."tiktokBusinessSecret"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."CompaniesSettings"."tiktokBusinessSecret" IS 'TikTok Business API Secret — obtenido de business-api.tiktok.com';


--
-- Name: CompaniesSettings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompaniesSettings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompaniesSettings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompaniesSettings_id_seq" OWNED BY public."CompaniesSettings".id;


--
-- Name: Companies_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Companies_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Companies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Companies_id_seq" OWNED BY public."Companies".id;


--
-- Name: CompanyBillings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyBillings" (
    id integer NOT NULL,
    company_id integer NOT NULL,
    stripe_customer_id character varying(255) NOT NULL,
    stripe_subscription_id character varying(255),
    stripe_price_id character varying(255),
    status character varying(20) DEFAULT 'inactive'::character varying,
    billing_cycle character varying(20) DEFAULT 'monthly'::character varying,
    current_period_start timestamp without time zone,
    current_period_end timestamp without time zone,
    cancel_at_period_end boolean DEFAULT false,
    cancel_at timestamp without time zone,
    trial_start timestamp without time zone,
    trial_end timestamp without time zone,
    payment_method_id character varying(255),
    last_payment_date timestamp without time zone,
    next_payment_date timestamp without time zone,
    amount_cents integer DEFAULT 0,
    currency character varying(10) DEFAULT 'USD'::character varying,
    tax_rate numeric(5,2),
    discount_percent numeric(5,2),
    metadata jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: CompanyBillings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyBillings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyBillings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyBillings_id_seq" OWNED BY public."CompanyBillings".id;


--
-- Name: CompanyEmailPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyEmailPlans" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "emailPlanId" integer NOT NULL,
    "emailCreditsUsed" integer DEFAULT 0,
    "emailCreditsTotal" integer NOT NULL,
    "emailCreditsResetAt" timestamp without time zone,
    "dueDate" timestamp without time zone,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: CompanyEmailPlans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyEmailPlans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyEmailPlans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyEmailPlans_id_seq" OWNED BY public."CompanyEmailPlans".id;


--
-- Name: CompanyMetaConversionSettings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyMetaConversionSettings" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "eventKey" character varying(255) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    "conversionName" character varying(255),
    notes text,
    metadata jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CompanyMetaConversionSettings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyMetaConversionSettings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyMetaConversionSettings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyMetaConversionSettings_id_seq" OWNED BY public."CompanyMetaConversionSettings".id;


--
-- Name: CompanyTokenUsages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyTokenUsages" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    date date NOT NULL,
    "tokensUsed" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    model character varying(255),
    month time with time zone,
    "tokensMonth" bigint,
    "tokensTotal" bigint,
    "costUsdMonth" numeric,
    "costUsdTotal" numeric
);


--
-- Name: CompanyTokenUsages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyTokenUsages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyTokenUsages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyTokenUsages_id_seq" OWNED BY public."CompanyTokenUsages".id;


--
-- Name: CompanyUserQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyUserQueues" (
    id bigint NOT NULL,
    "companyUserId" bigint NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CompanyUserQueues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyUserQueues_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyUserQueues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyUserQueues_id_seq" OWNED BY public."CompanyUserQueues".id;


--
-- Name: CompanyUsers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CompanyUsers" (
    id bigint NOT NULL,
    "userId" integer NOT NULL,
    "companyId" integer NOT NULL,
    profile character varying(255) DEFAULT 'user'::character varying NOT NULL,
    "roleId" integer,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: CompanyUsers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CompanyUsers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CompanyUsers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CompanyUsers_id_seq" OWNED BY public."CompanyUsers".id;


--
-- Name: ContactBindings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactBindings" (
    id integer NOT NULL,
    "conversationId" uuid NOT NULL,
    "companyId" integer NOT NULL,
    "contactId" integer NOT NULL,
    "whatsappId" integer,
    provider character varying(32) NOT NULL,
    "providerIdentifier" character varying(255) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
    "lastSeenAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ContactBindings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactBindings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactBindings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactBindings_id_seq" OWNED BY public."ContactBindings".id;


--
-- Name: ContactCustomFields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactCustomFields" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    value text,
    "contactId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ContactCustomFields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactCustomFields_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactCustomFields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactCustomFields_id_seq" OWNED BY public."ContactCustomFields".id;


--
-- Name: ContactListItems; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactListItems" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    number character varying(255) NOT NULL,
    email character varying(255),
    "isWhatsappValid" boolean DEFAULT false,
    "contactListId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "isGroup" boolean DEFAULT false
);


--
-- Name: ContactListItems_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactListItems_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactListItems_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactListItems_id_seq" OWNED BY public."ContactListItems".id;


--
-- Name: ContactLists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactLists" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "isEmailList" boolean DEFAULT false,
    "acelleListUid" character varying(255),
    "fromEmail" character varying(255),
    "fromName" character varying(255),
    "contactCompany" character varying(255),
    "contactState" character varying(255),
    "contactAddress1" character varying(255),
    "contactAddress2" character varying(255),
    "contactCity" character varying(255),
    "contactZip" character varying(255),
    "contactPhone" character varying(255),
    "contactCountryId" character varying(255),
    "contactEmail" character varying(255),
    "contactUrl" character varying(255),
    "subscribeConfirmation" boolean DEFAULT false,
    "sendWelcomeEmail" boolean DEFAULT false,
    "unsubscribeNotification" boolean DEFAULT false,
    provider character varying(50),
    "providerListId" character varying(255)
);


--
-- Name: ContactLists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactLists_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactLists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactLists_id_seq" OWNED BY public."ContactLists".id;


--
-- Name: ContactTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactTags" (
    id integer NOT NULL,
    "contactId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ContactTags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactTags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactTags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactTags_id_seq" OWNED BY public."ContactTags".id;


--
-- Name: ContactTemperatures; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactTemperatures" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "contactId" integer NOT NULL,
    temperature double precision DEFAULT 0 NOT NULL,
    category public."enum_ContactTemperatures_category" DEFAULT 'cold'::public."enum_ContactTemperatures_category" NOT NULL,
    "lastMessageAt" timestamp with time zone,
    "lastTicketAt" timestamp with time zone,
    "messageCount30d" integer DEFAULT 0,
    "ticketCount30d" integer DEFAULT 0,
    "tagKey" character varying(50),
    reasons jsonb,
    "lastRecalculatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ContactTemperatures_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactTemperatures_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactTemperatures_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactTemperatures_id_seq" OWNED BY public."ContactTemperatures".id;


--
-- Name: ContactWallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ContactWallets" (
    id integer NOT NULL,
    "walletId" integer NOT NULL,
    "contactId" integer NOT NULL,
    "companyId" integer NOT NULL,
    balance numeric(10,2) DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ContactWallets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ContactWallets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ContactWallets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ContactWallets_id_seq" OWNED BY public."ContactWallets".id;


--
-- Name: Contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Contacts" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    number character varying(255) NOT NULL,
    email character varying(255),
    "profilePicUrl" text,
    "isGroup" boolean DEFAULT false,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "urlPicture" text,
    "disableBot" boolean DEFAULT false,
    "acceptAudioMessage" boolean DEFAULT true,
    active boolean DEFAULT true,
    channel character varying(255) DEFAULT 'whatsapp'::character varying,
    "remoteJid" character varying(255),
    "lgpdAcceptedAt" timestamp without time zone,
    "pictureUpdated" boolean,
    "whatsappId" integer,
    "telegramUserId" character varying(255),
    "phoneNumberId" character varying(255),
    city character varying(255),
    state character varying(255),
    country character varying(255),
    zipcode character varying(255),
    "tiktokUserId" character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    "whatsappValid" character varying(255) DEFAULT NULL::character varying,
    "whatsappValidatedAt" timestamp with time zone,
    "marketingConsent" character varying(12) DEFAULT 'unknown'::character varying,
    "consentUpdatedAt" timestamp without time zone,
    "erasedAt" timestamp without time zone
);


--
-- Name: Contacts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Contacts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Contacts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Contacts_id_seq" OWNED BY public."Contacts".id;


--
-- Name: CustomerOrigins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."CustomerOrigins" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    color character varying(7) DEFAULT '#6366F1'::character varying,
    "isActive" boolean DEFAULT true,
    "companyId" integer NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: CustomerOrigins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."CustomerOrigins_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: CustomerOrigins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."CustomerOrigins_id_seq" OWNED BY public."CustomerOrigins".id;


--
-- Name: DialogChatBots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."DialogChatBots" (
    id integer NOT NULL,
    "awaitsUser" boolean DEFAULT false,
    "contactId" integer NOT NULL,
    "chatbotId" integer NOT NULL,
    "queueId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    awaiting integer
);


--
-- Name: DialogChatBots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."DialogChatBots_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: DialogChatBots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."DialogChatBots_id_seq" OWNED BY public."DialogChatBots".id;


--
-- Name: EmailPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."EmailPlans" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "emailCreditsPerCycle" integer DEFAULT 100 NOT NULL,
    "maxEmailSendsPerDay" integer DEFAULT 50 NOT NULL,
    "maxTemplates" integer DEFAULT 10 NOT NULL,
    price numeric(10,2) NOT NULL,
    recurrence character varying(50) DEFAULT 'MENSUAL'::character varying NOT NULL,
    "stripePriceId" character varying(255),
    "stripeProductId" character varying(255),
    "paypalProductId" character varying(255),
    "paypalPlanId" character varying(255),
    "isPublic" boolean DEFAULT true,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: EmailPlans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."EmailPlans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: EmailPlans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."EmailPlans_id_seq" OWNED BY public."EmailPlans".id;


--
-- Name: FacebookConversionEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FacebookConversionEvents" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "whatsappId" integer,
    "contactId" integer,
    "messageId" integer,
    "campaignId" integer,
    "eventName" character varying(255) NOT NULL,
    "eventTime" bigint NOT NULL,
    "eventSourceUrl" text,
    "actionSource" character varying(255) DEFAULT 'chat'::character varying NOT NULL,
    "messagingChannel" public."enum_FacebookConversionEvents_messagingChannel",
    "ctwaClid" character varying(255),
    "userData" json,
    "customData" json,
    "datasetId" character varying(255) NOT NULL,
    "facebookEventId" character varying(255) NOT NULL,
    "responseStatus" public."enum_FacebookConversionEvents_responseStatus" DEFAULT 'pending'::public."enum_FacebookConversionEvents_responseStatus" NOT NULL,
    "fbResponse" json,
    "errorMessage" text,
    "sentAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: COLUMN "FacebookConversionEvents"."eventName"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."eventName" IS 'e.g., Contact, Lead, Purchase, AddToCart';


--
-- Name: COLUMN "FacebookConversionEvents"."eventTime"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."eventTime" IS 'Unix timestamp';


--
-- Name: COLUMN "FacebookConversionEvents"."actionSource"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."actionSource" IS 'website, email, app, chat, etc.';


--
-- Name: COLUMN "FacebookConversionEvents"."ctwaClid"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."ctwaClid" IS 'Click-to-WhatsApp Click ID';


--
-- Name: COLUMN "FacebookConversionEvents"."userData"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."userData" IS 'Hashed user data (email, phone, name, etc.)';


--
-- Name: COLUMN "FacebookConversionEvents"."customData"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."customData" IS 'Custom event data (value, currency, content, etc.)';


--
-- Name: COLUMN "FacebookConversionEvents"."datasetId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."datasetId" IS 'Facebook Dataset ID';


--
-- Name: COLUMN "FacebookConversionEvents"."facebookEventId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."facebookEventId" IS 'Unique deduplication ID for Facebook';


--
-- Name: COLUMN "FacebookConversionEvents"."fbResponse"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookConversionEvents"."fbResponse" IS 'Response from Facebook API';


--
-- Name: FacebookConversionEvents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FacebookConversionEvents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FacebookConversionEvents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FacebookConversionEvents_id_seq" OWNED BY public."FacebookConversionEvents".id;


--
-- Name: FacebookDatasets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FacebookDatasets" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "whatsappId" integer,
    "datasetId" character varying(255) NOT NULL,
    "channelSpecificId" character varying(255),
    "pixelId" character varying(255),
    status public."enum_FacebookDatasets_status" DEFAULT 'active'::public."enum_FacebookDatasets_status" NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    channel character varying(255),
    "channelIdentifier" character varying(255),
    "datasetName" character varying(255),
    "datasetSource" character varying(255),
    "validationStatus" character varying(255),
    "validationError" text,
    "validatedAt" timestamp with time zone
);


--
-- Name: COLUMN "FacebookDatasets"."datasetId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookDatasets"."datasetId" IS 'Facebook Dataset ID';


--
-- Name: COLUMN "FacebookDatasets"."channelSpecificId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookDatasets"."channelSpecificId" IS 'WhatsApp Business Account ID';


--
-- Name: COLUMN "FacebookDatasets"."pixelId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookDatasets"."pixelId" IS 'Facebook Pixel ID (optional)';


--
-- Name: COLUMN "FacebookDatasets".channel; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookDatasets".channel IS 'Channel type: facebook, instagram, whatsapp';


--
-- Name: COLUMN "FacebookDatasets"."channelIdentifier"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."FacebookDatasets"."channelIdentifier" IS 'Page ID for Facebook, User ID for Instagram, WABA ID for WhatsApp';


--
-- Name: FacebookDatasets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FacebookDatasets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FacebookDatasets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FacebookDatasets_id_seq" OWNED BY public."FacebookDatasets".id;


--
-- Name: Files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Files" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: FilesOptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FilesOptions" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(255),
    "fileId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: FilesOptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FilesOptions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FilesOptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FilesOptions_id_seq" OWNED BY public."FilesOptions".id;


--
-- Name: Files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Files_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Files_id_seq" OWNED BY public."Files".id;


--
-- Name: FlowAudios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FlowAudios" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: FlowAudios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FlowAudios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FlowAudios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FlowAudios_id_seq" OWNED BY public."FlowAudios".id;


--
-- Name: FlowBuilders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FlowBuilders" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    data jsonb,
    "flowId" integer,
    "companyId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    active boolean DEFAULT true,
    flow json,
    variables json
);


--
-- Name: FlowBuilders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FlowBuilders_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FlowBuilders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FlowBuilders_id_seq" OWNED BY public."FlowBuilders".id;


--
-- Name: FlowCampaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FlowCampaigns" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "flowId" integer,
    status character varying(255) DEFAULT 'pending'::character varying,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "companyId" integer,
    "userId" integer,
    phrase character varying(255),
    "whatsappId" integer
);


--
-- Name: FlowCampaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FlowCampaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FlowCampaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FlowCampaigns_id_seq" OWNED BY public."FlowCampaigns".id;


--
-- Name: FlowDefaults; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FlowDefaults" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: FlowDefaults_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FlowDefaults_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FlowDefaults_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FlowDefaults_id_seq" OWNED BY public."FlowDefaults".id;


--
-- Name: FlowImgs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."FlowImgs" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    path character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: FlowImgs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."FlowImgs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: FlowImgs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."FlowImgs_id_seq" OWNED BY public."FlowImgs".id;


--
-- Name: Helps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Helps" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    video character varying(255),
    link character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Helps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Helps_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Helps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Helps_id_seq" OWNED BY public."Helps".id;


--
-- Name: InboundEventLedger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InboundEventLedger" (
    id bigint NOT NULL,
    "companyId" integer NOT NULL,
    provider character varying(32) NOT NULL,
    "eventKey" character varying(255) NOT NULL,
    "payloadHash" character varying(64),
    "traceId" character varying(64),
    outcome character varying(20) DEFAULT 'processed'::character varying NOT NULL,
    "errorMessage" text,
    "ticketId" integer,
    "messageId" integer,
    "providerMessageId" character varying(500),
    "receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "processedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: InboundEventLedger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."InboundEventLedger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: InboundEventLedger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."InboundEventLedger_id_seq" OWNED BY public."InboundEventLedger".id;


--
-- Name: InsightsDaily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."InsightsDaily" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    date date NOT NULL,
    level character varying NOT NULL,
    "objectId" character varying NOT NULL,
    "campaignId" character varying,
    "adSetId" character varying,
    "adId" character varying,
    name character varying,
    spend numeric(14,2) DEFAULT 0,
    impressions bigint DEFAULT 0,
    clicks bigint DEFAULT 0,
    cpm numeric(12,4) DEFAULT 0,
    cpc numeric(12,4) DEFAULT 0,
    ctr numeric(8,4) DEFAULT 0,
    frequency numeric(8,4) DEFAULT 0,
    "conversationsStarted" integer DEFAULT 0,
    "costPerConversation" numeric(12,4) DEFAULT 0,
    raw jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: InsightsDaily_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."InsightsDaily_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: InsightsDaily_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."InsightsDaily_id_seq" OWNED BY public."InsightsDaily".id;


--
-- Name: Invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Invoices" (
    id integer NOT NULL,
    detail text,
    status character varying(255),
    value numeric(10,2),
    "dueDate" timestamp without time zone,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    stripe_id character varying(255),
    payment_intent character varying(255),
    "subscriptionId" character varying(255),
    "customId" character varying(255),
    "useWhatsapp" boolean DEFAULT true,
    "useFacebook" boolean DEFAULT false,
    "useInstagram" boolean DEFAULT false,
    "useCampaigns" boolean DEFAULT false,
    "useSchedules" boolean DEFAULT false,
    "useInternalChat" boolean DEFAULT false,
    "useExternalApi" boolean DEFAULT false,
    "linkInvoice" text,
    "planId" integer,
    recurrence character varying(255),
    "appleTransactionId" character varying(255),
    "appleLatestTransactionId" character varying(255),
    "appleProductId" character varying(255),
    "applePurchaseDate" timestamp without time zone,
    "appleExpiresDate" timestamp without time zone,
    users integer,
    connections integer,
    queues integer,
    "paymentMethod" character varying(255) DEFAULT NULL::character varying,
    "paypalOrderId" character varying(255) DEFAULT NULL::character varying,
    "isEmailPlan" boolean DEFAULT false,
    "emailPlanId" integer
);


--
-- Name: Invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Invoices_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Invoices_id_seq" OWNED BY public."Invoices".id;


--
-- Name: KanbanLeadConversionEvents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KanbanLeadConversionEvents" (
    id integer NOT NULL,
    "companyId" integer,
    "ticketId" integer,
    "contactId" integer,
    "kanbanTagId" integer,
    "kanbanKey" character varying(255),
    "kanbanTagName" character varying(255),
    "eventName" character varying(255) DEFAULT 'Lead'::character varying NOT NULL,
    "eventId" character varying(255),
    source character varying(255) DEFAULT 'kanban_label'::character varying NOT NULL,
    "destinationId" character varying(255),
    "destinationSource" character varying(255),
    "responseStatus" public."enum_KanbanLeadConversionEvents_responseStatus" DEFAULT 'pending'::public."enum_KanbanLeadConversionEvents_responseStatus" NOT NULL,
    "fbtraceId" character varying(255),
    "errorMessage" text,
    "userData" json,
    "customData" json,
    "fbResponse" json,
    "sentAt" timestamp with time zone,
    "userId" integer,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: KanbanLeadConversionEvents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."KanbanLeadConversionEvents_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: KanbanLeadConversionEvents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."KanbanLeadConversionEvents_id_seq" OWNED BY public."KanbanLeadConversionEvents".id;


--
-- Name: KanbanMovementLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."KanbanMovementLogs" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "fromTagId" integer,
    "toTagId" integer NOT NULL,
    "movedBy" character varying(10) DEFAULT 'system'::character varying NOT NULL,
    "userId" integer,
    reason character varying(255),
    metadata jsonb,
    "aiConfidence" numeric(5,4),
    "aiModelUsed" character varying(100),
    "wasOverriddenByUser" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: KanbanMovementLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."KanbanMovementLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: KanbanMovementLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."KanbanMovementLogs_id_seq" OWNED BY public."KanbanMovementLogs".id;


--
-- Name: LogTickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."LogTickets" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    type character varying(255) NOT NULL,
    "userId" integer,
    "queueId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: LogTickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."LogTickets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: LogTickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."LogTickets_id_seq" OWNED BY public."LogTickets".id;


--
-- Name: Messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Messages" (
    id integer NOT NULL,
    body text NOT NULL,
    ack integer DEFAULT 0,
    read boolean DEFAULT false,
    "mediaType" character varying(255),
    "mediaUrl" text,
    "timestamp" bigint,
    "fromMe" boolean DEFAULT false,
    "isDeleted" boolean DEFAULT false,
    "ticketId" integer NOT NULL,
    "contactId" integer,
    "quotedMsgId" integer,
    "createdAt" timestamp(6) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(6) without time zone DEFAULT now() NOT NULL,
    "remoteJid" character varying(500),
    participant character varying(500),
    "dataJson" text,
    "ticketTrakingId" integer,
    "companyId" integer,
    "queueId" integer,
    wid character varying(500),
    "isPrivate" boolean DEFAULT false,
    "isEdited" boolean DEFAULT false,
    "isForwarded" boolean DEFAULT false,
    "isPinned" boolean DEFAULT false,
    "whatsappId" integer,
    provider character varying(255),
    "externalId" character varying(255),
    "sourceChannel" character varying(50) DEFAULT NULL::character varying,
    "agentUsed" character varying(100),
    intent character varying(100),
    "confidenceScore" numeric(3,2),
    "messageStatus" public.enum_messages_messagestatus DEFAULT 'pending'::public.enum_messages_messagestatus NOT NULL,
    "sendAttempts" integer DEFAULT 0 NOT NULL,
    "sentAt" timestamp(6) without time zone,
    "conversationId" uuid
);


--
-- Name: Messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Messages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Messages_id_seq" OWNED BY public."Messages".id;


--
-- Name: MetaAgentActionLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MetaAgentActionLogs" (
    id integer NOT NULL,
    "planId" integer NOT NULL,
    "companyId" integer NOT NULL,
    action character varying(50) NOT NULL,
    params jsonb DEFAULT '{}'::jsonb NOT NULL,
    success boolean DEFAULT false NOT NULL,
    "errorMessage" text,
    "metaResponse" jsonb,
    "executedAt" timestamp with time zone NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: COLUMN "MetaAgentActionLogs".action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaAgentActionLogs".action IS 'pause_campaign | update_campaign_budget | duplicate_campaign | create_campaign_paused';


--
-- Name: COLUMN "MetaAgentActionLogs"."metaResponse"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaAgentActionLogs"."metaResponse" IS 'Respuesta cruda Graph API (incluye request_id para soporte)';


--
-- Name: MetaAgentActionLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."MetaAgentActionLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: MetaAgentActionLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."MetaAgentActionLogs_id_seq" OWNED BY public."MetaAgentActionLogs".id;


--
-- Name: MetaAgentPlans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MetaAgentPlans" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    "whatsappId" integer,
    "resolvedAdAccountId" character varying(64),
    "resolvedMode" character varying(20),
    prompt text NOT NULL,
    summary text,
    "proposedActions" jsonb DEFAULT '[]'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    "expiresAt" timestamp with time zone NOT NULL,
    "executedAt" timestamp with time zone,
    "openaiUsage" jsonb,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: COLUMN "MetaAgentPlans"."resolvedMode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaAgentPlans"."resolvedMode" IS 'whatsapp | company_settings';


--
-- Name: COLUMN "MetaAgentPlans".status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaAgentPlans".status IS 'pending | executed | partial | expired | rejected';


--
-- Name: COLUMN "MetaAgentPlans"."openaiUsage"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaAgentPlans"."openaiUsage" IS '{ promptTokens, completionTokens, totalTokens, model }';


--
-- Name: MetaAgentPlans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."MetaAgentPlans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: MetaAgentPlans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."MetaAgentPlans_id_seq" OWNED BY public."MetaAgentPlans".id;


--
-- Name: MetaMarketingAuditLogs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MetaMarketingAuditLogs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    action character varying(100) NOT NULL,
    endpoint character varying(255) NOT NULL,
    method character varying(10) NOT NULL,
    params jsonb,
    "responseStatus" character varying(20) NOT NULL,
    "responseTime" integer NOT NULL,
    "errorCode" character varying(50),
    "errorMessage" text,
    "cacheHit" boolean DEFAULT false,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE "MetaMarketingAuditLogs"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public."MetaMarketingAuditLogs" IS 'Logs de auditoría para Meta Marketing API';


--
-- Name: MetaMarketingAuditLogs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."MetaMarketingAuditLogs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: MetaMarketingAuditLogs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."MetaMarketingAuditLogs_id_seq" OWNED BY public."MetaMarketingAuditLogs".id;


--
-- Name: MetaOfficialMcpConnections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."MetaOfficialMcpConnections" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    provider character varying(40) DEFAULT 'meta_official_mcp'::character varying NOT NULL,
    status character varying(20) DEFAULT 'not_connected'::character varying NOT NULL,
    "mcpServerUrl" character varying(255) DEFAULT 'https://mcp.facebook.com/ads'::character varying NOT NULL,
    "oauthState" character varying(128),
    "codeVerifier" character varying(255),
    "accessToken" text,
    "refreshToken" text,
    "expiresAt" timestamp with time zone,
    scopes jsonb DEFAULT '[]'::jsonb,
    "lastToolsListAt" timestamp with time zone,
    "lastConnectedAt" timestamp with time zone,
    "lastError" text,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: COLUMN "MetaOfficialMcpConnections".status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaOfficialMcpConnections".status IS 'not_connected | pending | connected | error';


--
-- Name: COLUMN "MetaOfficialMcpConnections"."lastToolsListAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."MetaOfficialMcpConnections"."lastToolsListAt" IS 'Última vez que tools/list respondió OK';


--
-- Name: MetaOfficialMcpConnections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."MetaOfficialMcpConnections_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: MetaOfficialMcpConnections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."MetaOfficialMcpConnections_id_seq" OWNED BY public."MetaOfficialMcpConnections".id;


--
-- Name: Notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Notifications" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    type character varying(20) DEFAULT 'info'::character varying NOT NULL,
    category character varying(30) DEFAULT 'system'::character varying NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    "actionUrl" character varying(500),
    metadata jsonb,
    "isRead" boolean DEFAULT false NOT NULL,
    "readAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: COLUMN "Notifications"."userId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Notifications"."userId" IS 'Destinatario de la notificación';


--
-- Name: COLUMN "Notifications".type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Notifications".type IS 'info | success | warning | error';


--
-- Name: COLUMN "Notifications".category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Notifications".category IS 'system | appointment | campaign | ticket | user | message';


--
-- Name: COLUMN "Notifications"."actionUrl"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Notifications"."actionUrl" IS 'Deep link a la entidad relacionada';


--
-- Name: Notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Notifications_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Notifications_id_seq" OWNED BY public."Notifications".id;


--
-- Name: OutboundDispatches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."OutboundDispatches" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "companyId" integer NOT NULL,
    "conversationId" uuid,
    "ticketId" integer,
    "messageId" integer,
    "whatsappId" integer,
    provider character varying(32) NOT NULL,
    "requestedMode" character varying(20),
    "requestedBy" character varying(32),
    "fallbackApplied" boolean DEFAULT false NOT NULL,
    "fallbackFromProvider" character varying(32),
    "providerMessageId" character varying(500),
    "bodyPreview" character varying(200),
    status character varying(20) DEFAULT 'queued'::character varying NOT NULL,
    "attemptCount" integer DEFAULT 0 NOT NULL,
    "lastError" text,
    "traceId" character varying(64),
    "durationMs" integer,
    "requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "dispatchedAt" timestamp with time zone,
    "ackedAt" timestamp with time zone,
    "ackLevel" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: Partners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Partners" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    phone character varying(255),
    email character varying(255),
    document character varying(255),
    "companyId" integer NOT NULL,
    "walletId" character varying(255),
    typebot character varying(255),
    commission integer,
    "typeCommission" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Partners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Partners_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Partners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Partners_id_seq" OWNED BY public."Partners".id;


--
-- Name: PlanCreditAllocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PlanCreditAllocations" (
    id integer NOT NULL,
    "planId" integer NOT NULL,
    "creditTypeId" integer NOT NULL,
    "creditsPerCycle" numeric(15,4) DEFAULT 0 NOT NULL,
    "isUnlimited" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: PlanCreditAllocations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."PlanCreditAllocations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PlanCreditAllocations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."PlanCreditAllocations_id_seq" OWNED BY public."PlanCreditAllocations".id;


--
-- Name: Plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Plans" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    users integer,
    connections integer,
    queues integer,
    amount character varying(255),
    "useWhatsapp" boolean,
    "useFacebook" boolean,
    "useInstagram" boolean,
    "useCampaigns" boolean,
    "useSchedules" boolean,
    "useInternalChat" boolean,
    "useExternalApi" boolean,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "useIntegrations" boolean DEFAULT true,
    "useOpenAi" boolean DEFAULT true,
    "useKanban" boolean,
    "useMarketing" boolean DEFAULT true,
    "useLeads" boolean DEFAULT true,
    trial boolean,
    "trialDays" integer,
    recurrence character varying(255),
    "stripePriceId" character varying(255),
    "isPublic" boolean DEFAULT true,
    "interfacePermissions" text,
    "stripeProductId" text,
    "paypalProductId" text,
    "paypalPlanId" text,
    "aiTokenQuota" bigint DEFAULT 0,
    "maxAgents" integer DEFAULT 3,
    "maxImageGenerations" integer DEFAULT 50,
    "maxVideoGenerations" integer DEFAULT 5,
    "aiCreditsPerCycle" bigint DEFAULT 0,
    "excessTokenPrice" numeric(10,6) DEFAULT 0,
    "useUgc" boolean DEFAULT false,
    "useUgcAutoPublish" boolean DEFAULT false,
    "useUgcAbTesting" boolean DEFAULT false,
    "useUgcOptimization" boolean DEFAULT false,
    "useUgcCreatorNetwork" boolean DEFAULT false,
    "useUgcPayments" boolean DEFAULT false,
    "maxUgcVideosPerMonth" integer DEFAULT 0,
    "maxSocialAccounts" integer DEFAULT 0,
    "useAgentIdentities" boolean DEFAULT false,
    "useAgentDeviceFarm" boolean DEFAULT false,
    "useAgentEngagement" boolean DEFAULT false,
    "maxAgentIdentities" integer DEFAULT 0,
    "maxAgentDevices" integer DEFAULT 0,
    "useEmailMarketing" boolean DEFAULT false,
    "useEmailAutomation" boolean DEFAULT false,
    "useEmailAbTesting" boolean DEFAULT false,
    "useEmailAiOptimization" boolean DEFAULT false,
    "maxEmailCampaignsPerMonth" integer DEFAULT 0,
    "maxEmailContactLists" integer DEFAULT 0,
    "maxEmailContactsPerList" integer DEFAULT 0,
    "maxEmailSendsPerDay" integer DEFAULT 0,
    "allowRecurringPayments" boolean DEFAULT false NOT NULL
);


--
-- Name: Plans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Plans_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Plans_id_seq" OWNED BY public."Plans".id;


--
-- Name: PromptQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."PromptQueues" (
    id integer NOT NULL,
    "promptId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now(),
    "updatedAt" timestamp without time zone DEFAULT now()
);


--
-- Name: PromptQueues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."PromptQueues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: PromptQueues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."PromptQueues_id_seq" OWNED BY public."PromptQueues".id;


--
-- Name: Prompts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Prompts" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "apiKey" text,
    prompt text NOT NULL,
    "maxMessages" integer DEFAULT 10,
    "maxTokens" integer DEFAULT 100,
    temperature numeric(3,2) DEFAULT 1.0,
    "queueId" integer,
    "companyId" integer NOT NULL,
    voice character varying(255) DEFAULT 'nova'::character varying,
    "voiceKey" text,
    "voiceRegion" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "fileNameIA" character varying(255),
    "promptTokens" integer,
    "completionTokens" integer,
    "totalTokens" integer,
    "aiProviderId" integer,
    "baseUrl" character varying(500),
    capabilities jsonb
);


--
-- Name: Prompts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Prompts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Prompts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Prompts_id_seq" OWNED BY public."Prompts".id;


--
-- Name: QueueIntegrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QueueIntegrations" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(255) NOT NULL,
    "projectName" character varying(255),
    "jsonContent" text,
    language character varying(255),
    "urlN8N" text,
    "typebotExpires" integer,
    "typebotKeywordFinish" character varying(255),
    "typebotKeywordRestart" character varying(255),
    "typebotRestartMessage" text,
    "typebotSlug" character varying(255),
    "typebotUnknownMessage" text,
    "typebotDelayMessage" integer,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: QueueIntegrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."QueueIntegrations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: QueueIntegrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."QueueIntegrations_id_seq" OWNED BY public."QueueIntegrations".id;


--
-- Name: QueueOptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QueueOptions" (
    id integer NOT NULL,
    title character varying(255) NOT NULL,
    message text,
    option text,
    "queueId" integer,
    "parentId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: QueueOptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."QueueOptions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: QueueOptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."QueueOptions_id_seq" OWNED BY public."QueueOptions".id;


--
-- Name: Queues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Queues" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(255) NOT NULL,
    "greetingMessage" text,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "orderQueue" integer,
    "ativarRoteador" boolean DEFAULT false NOT NULL,
    "tempoRoteador" integer DEFAULT 0 NOT NULL,
    "outOfHoursMessage" character varying(255) DEFAULT ''::character varying,
    schedules jsonb,
    "integrationId" integer,
    "fileListId" integer,
    "closeTicket" boolean DEFAULT false,
    "promptAI" text
);


--
-- Name: Queues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Queues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Queues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Queues_id_seq" OWNED BY public."Queues".id;


--
-- Name: QuickMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."QuickMessages" (
    id integer NOT NULL,
    shortcode character varying(255) NOT NULL,
    message text NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    geral boolean DEFAULT true,
    visao boolean DEFAULT false,
    intent character varying(500),
    "intentEmbedding" public.vector(1536),
    "isAiEnabled" boolean DEFAULT false,
    "intentKey" character varying(80)
);


--
-- Name: COLUMN "QuickMessages".intent; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."QuickMessages".intent IS 'Descripción semántica: "saludo informal", "pedir email", "queja de producto"';


--
-- Name: COLUMN "QuickMessages"."intentEmbedding"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."QuickMessages"."intentEmbedding" IS 'Embedding del campo intent para similitud semántica';


--
-- Name: COLUMN "QuickMessages"."isAiEnabled"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."QuickMessages"."isAiEnabled" IS 'Si true, este QuickReply se considera en el pipeline IA';


--
-- Name: COLUMN "QuickMessages"."intentKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."QuickMessages"."intentKey" IS 'Stable AI intent key used for quick reply retrieval, e.g. location_question, plan_gold_selection';


--
-- Name: QuickMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."QuickMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: QuickMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."QuickMessages_id_seq" OWNED BY public."QuickMessages".id;


--
-- Name: Receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Receipts" (
    id integer NOT NULL,
    amount numeric(10,2),
    description text,
    "invoiceId" integer,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    descripcion character varying(255),
    estado integer DEFAULT 1 NOT NULL,
    comprobante character varying(255),
    "purchaseType" character varying(30) DEFAULT 'subscription'::character varying NOT NULL,
    "planId" integer,
    "planName" character varying(255),
    "totalPrice" numeric(10,2),
    duration character varying(255),
    "aiSubplanId" integer,
    "aiTokens" bigint,
    "amountUsd" numeric(10,2),
    "processedBy" integer,
    "processedAt" timestamp with time zone,
    "rejectionReason" text
);


--
-- Name: Receipts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Receipts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Receipts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Receipts_id_seq" OWNED BY public."Receipts".id;


--
-- Name: Roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Roles" (
    id integer NOT NULL,
    "companyId" integer,
    name character varying(255) NOT NULL,
    key character varying(255) NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    unrestricted boolean DEFAULT false NOT NULL,
    editable boolean DEFAULT true NOT NULL,
    permissions jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: Roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Roles_id_seq" OWNED BY public."Roles".id;


--
-- Name: ScheduledMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduledMessages" (
    id integer NOT NULL,
    data_mensagem_programada timestamp without time zone,
    id_conexao integer,
    intervalo integer,
    valor_intervalo character varying(255),
    mensagem text,
    tipo_dias_envio character varying(255),
    mostrar boolean DEFAULT true,
    criar_ticket boolean DEFAULT false,
    contatos text,
    "companyId" integer NOT NULL,
    nome character varying(255),
    tipo_arquivo character varying(255),
    usuario character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ScheduledMessagesEnvios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ScheduledMessagesEnvios" (
    id integer NOT NULL,
    data_mensagem_envio timestamp without time zone,
    id_envio integer,
    numero character varying(255),
    mensagem text,
    "companyId" integer NOT NULL,
    tipo_arquivo character varying(255),
    nome_arquivo character varying(255),
    "scheduledmessageId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: ScheduledMessagesEnvios_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ScheduledMessagesEnvios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ScheduledMessagesEnvios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ScheduledMessagesEnvios_id_seq" OWNED BY public."ScheduledMessagesEnvios".id;


--
-- Name: ScheduledMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."ScheduledMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: ScheduledMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."ScheduledMessages_id_seq" OWNED BY public."ScheduledMessages".id;


--
-- Name: Schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Schedules" (
    id integer NOT NULL,
    body text NOT NULL,
    "sendAt" timestamp without time zone NOT NULL,
    "sentAt" timestamp without time zone,
    "contactId" integer NOT NULL,
    "ticketId" integer NOT NULL,
    "userId" integer,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(255),
    "ticketUserId" integer,
    "queueId" integer,
    "statusTicket" character varying(255) DEFAULT 'closed'::character varying,
    "openTicket" character varying(255) DEFAULT 'disabled'::character varying,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    "whatsappId" integer,
    intervalo integer,
    "valorIntervalo" integer,
    "enviarQuantasVezes" integer,
    "tipoDias" integer,
    "contadorEnvio" integer,
    assinar boolean DEFAULT false
);


--
-- Name: Schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Schedules_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Schedules_id_seq" OWNED BY public."Schedules".id;


--
-- Name: SequelizeMeta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."SequelizeMeta" (
    name character varying(255) NOT NULL
);


--
-- Name: Sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Sessions" (
    id character varying(255) NOT NULL,
    "userId" integer NOT NULL,
    "refreshTokenHash" character varying(255) NOT NULL,
    "clientType" character varying(50) DEFAULT 'web'::character varying,
    "deviceId" character varying(255),
    ip character varying(255),
    "userAgent" text,
    "expiresAt" timestamp without time zone NOT NULL,
    "revokedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "lastSeenAt" timestamp with time zone,
    "activeCompanyId" integer
);


--
-- Name: Sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Sessions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Sessions_id_seq" OWNED BY public."Sessions".id;


--
-- Name: Settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Settings" (
    id integer NOT NULL,
    key character varying(255) NOT NULL,
    value text NOT NULL,
    "companyId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Settings_new_id_seq1; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Settings_new_id_seq1"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Settings_new_id_seq1; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Settings_new_id_seq1" OWNED BY public."Settings".id;


--
-- Name: Subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Subscriptions" (
    id integer NOT NULL,
    "isActive" boolean DEFAULT true,
    "userPriceCents" bigint,
    "whatsPriceCents" bigint,
    "lastInvoiceUrl" text,
    "lastPlanChange" timestamp without time zone,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Subscriptions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Subscriptions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Subscriptions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Subscriptions_id_seq" OWNED BY public."Subscriptions".id;


--
-- Name: Tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tags" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    color character varying(255),
    key character varying(255),
    kanban integer,
    "timeLane" integer,
    "nextLaneId" integer,
    "greetingMessageLane" text,
    "rollbackLaneId" integer,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "enableFollowup" boolean DEFAULT false,
    "followupType" character varying(50) DEFAULT 'multiple'::character varying,
    "timeLaneUnit" character varying(10) DEFAULT 'hours'::character varying NOT NULL,
    description text,
    "followupEnabled" boolean DEFAULT false,
    "followupCount" integer DEFAULT 1,
    "followupMessage1" text,
    "followupDelay1" integer DEFAULT 1,
    "followupMessage2" text,
    "followupDelay2" integer DEFAULT 3,
    "followupMessage3" text,
    "followupDelay3" integer DEFAULT 4,
    "aiGuidance1" text,
    "aiGuidance2" text,
    "aiGuidance3" text,
    "sendMetaConversion" boolean DEFAULT false NOT NULL,
    "metaConversionName" character varying(255),
    "metaEventName" character varying(255),
    "metaLeadStatus" character varying(255),
    "metaCustomEventType" character varying(255),
    "metaRule" text,
    "metaCustomConversionId" character varying(255),
    "metaConversionStatus" character varying(255),
    "metaLastSyncAt" timestamp with time zone,
    "metaLastError" text,
    "metaValue" numeric(12,2),
    "metaCurrency" character varying DEFAULT 'USD'::character varying
);


--
-- Name: COLUMN "Tags"."aiGuidance1"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Tags"."aiGuidance1" IS 'Prompt de contexto IA para mensaje de seguimiento 1';


--
-- Name: COLUMN "Tags"."aiGuidance2"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Tags"."aiGuidance2" IS 'Prompt de contexto IA para mensaje de seguimiento 2';


--
-- Name: COLUMN "Tags"."aiGuidance3"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Tags"."aiGuidance3" IS 'Prompt de contexto IA para mensaje de seguimiento 3';


--
-- Name: Tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Tags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Tags_id_seq" OWNED BY public."Tags".id;


--
-- Name: TelegramQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TelegramQueues" (
    id integer NOT NULL,
    "telegramId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TelegramQueues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TelegramQueues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TelegramQueues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TelegramQueues_id_seq" OWNED BY public."TelegramQueues".id;


--
-- Name: Telegrams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Telegrams" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    "botToken" text NOT NULL,
    "botUsername" character varying(255),
    status character varying(255) DEFAULT 'DISCONNECTED'::character varying,
    "webhookUrl" text,
    "isDefault" boolean DEFAULT false,
    "allowGroup" boolean DEFAULT false,
    "greetingMessage" text DEFAULT ''::text,
    "farewellMessage" text DEFAULT ''::text,
    "complationMessage" text DEFAULT ''::text,
    "outOfHoursMessage" text DEFAULT ''::text,
    "timeInactiveMessage" character varying(255),
    "inactiveMessage" text,
    "ratingMessage" text,
    "maxUseBotQueues" integer DEFAULT 3,
    "timeUseBotQueues" character varying(255) DEFAULT '0'::character varying,
    "expiresTicket" character varying(255) DEFAULT '0'::character varying,
    "maxUseBotQueuesNPS" integer DEFAULT 0,
    "expiresTicketNPS" integer DEFAULT 0,
    "whenExpiresTicket" character varying(255),
    "expiresInactiveMessage" character varying(255),
    "groupAsTicket" character varying(255) DEFAULT 'disabled'::character varying,
    "timeCreateNewTicket" integer DEFAULT 0,
    "timeSendQueue" integer DEFAULT 0,
    "collectiveVacationMessage" text,
    "collectiveVacationStart" character varying(255),
    "collectiveVacationEnd" character varying(255),
    schedules jsonb,
    "companyId" integer NOT NULL,
    "sendIdQueue" integer,
    "integrationId" integer,
    "promptId" integer,
    "queueIdImportMessages" integer,
    "flowIdNotPhrase" integer,
    "flowIdWelcome" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Telegrams_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Telegrams_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Telegrams_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Telegrams_id_seq" OWNED BY public."Telegrams".id;


--
-- Name: TicketNotes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketNotes" (
    id integer NOT NULL,
    note text NOT NULL,
    "ticketId" integer NOT NULL,
    "userId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TicketNotes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TicketNotes_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TicketNotes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TicketNotes_id_seq" OWNED BY public."TicketNotes".id;


--
-- Name: TicketTags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketTags" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: TicketTags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TicketTags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TicketTags_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TicketTags_id_seq" OWNED BY public."TicketTags".id;


--
-- Name: TicketTrakings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."TicketTrakings" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "whatsappId" integer,
    "userId" integer,
    "queueId" integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "finishedAt" timestamp with time zone,
    "startedAt" timestamp with time zone,
    "queuedAt" timestamp with time zone,
    rated boolean DEFAULT false,
    "closedAt" timestamp with time zone,
    "ratingAt" timestamp with time zone,
    "chatbotAt" timestamp with time zone
);


--
-- Name: TicketTrakings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."TicketTrakings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: TicketTrakings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."TicketTrakings_id_seq" OWNED BY public."TicketTrakings".id;


--
-- Name: Tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Tickets" (
    id integer NOT NULL,
    status character varying(255) DEFAULT 'pending'::character varying,
    "lastMessage" text,
    "contactId" integer NOT NULL,
    "userId" integer,
    "queueId" integer,
    "whatsappId" integer,
    "companyId" integer NOT NULL,
    "isGroup" boolean DEFAULT false,
    "unreadMessages" integer DEFAULT 0,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "showNotificationPending" boolean DEFAULT false,
    "flowWebhook" boolean,
    "lastFlowId" character varying(255),
    "hashFlowId" character varying(255),
    "flowStopped" character varying(255),
    "dataWebhook" jsonb,
    followup_count integer,
    "telegramId" integer,
    "isBot" boolean DEFAULT false,
    uuid character varying(255) DEFAULT (gen_random_uuid())::text,
    channel character varying(255) DEFAULT 'whatsapp'::character varying,
    "amountUsedBotQueues" integer DEFAULT 0,
    "amountUsedBotQueuesNPS" integer DEFAULT 0,
    "fromMe" boolean DEFAULT false,
    "sendInactiveMessage" boolean DEFAULT false,
    "lgpdSendMessageAt" timestamp without time zone,
    "lgpdAcceptedAt" timestamp without time zone,
    imported timestamp without time zone,
    "isOutOfHour" boolean DEFAULT false,
    "useIntegration" boolean DEFAULT false,
    "integrationId" integer,
    "isActiveDemand" boolean,
    "typebotSessionId" integer,
    "typebotStatus" boolean DEFAULT false,
    "typebotSessionTime" timestamp without time zone,
    rated boolean DEFAULT false,
    "queueOptionId" integer,
    "customerOriginId" integer,
    "followupEnabled" boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    title character varying(255),
    "aiStatus" character varying(20) DEFAULT 'inactive'::character varying NOT NULL,
    "conversationId" uuid,
    "inboundChannelHint" character varying(20),
    "flowState" character varying(50) DEFAULT 'intake'::character varying,
    "flowStep" integer DEFAULT 0 NOT NULL,
    "flowMetadata" jsonb DEFAULT '{}'::jsonb,
    "nextFollowupAt" timestamp without time zone,
    "lastFollowupAt" timestamp without time zone,
    "followupReason" character varying(100),
    "sourceKind" character varying
);


--
-- Name: Tickets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Tickets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Tickets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Tickets_id_seq" OWNED BY public."Tickets".id;


--
-- Name: UGCCampaignMetrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCampaignMetrics" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" integer NOT NULL,
    "snapshotAt" timestamp with time zone NOT NULL,
    "totalViews" integer DEFAULT 0,
    "totalLikes" integer DEFAULT 0,
    "totalComments" integer DEFAULT 0,
    "totalShares" integer DEFAULT 0,
    "totalEngagement" numeric(5,2) DEFAULT 0,
    "totalReach" integer DEFAULT 0,
    "totalImpressions" integer DEFAULT 0,
    "purchaseIntents" integer DEFAULT 0,
    "whatsappTriggers" integer DEFAULT 0,
    "newFollowers" integer DEFAULT 0,
    "costPerView" numeric(8,4) DEFAULT 0,
    "costPerEngagement" numeric(8,4) DEFAULT 0,
    roas numeric(8,2) DEFAULT 0,
    "videoCount" integer DEFAULT 0,
    "activeAgentCount" integer DEFAULT 0,
    "commentResponseRate" numeric(5,2) DEFAULT 0,
    "avgConsistencyScore" numeric(3,2) DEFAULT 0,
    "platformBreakdown" jsonb DEFAULT '{}'::jsonb,
    "topPerformingContent" jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCampaignMetrics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCampaignMetrics_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCampaignMetrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCampaignMetrics_id_seq" OWNED BY public."UGCCampaignMetrics".id;


--
-- Name: UGCCampaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCampaigns" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "productId" integer,
    name character varying(255) NOT NULL,
    description text,
    status character varying(50) DEFAULT 'draft'::character varying,
    "productBrief" jsonb DEFAULT '{}'::jsonb,
    "generationConfig" jsonb DEFAULT '{}'::jsonb,
    "publishConfig" jsonb DEFAULT '{}'::jsonb,
    "optimizationConfig" jsonb DEFAULT '{}'::jsonb,
    budget numeric(10,2) DEFAULT 0,
    "budgetSpent" numeric(10,2) DEFAULT 0,
    "totalVideosGenerated" integer DEFAULT 0,
    "totalPostsPublished" integer DEFAULT 0,
    "overallScore" numeric(5,2),
    "startedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "nextOptimizationAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdBy" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "videoModelKey" character varying(80),
    "videoModelId" character varying(160),
    "videoModelDefaults" jsonb DEFAULT '{}'::jsonb,
    "videoModelMotionReferenceUrl" text,
    "imageModelKey" character varying(80),
    "imageModelId" character varying(160),
    "imageModelDefaults" jsonb DEFAULT '{}'::jsonb,
    "modelSelectedAt" timestamp with time zone,
    "modelSelectedBy" integer,
    "voiceModelKey" character varying(80),
    "voiceModelDefaults" jsonb DEFAULT '{}'::jsonb,
    "lipsyncModelKey" character varying(80),
    "lipsyncModelDefaults" jsonb DEFAULT '{}'::jsonb,
    "pipelineMode" character varying(40) DEFAULT 'image-then-video'::character varying NOT NULL,
    CONSTRAINT "UGCCampaigns_pipelineMode_check" CHECK ((("pipelineMode")::text = ANY (ARRAY[('image-then-video'::character varying)::text, ('text-to-video-direct'::character varying)::text, ('lipsync-talking-head'::character varying)::text])))
);


--
-- Name: COLUMN "UGCCampaigns"."videoModelKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."videoModelKey" IS 'Adapter key fal.ai (ej: kling-v2.6-pro-i2v). Resuelve a un FalAdapter en el registry.';


--
-- Name: COLUMN "UGCCampaigns"."videoModelId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."videoModelId" IS 'Model ID literal fal.ai. Denormalizado para auditoría aunque el adapter cambie de modelId vía env.';


--
-- Name: COLUMN "UGCCampaigns"."videoModelDefaults"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."videoModelDefaults" IS 'JSONB con defaults configurables del adapter (duration, aspect_ratio, etc.). Validado por adapter.defaultSchema.';


--
-- Name: COLUMN "UGCCampaigns"."videoModelMotionReferenceUrl"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."videoModelMotionReferenceUrl" IS 'URL del video de motion-reference. Solo usado por motion-control adapters (Kling v3 Pro Motion Control).';


--
-- Name: COLUMN "UGCCampaigns"."imageModelKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."imageModelKey" IS 'Adapter key del modelo de imagen (text-to-image o image-to-image).';


--
-- Name: COLUMN "UGCCampaigns"."voiceModelKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."voiceModelKey" IS 'Adapter key del TTS. NULL si el pipeline no incluye voz.';


--
-- Name: COLUMN "UGCCampaigns"."lipsyncModelKey"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."lipsyncModelKey" IS 'Adapter key del lipsync. NULL salvo modo lipsync-talking-head.';


--
-- Name: COLUMN "UGCCampaigns"."pipelineMode"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCCampaigns"."pipelineMode" IS 'Modo del pipeline: image-then-video (default, retrocompat PR #1) | text-to-video-direct | lipsync-talking-head.';


--
-- Name: UGCCampaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCampaigns_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCampaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCampaigns_id_seq" OWNED BY public."UGCCampaigns".id;


--
-- Name: UGCCreativeLearnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCreativeLearnings" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "campaignId" integer,
    "learningType" character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    description text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb,
    impact character varying(50) DEFAULT 'medium'::character varying,
    confidence numeric(3,2) DEFAULT 0,
    recommendation text,
    "appliedAt" timestamp with time zone,
    "appliedResult" jsonb,
    source character varying(50) DEFAULT 'feedback_loop'::character varying,
    "extractedBy" character varying(255),
    "isActive" boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCreativeLearnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCreativeLearnings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCreativeLearnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCreativeLearnings_id_seq" OWNED BY public."UGCCreativeLearnings".id;


--
-- Name: UGCCreativeVariants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCreativeVariants" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "ugcCampaignId" integer NOT NULL,
    "variantLabel" character varying(10) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "scriptVariation" text,
    "avatarConfig" jsonb,
    "videoStyle" character varying(255),
    "captionVariation" text,
    "thumbnailUrl" character varying(1024),
    views integer DEFAULT 0,
    likes integer DEFAULT 0,
    comments integer DEFAULT 0,
    shares integer DEFAULT 0,
    "engagementRate" numeric(5,2) DEFAULT 0,
    "conversionRate" numeric(5,2) DEFAULT 0,
    "confidenceLevel" numeric(3,2) DEFAULT 0,
    "isWinner" boolean DEFAULT false,
    "isActive" boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCreativeVariants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCreativeVariants_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCreativeVariants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCreativeVariants_id_seq" OWNED BY public."UGCCreativeVariants".id;


--
-- Name: UGCCreatorAssignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCreatorAssignments" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "creatorId" integer NOT NULL,
    "campaignId" integer NOT NULL,
    brief text NOT NULL,
    requirements jsonb DEFAULT '{}'::jsonb,
    deadline timestamp with time zone NOT NULL,
    "agreedRate" numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    deliverables jsonb DEFAULT '[]'::jsonb,
    "revisionCount" integer DEFAULT 0,
    "maxRevisions" integer DEFAULT 2,
    feedback text,
    "creatorNotes" text,
    status character varying(50) DEFAULT 'invited'::character varying,
    "invitedAt" timestamp with time zone,
    "acceptedAt" timestamp with time zone,
    "submittedAt" timestamp with time zone,
    "approvedAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCreatorAssignments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCreatorAssignments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCreatorAssignments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCreatorAssignments_id_seq" OWNED BY public."UGCCreatorAssignments".id;


--
-- Name: UGCCreatorPayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCreatorPayments" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "creatorId" integer NOT NULL,
    "assignmentId" integer,
    amount numeric(10,2) NOT NULL,
    currency character varying(10) DEFAULT 'USD'::character varying,
    "platformFee" numeric(10,2) DEFAULT 0,
    "netAmount" numeric(10,2) NOT NULL,
    "paymentMethod" character varying(50) NOT NULL,
    "stripeTransferId" character varying(255),
    "stripePayoutId" character varying(255),
    "paypalPayoutId" character varying(255),
    "transactionReference" character varying(255),
    "invoiceUrl" character varying(1024),
    description text,
    status character varying(50) DEFAULT 'pending'::character varying,
    "paidAt" timestamp with time zone,
    "failureReason" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCreatorPayments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCreatorPayments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCreatorPayments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCreatorPayments_id_seq" OWNED BY public."UGCCreatorPayments".id;


--
-- Name: UGCCreators; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCCreators" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    phone character varying(50),
    "profileImageUrl" character varying(1024),
    bio text,
    niche character varying(255) NOT NULL,
    platforms jsonb DEFAULT '[]'::jsonb,
    "followerCount" integer DEFAULT 0,
    "engagementRate" numeric(5,2) DEFAULT 0,
    "averageViews" integer DEFAULT 0,
    "completedCampaigns" integer DEFAULT 0,
    rating numeric(3,2) DEFAULT 0,
    "baseRate" numeric(10,2) DEFAULT 0,
    currency character varying(10) DEFAULT 'USD'::character varying,
    "paymentMethod" character varying(50) DEFAULT 'stripe'::character varying,
    "stripeAccountId" character varying(255),
    "paypalEmail" character varying(255),
    "bankDetails" jsonb,
    portfolio jsonb DEFAULT '[]'::jsonb,
    tags jsonb DEFAULT '[]'::jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    "verifiedAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCCreators_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCCreators_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCCreators_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCCreators_id_seq" OWNED BY public."UGCCreators".id;


--
-- Name: UGCPostComments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCPostComments" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "socialPostId" integer NOT NULL,
    "assignedAgentIdentityId" integer,
    "platformCommentId" character varying(255) NOT NULL,
    "authorUsername" character varying(255) NOT NULL,
    "authorDisplayName" character varying(255),
    "authorProfileImageUrl" character varying(1024),
    content text NOT NULL,
    "parentCommentId" integer,
    "commentType" character varying(50) DEFAULT 'neutral'::character varying,
    sentiment character varying(50) DEFAULT 'neutral'::character varying,
    "purchaseIntentScore" numeric(3,2) DEFAULT 0,
    "autoReplyContent" text,
    "autoReplyStatus" character varying(50) DEFAULT 'pending'::character varying,
    "autoRepliedAt" timestamp with time zone,
    "whatsappTriggered" boolean DEFAULT false,
    "classifiedAt" timestamp with time zone,
    "classifiedBy" character varying(100),
    platform character varying(50) NOT NULL,
    "postedAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "fromMe" boolean DEFAULT false,
    "whatsappId" integer,
    "likeCount" integer DEFAULT 0,
    "replyCount" integer DEFAULT 0,
    "isHidden" boolean DEFAULT false NOT NULL,
    "isDeleted" boolean DEFAULT false NOT NULL,
    "moderationStatus" character varying(24),
    "sensitiveCategory" character varying(60),
    "moderationDraft" text
);


--
-- Name: COLUMN "UGCPostComments"."fromMe"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCPostComments"."fromMe" IS 'true si el comentario fue enviado por nosotros (reply manual o IA)';


--
-- Name: COLUMN "UGCPostComments"."whatsappId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCPostComments"."whatsappId" IS 'FK a Whatsapps — conexión TikTok que originó este comentario';


--
-- Name: COLUMN "UGCPostComments"."likeCount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCPostComments"."likeCount" IS 'Cantidad de likes que tiene el comentario en TikTok';


--
-- Name: COLUMN "UGCPostComments"."replyCount"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."UGCPostComments"."replyCount" IS 'Cantidad de respuestas que tiene el comentario en TikTok';


--
-- Name: UGCPostComments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCPostComments_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCPostComments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCPostComments_id_seq" OWNED BY public."UGCPostComments".id;


--
-- Name: UGCSocialAccounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCSocialAccounts" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    platform character varying(50) NOT NULL,
    "platformAccountId" character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    "displayName" character varying(255),
    "profileImageUrl" character varying(1024),
    "accessToken" text NOT NULL,
    "refreshToken" text,
    "tokenExpiresAt" timestamp with time zone,
    scopes jsonb DEFAULT '[]'::jsonb,
    "followerCount" integer DEFAULT 0,
    "followingCount" integer DEFAULT 0,
    "postCount" integer DEFAULT 0,
    "engagementRate" numeric(5,2) DEFAULT 0,
    "lastSyncAt" timestamp with time zone,
    status character varying(50) DEFAULT 'active'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCSocialAccounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCSocialAccounts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCSocialAccounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCSocialAccounts_id_seq" OWNED BY public."UGCSocialAccounts".id;


--
-- Name: UGCSocialPosts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCSocialPosts" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "socialAccountId" integer NOT NULL,
    "ugcCampaignId" integer,
    "ugcVideoJobId" integer,
    "agentIdentityId" integer,
    "platformPostId" character varying(255),
    platform character varying(50) NOT NULL,
    "postType" character varying(50) NOT NULL,
    caption text,
    "mediaUrl" text,
    "thumbnailUrl" text,
    "publishedAt" timestamp with time zone,
    "scheduledAt" timestamp with time zone,
    views integer DEFAULT 0,
    likes integer DEFAULT 0,
    comments integer DEFAULT 0,
    shares integer DEFAULT 0,
    saves integer DEFAULT 0,
    "engagementRate" numeric(5,2) DEFAULT 0,
    "reachCount" integer DEFAULT 0,
    "impressionCount" integer DEFAULT 0,
    "purchaseIntents" integer DEFAULT 0,
    "whatsappTriggers" integer DEFAULT 0,
    roas numeric(8,2) DEFAULT 0,
    "lastMetricsSyncAt" timestamp with time zone,
    status character varying(50) DEFAULT 'draft'::character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCSocialPosts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCSocialPosts_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCSocialPosts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCSocialPosts_id_seq" OWNED BY public."UGCSocialPosts".id;


--
-- Name: UGCVideoAssets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCVideoAssets" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "ugcVideoJobId" integer NOT NULL,
    "ugcCampaignId" integer NOT NULL,
    "assetType" character varying(50) DEFAULT 'composed_final'::character varying,
    "fileName" character varying(512) NOT NULL,
    "originalUrl" character varying(1024),
    "localPath" character varying(1024) NOT NULL,
    "fileSize" bigint DEFAULT 0,
    "mimeType" character varying(100) DEFAULT 'video/mp4'::character varying,
    duration integer,
    version integer DEFAULT 1,
    "isActive" boolean DEFAULT true,
    "downloadCount" integer DEFAULT 0,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UGCVideoAssets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCVideoAssets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCVideoAssets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCVideoAssets_id_seq" OWNED BY public."UGCVideoAssets".id;


--
-- Name: UGCVideoJobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UGCVideoJobs" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "ugcCampaignId" integer,
    "userId" integer NOT NULL,
    stage character varying(50) DEFAULT 'script_generation'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    progress integer DEFAULT 0,
    script text,
    "scriptVersion" integer DEFAULT 1,
    "avatarProvider" character varying(100),
    "avatarId" character varying(255),
    "avatarVideoUrl" character varying(1024),
    "videoProvider" character varying(100),
    "videoProviderJobId" character varying(255),
    "rawVideoUrl" character varying(1024),
    "compositorProvider" character varying(100),
    "finalVideoUrl" character varying(1024),
    "thumbnailUrl" character varying(1024),
    "fileName" character varying(512),
    "fileSize" bigint,
    duration integer,
    "mimeType" character varying(100) DEFAULT 'video/mp4'::character varying,
    "totalCreditsUsed" numeric(10,2) DEFAULT 0,
    "totalCostUsd" numeric(10,4) DEFAULT 0,
    "creativeScore" numeric(5,2),
    "scoreDetails" jsonb,
    "errorMessage" text,
    "retryCount" integer DEFAULT 0,
    "pipelineLog" jsonb DEFAULT '[]'::jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    provider character varying(50),
    "mediaType" character varying(20),
    "modelKey" character varying(120),
    "styleId" character varying(120),
    "idempotencyKey" character varying(120),
    "promptText" text
);


--
-- Name: UGCVideoJobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UGCVideoJobs_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UGCVideoJobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UGCVideoJobs_id_seq" OWNED BY public."UGCVideoJobs".id;


--
-- Name: UnifiedConversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UnifiedConversations" (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "companyId" integer NOT NULL,
    "canonicalNumber" character varying(32) NOT NULL,
    "primaryContactId" integer,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    "routingPolicy" character varying(20) DEFAULT 'auto'::character varying NOT NULL,
    "currentChannel" character varying(20),
    "lastInboundChannel" character varying(20),
    "lastOutboundChannel" character varying(20),
    "lastInboundAt" timestamp with time zone,
    "lastOutboundAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UserQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserQueues" (
    id integer NOT NULL,
    "userId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: UserQueues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UserQueues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UserQueues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UserQueues_id_seq" OWNED BY public."UserQueues".id;


--
-- Name: UserRatings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserRatings" (
    id integer NOT NULL,
    "ticketId" integer NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer NOT NULL,
    rate integer,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: UserRatings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UserRatings_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UserRatings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UserRatings_id_seq" OWNED BY public."UserRatings".id;


--
-- Name: UserTermsAcceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."UserTermsAcceptances" (
    id integer NOT NULL,
    "userId" integer,
    "companyId" integer,
    "documentType" integer,
    "documentVersion" character varying(255),
    "ipAddress" character varying(255),
    "userAgent" text,
    "deviceInfo" json,
    "acceptedAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: UserTermsAcceptances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."UserTermsAcceptances_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: UserTermsAcceptances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."UserTermsAcceptances_id_seq" OWNED BY public."UserTermsAcceptances".id;


--
-- Name: Users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Users" (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    "passwordHash" character varying(255) NOT NULL,
    profile character varying(255) DEFAULT 'user'::character varying,
    "tokenVersion" integer DEFAULT 0,
    "companyId" integer NOT NULL,
    super boolean DEFAULT false,
    online boolean DEFAULT false,
    "lastLogin" timestamp without time zone,
    "lastLogout" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "profileImage" character varying(255),
    "whatsappId" integer,
    color character varying(255),
    "allTicket" character varying(10) DEFAULT 'disable'::character varying,
    "allowGroup" boolean DEFAULT false,
    "defaultTheme" character varying(255) DEFAULT 'light'::character varying,
    "defaultMenu" character varying(255) DEFAULT 'open'::character varying,
    "farewellMessage" text,
    "allUserChat" character varying(10) DEFAULT 'disabled'::character varying,
    "userClosePendingTicket" character varying(10) DEFAULT 'disabled'::character varying,
    "defaultTicketsManagerWidth" integer DEFAULT 550,
    "allowRealTime" character varying(10) DEFAULT 'enabled'::character varying,
    "allowConnections" character varying(10) DEFAULT 'enabled'::character varying,
    "startWork" character varying(5),
    "endWork" character varying(5),
    "allHistoric" character varying(255) DEFAULT 'disabled'::character varying,
    "showDashboard" character varying(255) DEFAULT 'disabled'::character varying,
    "resetPasswordToken" character varying(255) DEFAULT NULL::character varying,
    "resetPasswordExpires" timestamp without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "notifyNewAppointments" boolean DEFAULT false NOT NULL,
    "roleId" integer
);


--
-- Name: COLUMN "Users"."notifyNewAppointments"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Users"."notifyNewAppointments" IS 'Recibir notificaciones in-app cuando se cree una cita en la empresa (admins)';


--
-- Name: Users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Users_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Users_id_seq" OWNED BY public."Users".id;


--
-- Name: Versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Versions" (
    id integer NOT NULL,
    "versionFrontend" character varying(255),
    "versionBackend" character varying(255),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Versions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Versions_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Versions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Versions_id_seq" OWNED BY public."Versions".id;


--
-- Name: WebChatConversationMessages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebChatConversationMessages" (
    id integer NOT NULL,
    "conversationId" integer NOT NULL,
    "companyId" integer NOT NULL,
    direction character varying(255) NOT NULL,
    body text NOT NULL,
    "senderId" integer,
    type character varying(255) DEFAULT 'text'::character varying NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "readAt" timestamp with time zone,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: WebChatConversationMessages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WebChatConversationMessages_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WebChatConversationMessages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WebChatConversationMessages_id_seq" OWNED BY public."WebChatConversationMessages".id;


--
-- Name: WebChatConversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebChatConversations" (
    id integer NOT NULL,
    uuid character varying(255) NOT NULL,
    "companyId" integer NOT NULL,
    "widgetId" integer NOT NULL,
    "sessionId" character varying(255) NOT NULL,
    "visitorName" character varying(255) DEFAULT 'Visitante Web'::character varying NOT NULL,
    status character varying(255) DEFAULT 'open'::character varying NOT NULL,
    "unreadMessages" integer DEFAULT 0 NOT NULL,
    "lastMessage" text,
    "lastMessageAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL
);


--
-- Name: WebChatConversations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WebChatConversations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WebChatConversations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WebChatConversations_id_seq" OWNED BY public."WebChatConversations".id;


--
-- Name: WebChatWidgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WebChatWidgets" (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    name character varying(255) NOT NULL,
    "whatsappId" integer,
    channel character varying(50) DEFAULT 'whatsapp'::character varying,
    "primaryColor" character varying(20) DEFAULT '#2196F3'::character varying,
    "secondaryColor" character varying(20) DEFAULT '#FFC107'::character varying,
    "position" character varying(20) DEFAULT 'bottom-right'::character varying,
    size character varying(20) DEFAULT 'medium'::character varying,
    "borderRadius" integer DEFAULT 16,
    "welcomeMessage" text DEFAULT '¡Hola! ¿En qué podemos ayudarte?'::text,
    "offlineMessage" text,
    "placeholderText" character varying(255) DEFAULT 'Escribe tu mensaje...'::character varying,
    "autoOpen" boolean DEFAULT false,
    "autoOpenDelay" integer DEFAULT 3,
    "showAvatar" boolean DEFAULT true,
    "showAgentName" boolean DEFAULT true,
    "enableSound" boolean DEFAULT true,
    "enableFileUpload" boolean DEFAULT true,
    "workingHoursEnabled" boolean DEFAULT false,
    "workingHours" character varying(255),
    timezone character varying(50) DEFAULT 'America/Santiago'::character varying,
    "allowedDomains" text,
    "apiKey" character varying(100) NOT NULL,
    "queueId" integer,
    "customCSS" text,
    status boolean DEFAULT true,
    "createdAt" timestamp(6) without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp(6) without time zone DEFAULT now() NOT NULL
);


--
-- Name: WebChatWidgets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WebChatWidgets_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WebChatWidgets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WebChatWidgets_id_seq" OWNED BY public."WebChatWidgets".id;


--
-- Name: Webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Webhooks" (
    id integer NOT NULL,
    url text NOT NULL,
    method character varying(255) DEFAULT 'POST'::character varying,
    headers jsonb,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: Webhooks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Webhooks_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Webhooks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Webhooks_id_seq" OWNED BY public."Webhooks".id;


--
-- Name: WhatsAppTemplates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WhatsAppTemplates" (
    id integer NOT NULL,
    name character varying(512) NOT NULL,
    "metaTemplateId" character varying(255),
    category public."enum_WhatsAppTemplates_category" DEFAULT 'UTILITY'::public."enum_WhatsAppTemplates_category" NOT NULL,
    language character varying(10) DEFAULT 'es'::character varying NOT NULL,
    "parameterFormat" public."enum_WhatsAppTemplates_parameterFormat" DEFAULT 'positional'::public."enum_WhatsAppTemplates_parameterFormat" NOT NULL,
    status public."enum_WhatsAppTemplates_status" DEFAULT 'PENDING'::public."enum_WhatsAppTemplates_status" NOT NULL,
    "rejectedReason" text,
    "headerType" public."enum_WhatsAppTemplates_headerType" DEFAULT 'NONE'::public."enum_WhatsAppTemplates_headerType" NOT NULL,
    "headerContent" text,
    "headerMediaHandle" character varying(255),
    "bodyContent" text NOT NULL,
    "footerContent" character varying(60),
    buttons jsonb,
    "variablesCount" integer DEFAULT 0 NOT NULL,
    "variableExamples" jsonb,
    "namedVariableExamples" jsonb,
    components jsonb,
    "usageCount" integer DEFAULT 0 NOT NULL,
    "lastUsedAt" timestamp with time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "companyId" integer NOT NULL,
    "whatsappId" integer,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: WhatsAppTemplates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WhatsAppTemplates_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WhatsAppTemplates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WhatsAppTemplates_id_seq" OWNED BY public."WhatsAppTemplates".id;


--
-- Name: WhatsappQueues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."WhatsappQueues" (
    id integer NOT NULL,
    "whatsappId" integer NOT NULL,
    "queueId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: WhatsappQueues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."WhatsappQueues_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: WhatsappQueues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."WhatsappQueues_id_seq" OWNED BY public."WhatsappQueues".id;


--
-- Name: Whatsapps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Whatsapps" (
    id integer NOT NULL,
    name text NOT NULL,
    session text,
    qrcode text,
    status character varying(255) DEFAULT 'DISCONNECTED'::character varying,
    battery character varying(255),
    plugged boolean,
    retries integer DEFAULT 0,
    number character varying(255),
    "isDefault" boolean DEFAULT false,
    "companyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    channel character varying,
    "greetingMessage" text DEFAULT ''::text,
    "farewellMessage" text DEFAULT ''::text,
    "complationMessage" text DEFAULT ''::text,
    "outOfHoursMessage" text DEFAULT ''::text,
    token text,
    "tokenHash" character varying(64),
    "maxUseBotQueues" integer DEFAULT 3,
    "timeUseBotQueues" character varying(255) DEFAULT '0'::character varying,
    "expiresTicket" character varying(255) DEFAULT '0'::character varying,
    "allowGroup" boolean DEFAULT false,
    "timeSendQueue" integer DEFAULT 0,
    "sendIdQueue" integer,
    "timeInactiveMessage" character varying(255),
    "inactiveMessage" text,
    "ratingMessage" text,
    "maxUseBotQueuesNPS" integer DEFAULT 0,
    "expiresTicketNPS" integer DEFAULT 0,
    "whenExpiresTicket" character varying(255),
    "expiresInactiveMessage" character varying(255),
    "groupAsTicket" character varying(255) DEFAULT 'disabled'::character varying,
    "timeCreateNewTicket" integer DEFAULT 0,
    "collectiveVacationMessage" text,
    "collectiveVacationStart" character varying(255),
    "collectiveVacationEnd" character varying(255),
    schedules jsonb,
    "integrationId" integer,
    "promptId" integer,
    "queueIdImportMessages" integer,
    "flowIdNotPhrase" integer,
    "flowIdWelcome" integer,
    "importOldMessages" character varying(255),
    "importRecentMessages" character varying(255),
    "closedTicketsPostImported" boolean DEFAULT false,
    "importOldMessagesGroups" boolean DEFAULT false,
    "greetingMediaAttachment" character varying(255),
    provider character varying(255) DEFAULT 'stable'::character varying,
    "facebookUserId" text,
    "facebookUserToken" text,
    "facebookPageUserId" text,
    "tokenMeta" text,
    "statusImportMessages" character varying(255),
    "botToken" character varying(255),
    "botUsername" character varying(255),
    "displayPhoneNumber" character varying(255),
    "phoneNumberId" character varying(255),
    type character varying(50),
    "webhookUrl" character varying(500),
    "facebookAdAccountId" character varying(255),
    "facebookBusinessId" character varying(255),
    "coexistenceEnabled" boolean DEFAULT false NOT NULL,
    "coexistenceStatus" character varying(50) DEFAULT NULL::character varying,
    "coexistenceOnboardedAt" timestamp with time zone,
    "lastAppOpenedAt" timestamp with time zone,
    "embeddedSignupSessionId" character varying(255) DEFAULT NULL::character varying,
    "tiktokAccessToken" text,
    "tiktokRefreshToken" text,
    "tiktokOpenId" character varying(255),
    "tiktokTokenExpiresAt" timestamp with time zone,
    "tiktokLastPollAt" timestamp with time zone,
    "tiktokPollingEnabled" boolean DEFAULT true,
    "tiktokPollingInterval" integer DEFAULT 120,
    "tiktokBusinessAccessToken" text,
    "tiktokBusinessRefreshToken" text,
    "tiktokBusinessAdvertiserId" character varying(255),
    "tiktokBusinessTokenExpiresAt" timestamp with time zone,
    "tiktokBusinessConnected" boolean DEFAULT false,
    "useAIOrchestrator" boolean DEFAULT false NOT NULL,
    "receiveChannel" character varying(20) DEFAULT 'both'::character varying,
    "sendChannel" character varying(20) DEFAULT 'baileys'::character varying,
    "linkedWhatsappId" integer,
    "npsEnabled" boolean,
    "acceptAudio" boolean,
    "callRejectMessage" text DEFAULT ''::text,
    "rejectAudioMessage" text DEFAULT ''::text,
    "pageAccessToken" text,
    "instagramBusinessAccountId" text,
    "tokenMetaExpiresAt" timestamp with time zone
);


--
-- Name: COLUMN "Whatsapps"."facebookAdAccountId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."facebookAdAccountId" IS 'Facebook Ad Account ID (without act_ prefix) for marketing insights';


--
-- Name: COLUMN "Whatsapps"."facebookBusinessId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."facebookBusinessId" IS 'Facebook Business Manager ID (optional)';


--
-- Name: COLUMN "Whatsapps"."tiktokPollingInterval"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokPollingInterval" IS 'Intervalo de polling en segundos: 30, 60, 120, 300, 600';


--
-- Name: COLUMN "Whatsapps"."tiktokBusinessAccessToken"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokBusinessAccessToken" IS 'Access Token de TikTok Business API para responder comentarios';


--
-- Name: COLUMN "Whatsapps"."tiktokBusinessRefreshToken"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokBusinessRefreshToken" IS 'Refresh Token de TikTok Business API';


--
-- Name: COLUMN "Whatsapps"."tiktokBusinessAdvertiserId"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokBusinessAdvertiserId" IS 'Advertiser ID de TikTok Business API';


--
-- Name: COLUMN "Whatsapps"."tiktokBusinessTokenExpiresAt"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokBusinessTokenExpiresAt" IS 'Fecha de expiración del token Business API';


--
-- Name: COLUMN "Whatsapps"."tiktokBusinessConnected"; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public."Whatsapps"."tiktokBusinessConnected" IS 'true si la conexión tiene Business API activa (permite responder comentarios)';


--
-- Name: Whatsapps_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public."Whatsapps_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: Whatsapps_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public."Whatsapps_id_seq" OWNED BY public."Whatsapps".id;


--
-- Name: appointment_ai_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_ai_suggestions (
    id bigint NOT NULL,
    "companyId" bigint,
    "contactId" bigint,
    "serviceId" bigint,
    "suggestedTime" timestamp with time zone,
    "suggestedUserId" bigint,
    confidence numeric(5,2),
    reasoning text,
    status character varying(50) DEFAULT 'pending'::character varying,
    "appliedAt" timestamp with time zone,
    "expiresAt" timestamp with time zone,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: appointment_ai_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_ai_suggestions_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_ai_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_ai_suggestions_id_seq OWNED BY public.appointment_ai_suggestions.id;


--
-- Name: appointment_analytics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_analytics (
    id bigint NOT NULL,
    "companyId" bigint,
    "serviceId" bigint,
    "userId" bigint,
    date date,
    "totalBookings" integer DEFAULT 0,
    "completedBookings" integer DEFAULT 0,
    "cancelledBookings" integer DEFAULT 0,
    "noShowBookings" integer DEFAULT 0,
    revenue numeric(10,2) DEFAULT 0,
    "avgDuration" integer DEFAULT 0,
    "avgWaitTime" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: appointment_analytics_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_analytics_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_analytics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_analytics_id_seq OWNED BY public.appointment_analytics.id;


--
-- Name: appointment_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_availability (
    id bigint NOT NULL,
    "companyId" bigint,
    "userId" bigint,
    "serviceId" bigint,
    "dayOfWeek" integer,
    "startTime" time without time zone,
    "endTime" time without time zone,
    "isAvailable" boolean DEFAULT true,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    "effectiveFrom" date,
    "effectiveUntil" date,
    "recurrenceRule" text,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "isBooked" boolean DEFAULT false,
    "bookedByAppointmentId" bigint
);


--
-- Name: appointment_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_availability_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_availability_id_seq OWNED BY public.appointment_availability.id;


--
-- Name: appointment_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_blocks (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    "userId" bigint,
    title character varying(255),
    "startTime" timestamp with time zone NOT NULL,
    "endTime" timestamp with time zone NOT NULL,
    reason text,
    "isRecurring" boolean DEFAULT false,
    "recurrenceRule" text,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: appointment_blocks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_blocks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_blocks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_blocks_id_seq OWNED BY public.appointment_blocks.id;


--
-- Name: appointment_calendar_sync; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_calendar_sync (
    id bigint NOT NULL,
    "userId" bigint,
    "companyId" bigint,
    provider character varying(50),
    "accessToken" text,
    "refreshToken" text,
    "tokenExpiry" timestamp with time zone,
    "calendarId" character varying(255),
    "isEnabled" boolean DEFAULT true,
    "lastSyncAt" timestamp with time zone,
    settings jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "calendarName" character varying(255),
    "syncDirection" character varying(50) DEFAULT 'bidirectional'::character varying
);


--
-- Name: appointment_calendar_sync_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_calendar_sync_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_calendar_sync_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_calendar_sync_id_seq OWNED BY public.appointment_calendar_sync.id;


--
-- Name: appointment_calendar_syncs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_calendar_syncs (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    "userId" bigint NOT NULL,
    provider character varying(50) NOT NULL,
    "accessToken" text,
    "refreshToken" text,
    "tokenExpiry" timestamp with time zone,
    "calendarId" character varying(255),
    "syncEnabled" boolean DEFAULT true,
    "lastSyncAt" timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: appointment_calendar_syncs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_calendar_syncs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_calendar_syncs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_calendar_syncs_id_seq OWNED BY public.appointment_calendar_syncs.id;


--
-- Name: appointment_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_reminders (
    id bigint NOT NULL,
    "appointmentId" bigint,
    "companyId" bigint,
    "reminderType" character varying(50),
    "remindAt" timestamp with time zone,
    "scheduledFor" timestamp with time zone,
    "minutesBefore" integer,
    status character varying(50) DEFAULT 'pending'::character varying,
    "sentAt" timestamp with time zone,
    message text,
    "errorMessage" text,
    channel character varying(50) DEFAULT 'whatsapp'::character varying,
    content text,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: appointment_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_reminders_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_reminders_id_seq OWNED BY public.appointment_reminders.id;


--
-- Name: appointment_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointment_services (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    duration integer NOT NULL,
    "bufferTime" integer DEFAULT 0,
    price numeric(10,2),
    currency character varying(3) DEFAULT 'USD'::character varying,
    color character varying(7) DEFAULT '#007bff'::character varying,
    "isActive" boolean DEFAULT true,
    "maxAttendees" integer DEFAULT 1,
    "requiresConfirmation" boolean DEFAULT false,
    settings jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: appointment_services_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointment_services_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointment_services_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointment_services_id_seq OWNED BY public.appointment_services.id;


--
-- Name: appointments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.appointments (
    id bigint NOT NULL,
    "companyId" bigint,
    "serviceId" bigint,
    "userId" bigint,
    "contactId" bigint,
    "ticketId" bigint,
    title character varying(255),
    description text,
    "startTime" timestamp with time zone,
    "endTime" timestamp with time zone,
    duration integer,
    timezone character varying(50) DEFAULT 'UTC'::character varying,
    status character varying(50) DEFAULT 'scheduled'::character varying,
    "attendeeName" character varying(255),
    "attendeeEmail" character varying(255),
    "attendeePhone" character varying(50),
    "attendeeCount" integer DEFAULT 1,
    location character varying(255),
    "locationType" character varying(50) DEFAULT 'in_person'::character varying,
    "meetingUrl" text,
    "meetingPlatform" character varying(50),
    notes text,
    "internalNotes" text,
    "cancellationReason" text,
    "rescheduledFrom" bigint,
    "rescheduledTo" bigint,
    "googleCalendarEventId" character varying(255),
    "outlookCalendarEventId" character varying(255),
    "reminderSent" boolean DEFAULT false,
    "confirmationSent" boolean DEFAULT false,
    "aiSuggested" boolean DEFAULT false,
    "aiOptimizationData" jsonb,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdBy" bigint,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now(),
    "cancelledAt" timestamp with time zone,
    "confirmedAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "reminderTemplateId" bigint
);


--
-- Name: appointments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.appointments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: appointments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.appointments_id_seq OWNED BY public.appointments.id;


--
-- Name: campaign_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_approvals (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    period character varying(7) NOT NULL,
    title character varying(160),
    status character varying(24) DEFAULT 'draft'::character varying NOT NULL,
    feedback text,
    "revisionCount" integer DEFAULT 0 NOT NULL,
    "submittedAt" timestamp without time zone,
    "approvedAt" timestamp without time zone,
    "approvedByUserId" integer,
    "deadlineAt" timestamp without time zone,
    pieces jsonb,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: campaign_approvals_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.campaign_approvals_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: campaign_approvals_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.campaign_approvals_id_seq OWNED BY public.campaign_approvals.id;


--
-- Name: comment_moderation_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comment_moderation_audits (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "commentId" integer NOT NULL,
    "userId" integer,
    action character varying(24) NOT NULL,
    "fromStatus" character varying(24),
    "toStatus" character varying(24),
    category character varying(60),
    "draftBefore" text,
    "draftAfter" text,
    note text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: comment_moderation_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.comment_moderation_audits_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: comment_moderation_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.comment_moderation_audits_id_seq OWNED BY public.comment_moderation_audits.id;


--
-- Name: contact_memory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_memory (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    contact_id integer NOT NULL,
    company_id integer NOT NULL,
    memory_type character varying(30) NOT NULL,
    content text NOT NULL,
    embedding public.vector(1536),
    confidence double precision DEFAULT 1.0,
    source_ticket_id integer,
    verified boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_confirmed_at timestamp without time zone
);


--
-- Name: email_ab_tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_ab_tests (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    "campaignId" bigint NOT NULL,
    name character varying(255) NOT NULL,
    "testType" character varying(50) DEFAULT 'subject'::character varying,
    status character varying(50) DEFAULT 'draft'::character varying,
    variants jsonb NOT NULL,
    "winnerCriteria" character varying(50) DEFAULT 'open_rate'::character varying,
    "winnerVariantId" character varying(10),
    "testPercentage" integer DEFAULT 20,
    "testDurationHours" integer DEFAULT 4,
    results jsonb,
    "decidedAt" timestamp with time zone,
    "createdBy" bigint,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_ab_tests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_ab_tests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_ab_tests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_ab_tests_id_seq OWNED BY public.email_ab_tests.id;


--
-- Name: email_automations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_automations (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    "triggerType" character varying(50) NOT NULL,
    "triggerConfig" jsonb DEFAULT '{}'::jsonb,
    status character varying(50) DEFAULT 'draft'::character varying,
    "emailTemplateId" bigint,
    "emailSubject" character varying(500),
    "emailContent" text,
    "delaySeconds" integer DEFAULT 0,
    "contactListId" integer,
    "totalTriggered" integer DEFAULT 0,
    "totalSent" integer DEFAULT 0,
    "totalOpened" integer DEFAULT 0,
    "totalClicked" integer DEFAULT 0,
    "lastTriggeredAt" timestamp with time zone,
    "createdBy" bigint,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_automations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_automations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_automations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_automations_id_seq OWNED BY public.email_automations.id;


--
-- Name: email_campaign_recipients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_recipients (
    id bigint NOT NULL,
    "campaignId" bigint,
    "companyId" bigint,
    "contactId" bigint,
    email character varying(255) NOT NULL,
    name character varying(255),
    "personalizationData" jsonb DEFAULT '{}'::jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    "sentAt" timestamp with time zone,
    "deliveredAt" timestamp with time zone,
    "openedAt" timestamp with time zone,
    "firstOpenedAt" timestamp with time zone,
    "clickedAt" timestamp with time zone,
    "firstClickedAt" timestamp with time zone,
    "bouncedAt" timestamp with time zone,
    "bounceType" character varying(50),
    "bounceReason" text,
    "unsubscribedAt" timestamp with time zone,
    "spamComplaintAt" timestamp with time zone,
    "providerMessageId" character varying(255),
    "openCount" integer DEFAULT 0,
    "clickCount" integer DEFAULT 0,
    "errorMessage" text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_campaign_recipients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_campaign_recipients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_campaign_recipients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_campaign_recipients_id_seq OWNED BY public.email_campaign_recipients.id;


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id bigint NOT NULL,
    "companyId" bigint,
    name character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    "previewText" character varying(255),
    "fromName" character varying(255),
    "fromEmail" character varying(255),
    "replyToEmail" character varying(255),
    "templateId" bigint,
    "htmlContent" text,
    "textContent" text,
    status character varying(50) DEFAULT 'INACTIVA'::character varying,
    type character varying(50) DEFAULT 'standard'::character varying,
    "sendAt" timestamp with time zone,
    "completedAt" timestamp with time zone,
    "acelleCampaignUid" character varying(255),
    "contactListId" integer,
    "tagListId" integer,
    "mediaPath" character varying(255),
    "mediaName" character varying(255),
    "totalRecipients" integer DEFAULT 0,
    "totalSent" integer DEFAULT 0,
    "totalDelivered" integer DEFAULT 0,
    "totalOpened" integer DEFAULT 0,
    "totalClicked" integer DEFAULT 0,
    "totalBounced" integer DEFAULT 0,
    "totalUnsubscribed" integer DEFAULT 0,
    "totalSpamComplaints" integer DEFAULT 0,
    provider character varying(50) DEFAULT 'acelle'::character varying,
    "providerCampaignId" character varying(255),
    settings jsonb DEFAULT '{}'::jsonb,
    "aiOptimized" boolean DEFAULT false,
    "aiOptimizationData" jsonb,
    tags text[],
    "createdBy" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    "sendIntervalSeconds" integer DEFAULT 0,
    "dispatchMode" character varying(20) DEFAULT 'provider_native'::character varying NOT NULL
);


--
-- Name: email_campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_campaigns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_campaigns_id_seq OWNED BY public.email_campaigns.id;


--
-- Name: email_provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_provider_configs (
    id bigint NOT NULL,
    "companyId" bigint,
    provider character varying(50) NOT NULL,
    "apiKey" text NOT NULL,
    "apiSecret" text,
    domain character varying(255),
    region character varying(50),
    "verifiedSenderEmail" character varying(255),
    "verifiedSenderName" character varying(255),
    "isActive" boolean DEFAULT true,
    "dailyLimit" integer DEFAULT 10000,
    "hourlyLimit" integer DEFAULT 1000,
    settings jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_provider_configs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_provider_configs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_provider_configs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_provider_configs_id_seq OWNED BY public.email_provider_configs.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id bigint NOT NULL,
    "companyId" bigint,
    name character varying(255) NOT NULL,
    subject character varying(500) NOT NULL,
    "previewText" character varying(255),
    "htmlContent" text NOT NULL,
    "textContent" text,
    "designJson" jsonb DEFAULT '{}'::jsonb,
    category character varying(100) DEFAULT 'general'::character varying,
    "isAiGenerated" boolean DEFAULT false,
    "aiPrompt" text,
    tags text[],
    "thumbnailUrl" text,
    status character varying(50) DEFAULT 'draft'::character varying,
    "createdBy" bigint,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
    provider character varying(50),
    "providerTemplateId" character varying(255),
    type character varying(50) DEFAULT 'campaign'::character varying NOT NULL
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: email_tracking_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_tracking_events (
    id bigint NOT NULL,
    "recipientId" bigint,
    "campaignId" bigint,
    "companyId" bigint,
    "eventType" character varying(50) NOT NULL,
    "eventData" jsonb DEFAULT '{}'::jsonb,
    "ipAddress" character varying(45),
    "userAgent" text,
    location jsonb,
    "deviceType" character varying(50),
    "emailClient" character varying(100),
    "linkUrl" text,
    "timestamp" timestamp with time zone DEFAULT now()
);


--
-- Name: email_tracking_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_tracking_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_tracking_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_tracking_events_id_seq OWNED BY public.email_tracking_events.id;


--
-- Name: impersonation_audits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.impersonation_audits (
    id bigint NOT NULL,
    "superUserId" integer NOT NULL,
    "superName" character varying(120),
    "companyId" integer NOT NULL,
    "companyName" character varying(160),
    action character varying(12) NOT NULL,
    ip character varying(60),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: impersonation_audits_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.impersonation_audits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: impersonation_audits_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.impersonation_audits_id_seq OWNED BY public.impersonation_audits.id;


--
-- Name: integration_api_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_api_requests (
    id bigint NOT NULL,
    "connectionId" bigint,
    "companyId" bigint NOT NULL,
    method character varying(10),
    url text,
    "requestHeaders" jsonb DEFAULT '{}'::jsonb,
    "requestBody" jsonb,
    "responseStatus" integer,
    "responseBody" jsonb,
    duration integer,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_api_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_api_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_api_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_api_requests_id_seq OWNED BY public.integration_api_requests.id;


--
-- Name: integration_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_connections (
    id bigint NOT NULL,
    "companyId" bigint NOT NULL,
    "providerId" bigint,
    name character varying(255),
    config jsonb DEFAULT '{}'::jsonb,
    credentials jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "lastSyncAt" timestamp with time zone,
    "syncFrequency" character varying(50) DEFAULT 'manual'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    "errorMessage" text,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_connections_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_connections_id_seq OWNED BY public.integration_connections.id;


--
-- Name: integration_entity_mappings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_entity_mappings (
    id bigint NOT NULL,
    "connectionId" bigint,
    "companyId" bigint NOT NULL,
    "sourceEntity" character varying(100),
    "targetEntity" character varying(100),
    "fieldMappings" jsonb DEFAULT '{}'::jsonb,
    "isActive" boolean DEFAULT true,
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_entity_mappings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_entity_mappings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_entity_mappings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_entity_mappings_id_seq OWNED BY public.integration_entity_mappings.id;


--
-- Name: integration_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_providers (
    id bigint NOT NULL,
    name character varying(100),
    "displayName" character varying(255),
    description text,
    "providerType" character varying(50),
    "baseUrl" character varying(500),
    "authType" character varying(50) DEFAULT 'api_key'::character varying,
    status character varying(50) DEFAULT 'active'::character varying,
    capabilities jsonb DEFAULT '{}'::jsonb,
    "configSchema" jsonb DEFAULT '{}'::jsonb,
    icon character varying(500),
    "webhookUrl" character varying(500),
    "webhookSecret" character varying(255),
    "createdAt" timestamp with time zone DEFAULT now(),
    "updatedAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_providers_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_providers_id_seq OWNED BY public.integration_providers.id;


--
-- Name: integration_sync_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_sync_logs (
    id bigint NOT NULL,
    "connectionId" bigint,
    "companyId" bigint NOT NULL,
    direction character varying(20) DEFAULT 'inbound'::character varying,
    status character varying(50) DEFAULT 'pending'::character varying,
    "recordsProcessed" integer DEFAULT 0,
    "recordsFailed" integer DEFAULT 0,
    "errorDetails" jsonb DEFAULT '[]'::jsonb,
    "startedAt" timestamp with time zone DEFAULT now(),
    "completedAt" timestamp with time zone,
    duration integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_sync_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_sync_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_sync_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_sync_logs_id_seq OWNED BY public.integration_sync_logs.id;


--
-- Name: integration_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_webhook_events (
    id bigint NOT NULL,
    "providerId" bigint,
    "companyId" bigint,
    "eventType" character varying(100),
    payload jsonb DEFAULT '{}'::jsonb,
    status character varying(50) DEFAULT 'pending'::character varying,
    "processedAt" timestamp with time zone,
    "errorMessage" text,
    "retryCount" integer DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT now()
);


--
-- Name: integration_webhook_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_webhook_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_webhook_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_webhook_events_id_seq OWNED BY public.integration_webhook_events.id;


--
-- Name: meta_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_audit_logs (
    id bigint NOT NULL,
    "companyId" integer NOT NULL,
    "userId" integer,
    action character varying(60) NOT NULL,
    endpoint character varying(255),
    method character varying(10),
    "responseStatus" character varying(20),
    "responseTime" integer,
    "errorCode" character varying(30),
    "errorMessage" text,
    "cacheHit" boolean,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: meta_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.meta_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: meta_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.meta_audit_logs_id_seq OWNED BY public.meta_audit_logs.id;


--
-- Name: recommendation_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recommendation_runs (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    "runDate" date NOT NULL,
    kind character varying(40) NOT NULL,
    method character varying(60) NOT NULL,
    "targetType" character varying(30),
    "targetId" character varying(60),
    recommendation text NOT NULL,
    metrics jsonb,
    assumption text,
    "sufficientData" boolean DEFAULT true NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    outcome character varying(20),
    "appliedAt" timestamp without time zone,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: recommendation_runs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recommendation_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recommendation_runs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recommendation_runs_id_seq OWNED BY public.recommendation_runs.id;


--
-- Name: reminder_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_templates (
    id bigint NOT NULL,
    "companyId" bigint,
    name character varying(255) NOT NULL,
    channel character varying(50) NOT NULL,
    subject character varying(255),
    message text NOT NULL,
    timing integer DEFAULT 24 NOT NULL,
    "isActive" boolean DEFAULT true,
    "sentCount" integer DEFAULT 0,
    "deliveryRate" numeric(5,2) DEFAULT 0,
    "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    "messageConfirm" text,
    "messageReminder" text,
    "messageCreated" text
);


--
-- Name: reminder_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reminder_templates_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reminder_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reminder_templates_id_seq OWNED BY public.reminder_templates.id;


--
-- Name: sensitive_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sensitive_categories (
    id integer NOT NULL,
    "companyId" integer NOT NULL,
    key character varying(60) NOT NULL,
    label character varying(120) NOT NULL,
    description text,
    keywords jsonb,
    "requiresHuman" boolean DEFAULT true NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: sensitive_categories_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sensitive_categories_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sensitive_categories_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sensitive_categories_id_seq OWNED BY public.sensitive_categories.id;


--
-- Name: AIABTestVariants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIABTestVariants" ALTER COLUMN id SET DEFAULT nextval('public."AIABTestVariants_id_seq"'::regclass);


--
-- Name: AIABTests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIABTests" ALTER COLUMN id SET DEFAULT nextval('public."AIABTests_id_seq"'::regclass);


--
-- Name: AIAffiliatePrograms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms" ALTER COLUMN id SET DEFAULT nextval('public."AIAffiliatePrograms_id_seq"'::regclass);


--
-- Name: AIAffiliateReferrals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals" ALTER COLUMN id SET DEFAULT nextval('public."AIAffiliateReferrals_id_seq"'::regclass);


--
-- Name: AIAgentAssignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentAssignments" ALTER COLUMN id SET DEFAULT nextval('public."AIAgentAssignments_id_seq"'::regclass);


--
-- Name: AIAgentConfigs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentConfigs" ALTER COLUMN id SET DEFAULT nextval('public."AIAgentConfigs_id_seq"'::regclass);


--
-- Name: AIAgentLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentLogs" ALTER COLUMN id SET DEFAULT nextval('public."AIAgentLogs_id_seq"'::regclass);


--
-- Name: AIChatbotConfigs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotConfigs" ALTER COLUMN id SET DEFAULT nextval('public."AIChatbotConfigs_id_seq"'::regclass);


--
-- Name: AIChatbotDataSources id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDataSources" ALTER COLUMN id SET DEFAULT nextval('public."AIChatbotDataSources_id_seq"'::regclass);


--
-- Name: AIChatbotDomains id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains" ALTER COLUMN id SET DEFAULT nextval('public."AIChatbotDomains_id_seq"'::regclass);


--
-- Name: AIChunks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChunks" ALTER COLUMN id SET DEFAULT nextval('public."AIChunks_id_seq"'::regclass);


--
-- Name: AICompanyExtensions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICompanyExtensions" ALTER COLUMN id SET DEFAULT nextval('public."AICompanyExtensions_id_seq"'::regclass);


--
-- Name: AICreditBalances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditBalances" ALTER COLUMN id SET DEFAULT nextval('public."AICreditBalances_id_seq"'::regclass);


--
-- Name: AICreditTransactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTransactions" ALTER COLUMN id SET DEFAULT nextval('public."AICreditTransactions_id_seq"'::regclass);


--
-- Name: AICreditTypes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTypes" ALTER COLUMN id SET DEFAULT nextval('public."AICreditTypes_id_seq"'::regclass);


--
-- Name: AIDocuments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIDocuments" ALTER COLUMN id SET DEFAULT nextval('public."AIDocuments_id_seq"'::regclass);


--
-- Name: AIEmailTemplates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEmailTemplates" ALTER COLUMN id SET DEFAULT nextval('public."AIEmailTemplates_id_seq"'::regclass);


--
-- Name: AIEntities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEntities" ALTER COLUMN id SET DEFAULT nextval('public."AIEntities_id_seq"'::regclass);


--
-- Name: AIExtensions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIExtensions" ALTER COLUMN id SET DEFAULT nextval('public."AIExtensions_id_seq"'::regclass);


--
-- Name: AIFineTuningJobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIFineTuningJobs" ALTER COLUMN id SET DEFAULT nextval('public."AIFineTuningJobs_id_seq"'::regclass);


--
-- Name: AIHistoricalQA id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIHistoricalQA" ALTER COLUMN id SET DEFAULT nextval('public."AIHistoricalQA_id_seq"'::regclass);


--
-- Name: AIImageCreditTransactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageCreditTransactions" ALTER COLUMN id SET DEFAULT nextval('public."AIImageCreditTransactions_id_seq"'::regclass);


--
-- Name: AIImageGenerationItems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerationItems" ALTER COLUMN id SET DEFAULT nextval('public."AIImageGenerationItems_id_seq"'::regclass);


--
-- Name: AIImageGenerations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerations" ALTER COLUMN id SET DEFAULT nextval('public."AIImageGenerations_id_seq"'::regclass);


--
-- Name: AIPromptTemplates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIPromptTemplates" ALTER COLUMN id SET DEFAULT nextval('public."AIPromptTemplates_id_seq"'::regclass);


--
-- Name: AIProviderConfigs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIProviderConfigs" ALTER COLUMN id SET DEFAULT nextval('public."AIProviderConfigs_id_seq"'::regclass);


--
-- Name: AIScheduledTasks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIScheduledTasks" ALTER COLUMN id SET DEFAULT nextval('public."AIScheduledTasks_id_seq"'::regclass);


--
-- Name: AISemanticCache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISemanticCache" ALTER COLUMN id SET DEFAULT nextval('public."AISemanticCache_id_seq"'::regclass);


--
-- Name: AISpans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISpans" ALTER COLUMN id SET DEFAULT nextval('public."AISpans_id_seq"'::regclass);


--
-- Name: AISubplans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISubplans" ALTER COLUMN id SET DEFAULT nextval('public."AISubplans_id_seq"'::regclass);


--
-- Name: AISupportCorrections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISupportCorrections" ALTER COLUMN id SET DEFAULT nextval('public."AISupportCorrections_id_seq"'::regclass);


--
-- Name: AITeamMembers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeamMembers" ALTER COLUMN id SET DEFAULT nextval('public."AITeamMembers_id_seq"'::regclass);


--
-- Name: AITeams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeams" ALTER COLUMN id SET DEFAULT nextval('public."AITeams_id_seq"'::regclass);


--
-- Name: AITraces id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITraces" ALTER COLUMN id SET DEFAULT nextval('public."AITraces_id_seq"'::regclass);


--
-- Name: AIUsageLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs" ALTER COLUMN id SET DEFAULT nextval('public."AIUsageLogs_id_seq"'::regclass);


--
-- Name: AIUsageMetrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageMetrics" ALTER COLUMN id SET DEFAULT nextval('public."AIUsageMetrics_id_seq"'::regclass);


--
-- Name: AIVideoCreditTransactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoCreditTransactions" ALTER COLUMN id SET DEFAULT nextval('public."AIVideoCreditTransactions_id_seq"'::regclass);


--
-- Name: AIVideoGenerationItems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoGenerationItems" ALTER COLUMN id SET DEFAULT nextval('public."AIVideoGenerationItems_id_seq"'::regclass);


--
-- Name: AIVideoGenerations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoGenerations" ALTER COLUMN id SET DEFAULT nextval('public."AIVideoGenerations_id_seq"'::regclass);


--
-- Name: AffiliateLinks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateLinks" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateLinks_id_seq"'::regclass);


--
-- Name: AffiliateTiers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTiers" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateTiers_id_seq"'::regclass);


--
-- Name: AffiliateTransactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTransactions" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateTransactions_id_seq"'::regclass);


--
-- Name: AffiliateWallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWallets" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateWallets_id_seq"'::regclass);


--
-- Name: AffiliateWithdrawals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals" ALTER COLUMN id SET DEFAULT nextval('public."AffiliateWithdrawals_id_seq"'::regclass);


--
-- Name: AgentDevices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentDevices" ALTER COLUMN id SET DEFAULT nextval('public."AgentDevices_id_seq"'::regclass);


--
-- Name: AgentIdentities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentIdentities" ALTER COLUMN id SET DEFAULT nextval('public."AgentIdentities_id_seq"'::regclass);


--
-- Name: AgentInteractions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentInteractions" ALTER COLUMN id SET DEFAULT nextval('public."AgentInteractions_id_seq"'::regclass);


--
-- Name: AgentMemories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentMemories" ALTER COLUMN id SET DEFAULT nextval('public."AgentMemories_id_seq"'::regclass);


--
-- Name: AgentProfilePhotos id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentProfilePhotos" ALTER COLUMN id SET DEFAULT nextval('public."AgentProfilePhotos_id_seq"'::regclass);


--
-- Name: AiTokenPlans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenPlans" ALTER COLUMN id SET DEFAULT nextval('public."AiTokenPlans_id_seq"'::regclass);


--
-- Name: AiTokenTransactions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenTransactions" ALTER COLUMN id SET DEFAULT nextval('public."AiTokenTransactions_id_seq"'::regclass);


--
-- Name: Announcements id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcements" ALTER COLUMN id SET DEFAULT nextval('public."Announcements_id_seq"'::regclass);


--
-- Name: ApiFailedMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiFailedMessages" ALTER COLUMN id SET DEFAULT nextval('public."ApiFailedMessages_id_seq"'::regclass);


--
-- Name: ApiUsages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiUsages" ALTER COLUMN id SET DEFAULT nextval('public."ApiUsages_id_seq"'::regclass);


--
-- Name: ApplePurchases id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApplePurchases" ALTER COLUMN id SET DEFAULT nextval('public."ApplePurchases_id_seq"'::regclass);


--
-- Name: AttributionChannelAggregates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionChannelAggregates" ALTER COLUMN id SET DEFAULT nextval('public."AttributionChannelAggregates_id_seq"'::regclass);


--
-- Name: AttributionConversions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionConversions" ALTER COLUMN id SET DEFAULT nextval('public."AttributionConversions_id_seq"'::regclass);


--
-- Name: AttributionResults id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionResults" ALTER COLUMN id SET DEFAULT nextval('public."AttributionResults_id_seq"'::regclass);


--
-- Name: AttributionTouchpoints id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionTouchpoints" ALTER COLUMN id SET DEFAULT nextval('public."AttributionTouchpoints_id_seq"'::regclass);


--
-- Name: AutomationRules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationRules" ALTER COLUMN id SET DEFAULT nextval('public."AutomationRules_id_seq"'::regclass);


--
-- Name: Baileys id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Baileys" ALTER COLUMN id SET DEFAULT nextval('public."Baileys_id_seq"'::regclass);


--
-- Name: CampaignAlerts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignAlerts" ALTER COLUMN id SET DEFAULT nextval('public."CampaignAlerts_id_seq"'::regclass);


--
-- Name: CampaignMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages" ALTER COLUMN id SET DEFAULT nextval('public."CampaignMessages_id_seq"'::regclass);


--
-- Name: CampaignRecommendations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRecommendations" ALTER COLUMN id SET DEFAULT nextval('public."CampaignRecommendations_id_seq"'::regclass);


--
-- Name: CampaignRuleLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRuleLogs" ALTER COLUMN id SET DEFAULT nextval('public."CampaignRuleLogs_id_seq"'::regclass);


--
-- Name: CampaignRules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRules" ALTER COLUMN id SET DEFAULT nextval('public."CampaignRules_id_seq"'::regclass);


--
-- Name: CampaignSettings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignSettings" ALTER COLUMN id SET DEFAULT nextval('public."CampaignSettings_id_seq"'::regclass);


--
-- Name: CampaignShipping id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShipping" ALTER COLUMN id SET DEFAULT nextval('public."CampaignShipping_id_seq"'::regclass);


--
-- Name: CampaignShippings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings" ALTER COLUMN id SET DEFAULT nextval('public."CampaignShippings_id_seq"'::regclass);


--
-- Name: Campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns" ALTER COLUMN id SET DEFAULT nextval('public."Campaigns_id_seq"'::regclass);


--
-- Name: ChatMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessages" ALTER COLUMN id SET DEFAULT nextval('public."ChatMessages_id_seq"'::regclass);


--
-- Name: ChatUsers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatUsers" ALTER COLUMN id SET DEFAULT nextval('public."ChatUsers_id_seq"'::regclass);


--
-- Name: Chatbots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbots" ALTER COLUMN id SET DEFAULT nextval('public."Chatbots_id_seq"'::regclass);


--
-- Name: Chats id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chats" ALTER COLUMN id SET DEFAULT nextval('public."Chats_id_seq"'::regclass);


--
-- Name: CommentAutoReplyCampaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyCampaigns" ALTER COLUMN id SET DEFAULT nextval('public."CommentAutoReplyCampaigns_id_seq"'::regclass);


--
-- Name: CommentAutoReplyLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyLogs" ALTER COLUMN id SET DEFAULT nextval('public."CommentAutoReplyLogs_id_seq"'::regclass);


--
-- Name: CommentResponseSettings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings" ALTER COLUMN id SET DEFAULT nextval('public."CommentResponseSettings_id_seq"'::regclass);


--
-- Name: Companies id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Companies" ALTER COLUMN id SET DEFAULT nextval('public."Companies_id_seq"'::regclass);


--
-- Name: CompaniesSettings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompaniesSettings" ALTER COLUMN id SET DEFAULT nextval('public."CompaniesSettings_id_seq"'::regclass);


--
-- Name: CompanyBillings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyBillings" ALTER COLUMN id SET DEFAULT nextval('public."CompanyBillings_id_seq"'::regclass);


--
-- Name: CompanyEmailPlans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyEmailPlans" ALTER COLUMN id SET DEFAULT nextval('public."CompanyEmailPlans_id_seq"'::regclass);


--
-- Name: CompanyMetaConversionSettings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyMetaConversionSettings" ALTER COLUMN id SET DEFAULT nextval('public."CompanyMetaConversionSettings_id_seq"'::regclass);


--
-- Name: CompanyTokenUsages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyTokenUsages" ALTER COLUMN id SET DEFAULT nextval('public."CompanyTokenUsages_id_seq"'::regclass);


--
-- Name: CompanyUserQueues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUserQueues" ALTER COLUMN id SET DEFAULT nextval('public."CompanyUserQueues_id_seq"'::regclass);


--
-- Name: CompanyUsers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers" ALTER COLUMN id SET DEFAULT nextval('public."CompanyUsers_id_seq"'::regclass);


--
-- Name: ContactBindings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings" ALTER COLUMN id SET DEFAULT nextval('public."ContactBindings_id_seq"'::regclass);


--
-- Name: ContactCustomFields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields" ALTER COLUMN id SET DEFAULT nextval('public."ContactCustomFields_id_seq"'::regclass);


--
-- Name: ContactListItems id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems" ALTER COLUMN id SET DEFAULT nextval('public."ContactListItems_id_seq"'::regclass);


--
-- Name: ContactLists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactLists" ALTER COLUMN id SET DEFAULT nextval('public."ContactLists_id_seq"'::regclass);


--
-- Name: ContactTags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags" ALTER COLUMN id SET DEFAULT nextval('public."ContactTags_id_seq"'::regclass);


--
-- Name: ContactTemperatures id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTemperatures" ALTER COLUMN id SET DEFAULT nextval('public."ContactTemperatures_id_seq"'::regclass);


--
-- Name: ContactWallets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactWallets" ALTER COLUMN id SET DEFAULT nextval('public."ContactWallets_id_seq"'::regclass);


--
-- Name: Contacts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts" ALTER COLUMN id SET DEFAULT nextval('public."Contacts_id_seq"'::regclass);


--
-- Name: CustomerOrigins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerOrigins" ALTER COLUMN id SET DEFAULT nextval('public."CustomerOrigins_id_seq"'::regclass);


--
-- Name: DialogChatBots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DialogChatBots" ALTER COLUMN id SET DEFAULT nextval('public."DialogChatBots_id_seq"'::regclass);


--
-- Name: EmailPlans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailPlans" ALTER COLUMN id SET DEFAULT nextval('public."EmailPlans_id_seq"'::regclass);


--
-- Name: FacebookConversionEvents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents" ALTER COLUMN id SET DEFAULT nextval('public."FacebookConversionEvents_id_seq"'::regclass);


--
-- Name: FacebookDatasets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookDatasets" ALTER COLUMN id SET DEFAULT nextval('public."FacebookDatasets_id_seq"'::regclass);


--
-- Name: Files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Files" ALTER COLUMN id SET DEFAULT nextval('public."Files_id_seq"'::regclass);


--
-- Name: FilesOptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FilesOptions" ALTER COLUMN id SET DEFAULT nextval('public."FilesOptions_id_seq"'::regclass);


--
-- Name: FlowAudios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowAudios" ALTER COLUMN id SET DEFAULT nextval('public."FlowAudios_id_seq"'::regclass);


--
-- Name: FlowBuilders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowBuilders" ALTER COLUMN id SET DEFAULT nextval('public."FlowBuilders_id_seq"'::regclass);


--
-- Name: FlowCampaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowCampaigns" ALTER COLUMN id SET DEFAULT nextval('public."FlowCampaigns_id_seq"'::regclass);


--
-- Name: FlowDefaults id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowDefaults" ALTER COLUMN id SET DEFAULT nextval('public."FlowDefaults_id_seq"'::regclass);


--
-- Name: FlowImgs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowImgs" ALTER COLUMN id SET DEFAULT nextval('public."FlowImgs_id_seq"'::regclass);


--
-- Name: Helps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Helps" ALTER COLUMN id SET DEFAULT nextval('public."Helps_id_seq"'::regclass);


--
-- Name: InboundEventLedger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InboundEventLedger" ALTER COLUMN id SET DEFAULT nextval('public."InboundEventLedger_id_seq"'::regclass);


--
-- Name: InsightsDaily id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightsDaily" ALTER COLUMN id SET DEFAULT nextval('public."InsightsDaily_id_seq"'::regclass);


--
-- Name: Invoices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoices" ALTER COLUMN id SET DEFAULT nextval('public."Invoices_id_seq"'::regclass);


--
-- Name: KanbanLeadConversionEvents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents" ALTER COLUMN id SET DEFAULT nextval('public."KanbanLeadConversionEvents_id_seq"'::regclass);


--
-- Name: KanbanMovementLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs" ALTER COLUMN id SET DEFAULT nextval('public."KanbanMovementLogs_id_seq"'::regclass);


--
-- Name: LogTickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LogTickets" ALTER COLUMN id SET DEFAULT nextval('public."LogTickets_id_seq"'::regclass);


--
-- Name: Messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages" ALTER COLUMN id SET DEFAULT nextval('public."Messages_id_seq"'::regclass);


--
-- Name: MetaAgentActionLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentActionLogs" ALTER COLUMN id SET DEFAULT nextval('public."MetaAgentActionLogs_id_seq"'::regclass);


--
-- Name: MetaAgentPlans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentPlans" ALTER COLUMN id SET DEFAULT nextval('public."MetaAgentPlans_id_seq"'::regclass);


--
-- Name: MetaMarketingAuditLogs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaMarketingAuditLogs" ALTER COLUMN id SET DEFAULT nextval('public."MetaMarketingAuditLogs_id_seq"'::regclass);


--
-- Name: MetaOfficialMcpConnections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaOfficialMcpConnections" ALTER COLUMN id SET DEFAULT nextval('public."MetaOfficialMcpConnections_id_seq"'::regclass);


--
-- Name: Notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notifications" ALTER COLUMN id SET DEFAULT nextval('public."Notifications_id_seq"'::regclass);


--
-- Name: Partners id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Partners" ALTER COLUMN id SET DEFAULT nextval('public."Partners_id_seq"'::regclass);


--
-- Name: PlanCreditAllocations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanCreditAllocations" ALTER COLUMN id SET DEFAULT nextval('public."PlanCreditAllocations_id_seq"'::regclass);


--
-- Name: Plans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plans" ALTER COLUMN id SET DEFAULT nextval('public."Plans_id_seq"'::regclass);


--
-- Name: PromptQueues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptQueues" ALTER COLUMN id SET DEFAULT nextval('public."PromptQueues_id_seq"'::regclass);


--
-- Name: Prompts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prompts" ALTER COLUMN id SET DEFAULT nextval('public."Prompts_id_seq"'::regclass);


--
-- Name: QueueIntegrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueIntegrations" ALTER COLUMN id SET DEFAULT nextval('public."QueueIntegrations_id_seq"'::regclass);


--
-- Name: QueueOptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueOptions" ALTER COLUMN id SET DEFAULT nextval('public."QueueOptions_id_seq"'::regclass);


--
-- Name: Queues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues" ALTER COLUMN id SET DEFAULT nextval('public."Queues_id_seq"'::regclass);


--
-- Name: QuickMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickMessages" ALTER COLUMN id SET DEFAULT nextval('public."QuickMessages_id_seq"'::regclass);


--
-- Name: Receipts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts" ALTER COLUMN id SET DEFAULT nextval('public."Receipts_id_seq"'::regclass);


--
-- Name: Roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Roles" ALTER COLUMN id SET DEFAULT nextval('public."Roles_id_seq"'::regclass);


--
-- Name: ScheduledMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessages" ALTER COLUMN id SET DEFAULT nextval('public."ScheduledMessages_id_seq"'::regclass);


--
-- Name: ScheduledMessagesEnvios id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessagesEnvios" ALTER COLUMN id SET DEFAULT nextval('public."ScheduledMessagesEnvios_id_seq"'::regclass);


--
-- Name: Schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules" ALTER COLUMN id SET DEFAULT nextval('public."Schedules_id_seq"'::regclass);


--
-- Name: Sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessions" ALTER COLUMN id SET DEFAULT nextval('public."Sessions_id_seq"'::regclass);


--
-- Name: Settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings" ALTER COLUMN id SET DEFAULT nextval('public."Settings_new_id_seq1"'::regclass);


--
-- Name: Subscriptions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subscriptions" ALTER COLUMN id SET DEFAULT nextval('public."Subscriptions_id_seq"'::regclass);


--
-- Name: Tags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags" ALTER COLUMN id SET DEFAULT nextval('public."Tags_id_seq"'::regclass);


--
-- Name: TelegramQueues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelegramQueues" ALTER COLUMN id SET DEFAULT nextval('public."TelegramQueues_id_seq"'::regclass);


--
-- Name: Telegrams id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams" ALTER COLUMN id SET DEFAULT nextval('public."Telegrams_id_seq"'::regclass);


--
-- Name: TicketNotes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketNotes" ALTER COLUMN id SET DEFAULT nextval('public."TicketNotes_id_seq"'::regclass);


--
-- Name: TicketTags id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags" ALTER COLUMN id SET DEFAULT nextval('public."TicketTags_id_seq"'::regclass);


--
-- Name: TicketTrakings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings" ALTER COLUMN id SET DEFAULT nextval('public."TicketTrakings_id_seq"'::regclass);


--
-- Name: Tickets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets" ALTER COLUMN id SET DEFAULT nextval('public."Tickets_id_seq"'::regclass);


--
-- Name: UGCCampaignMetrics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaignMetrics" ALTER COLUMN id SET DEFAULT nextval('public."UGCCampaignMetrics_id_seq"'::regclass);


--
-- Name: UGCCampaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaigns" ALTER COLUMN id SET DEFAULT nextval('public."UGCCampaigns_id_seq"'::regclass);


--
-- Name: UGCCreativeLearnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeLearnings" ALTER COLUMN id SET DEFAULT nextval('public."UGCCreativeLearnings_id_seq"'::regclass);


--
-- Name: UGCCreativeVariants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeVariants" ALTER COLUMN id SET DEFAULT nextval('public."UGCCreativeVariants_id_seq"'::regclass);


--
-- Name: UGCCreatorAssignments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorAssignments" ALTER COLUMN id SET DEFAULT nextval('public."UGCCreatorAssignments_id_seq"'::regclass);


--
-- Name: UGCCreatorPayments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorPayments" ALTER COLUMN id SET DEFAULT nextval('public."UGCCreatorPayments_id_seq"'::regclass);


--
-- Name: UGCCreators id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreators" ALTER COLUMN id SET DEFAULT nextval('public."UGCCreators_id_seq"'::regclass);


--
-- Name: UGCPostComments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments" ALTER COLUMN id SET DEFAULT nextval('public."UGCPostComments_id_seq"'::regclass);


--
-- Name: UGCSocialAccounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialAccounts" ALTER COLUMN id SET DEFAULT nextval('public."UGCSocialAccounts_id_seq"'::regclass);


--
-- Name: UGCSocialPosts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts" ALTER COLUMN id SET DEFAULT nextval('public."UGCSocialPosts_id_seq"'::regclass);


--
-- Name: UGCVideoAssets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoAssets" ALTER COLUMN id SET DEFAULT nextval('public."UGCVideoAssets_id_seq"'::regclass);


--
-- Name: UGCVideoJobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoJobs" ALTER COLUMN id SET DEFAULT nextval('public."UGCVideoJobs_id_seq"'::regclass);


--
-- Name: UserQueues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues" ALTER COLUMN id SET DEFAULT nextval('public."UserQueues_id_seq"'::regclass);


--
-- Name: UserRatings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRatings" ALTER COLUMN id SET DEFAULT nextval('public."UserRatings_id_seq"'::regclass);


--
-- Name: UserTermsAcceptances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserTermsAcceptances" ALTER COLUMN id SET DEFAULT nextval('public."UserTermsAcceptances_id_seq"'::regclass);


--
-- Name: Users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users" ALTER COLUMN id SET DEFAULT nextval('public."Users_id_seq"'::regclass);


--
-- Name: Versions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Versions" ALTER COLUMN id SET DEFAULT nextval('public."Versions_id_seq"'::regclass);


--
-- Name: WebChatConversationMessages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversationMessages" ALTER COLUMN id SET DEFAULT nextval('public."WebChatConversationMessages_id_seq"'::regclass);


--
-- Name: WebChatConversations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversations" ALTER COLUMN id SET DEFAULT nextval('public."WebChatConversations_id_seq"'::regclass);


--
-- Name: WebChatWidgets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets" ALTER COLUMN id SET DEFAULT nextval('public."WebChatWidgets_id_seq"'::regclass);


--
-- Name: Webhooks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhooks" ALTER COLUMN id SET DEFAULT nextval('public."Webhooks_id_seq"'::regclass);


--
-- Name: WhatsAppTemplates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsAppTemplates" ALTER COLUMN id SET DEFAULT nextval('public."WhatsAppTemplates_id_seq"'::regclass);


--
-- Name: WhatsappQueues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues" ALTER COLUMN id SET DEFAULT nextval('public."WhatsappQueues_id_seq"'::regclass);


--
-- Name: Whatsapps id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps" ALTER COLUMN id SET DEFAULT nextval('public."Whatsapps_id_seq"'::regclass);


--
-- Name: appointment_ai_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions ALTER COLUMN id SET DEFAULT nextval('public.appointment_ai_suggestions_id_seq'::regclass);


--
-- Name: appointment_analytics id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_analytics ALTER COLUMN id SET DEFAULT nextval('public.appointment_analytics_id_seq'::regclass);


--
-- Name: appointment_availability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_availability ALTER COLUMN id SET DEFAULT nextval('public.appointment_availability_id_seq'::regclass);


--
-- Name: appointment_blocks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_blocks ALTER COLUMN id SET DEFAULT nextval('public.appointment_blocks_id_seq'::regclass);


--
-- Name: appointment_calendar_sync id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_sync ALTER COLUMN id SET DEFAULT nextval('public.appointment_calendar_sync_id_seq'::regclass);


--
-- Name: appointment_calendar_syncs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_syncs ALTER COLUMN id SET DEFAULT nextval('public.appointment_calendar_syncs_id_seq'::regclass);


--
-- Name: appointment_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_reminders ALTER COLUMN id SET DEFAULT nextval('public.appointment_reminders_id_seq'::regclass);


--
-- Name: appointment_services id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services ALTER COLUMN id SET DEFAULT nextval('public.appointment_services_id_seq'::regclass);


--
-- Name: appointments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments ALTER COLUMN id SET DEFAULT nextval('public.appointments_id_seq'::regclass);


--
-- Name: campaign_approvals id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approvals ALTER COLUMN id SET DEFAULT nextval('public.campaign_approvals_id_seq'::regclass);


--
-- Name: comment_moderation_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_moderation_audits ALTER COLUMN id SET DEFAULT nextval('public.comment_moderation_audits_id_seq'::regclass);


--
-- Name: email_ab_tests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_ab_tests ALTER COLUMN id SET DEFAULT nextval('public.email_ab_tests_id_seq'::regclass);


--
-- Name: email_automations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations ALTER COLUMN id SET DEFAULT nextval('public.email_automations_id_seq'::regclass);


--
-- Name: email_campaign_recipients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients ALTER COLUMN id SET DEFAULT nextval('public.email_campaign_recipients_id_seq'::regclass);


--
-- Name: email_campaigns id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns ALTER COLUMN id SET DEFAULT nextval('public.email_campaigns_id_seq'::regclass);


--
-- Name: email_provider_configs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_provider_configs ALTER COLUMN id SET DEFAULT nextval('public.email_provider_configs_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: email_tracking_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tracking_events ALTER COLUMN id SET DEFAULT nextval('public.email_tracking_events_id_seq'::regclass);


--
-- Name: impersonation_audits id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_audits ALTER COLUMN id SET DEFAULT nextval('public.impersonation_audits_id_seq'::regclass);


--
-- Name: integration_api_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_api_requests ALTER COLUMN id SET DEFAULT nextval('public.integration_api_requests_id_seq'::regclass);


--
-- Name: integration_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections ALTER COLUMN id SET DEFAULT nextval('public.integration_connections_id_seq'::regclass);


--
-- Name: integration_entity_mappings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_entity_mappings ALTER COLUMN id SET DEFAULT nextval('public.integration_entity_mappings_id_seq'::regclass);


--
-- Name: integration_providers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_providers ALTER COLUMN id SET DEFAULT nextval('public.integration_providers_id_seq'::regclass);


--
-- Name: integration_sync_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs ALTER COLUMN id SET DEFAULT nextval('public.integration_sync_logs_id_seq'::regclass);


--
-- Name: integration_webhook_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_events ALTER COLUMN id SET DEFAULT nextval('public.integration_webhook_events_id_seq'::regclass);


--
-- Name: meta_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.meta_audit_logs_id_seq'::regclass);


--
-- Name: recommendation_runs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_runs ALTER COLUMN id SET DEFAULT nextval('public.recommendation_runs_id_seq'::regclass);


--
-- Name: reminder_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates ALTER COLUMN id SET DEFAULT nextval('public.reminder_templates_id_seq'::regclass);


--
-- Name: sensitive_categories id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensitive_categories ALTER COLUMN id SET DEFAULT nextval('public.sensitive_categories_id_seq'::regclass);


--
-- Name: AIABTestVariants AIABTestVariants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIABTestVariants"
    ADD CONSTRAINT "AIABTestVariants_pkey" PRIMARY KEY (id);


--
-- Name: AIABTests AIABTests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIABTests"
    ADD CONSTRAINT "AIABTests_pkey" PRIMARY KEY (id);


--
-- Name: AIAffiliatePrograms AIAffiliatePrograms_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms"
    ADD CONSTRAINT "AIAffiliatePrograms_companyId_key" UNIQUE ("companyId");


--
-- Name: AIAffiliatePrograms AIAffiliatePrograms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms"
    ADD CONSTRAINT "AIAffiliatePrograms_pkey" PRIMARY KEY (id);


--
-- Name: AIAffiliatePrograms AIAffiliatePrograms_referralCode_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms"
    ADD CONSTRAINT "AIAffiliatePrograms_referralCode_key" UNIQUE ("referralCode");


--
-- Name: AIAffiliateReferrals AIAffiliateReferrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals"
    ADD CONSTRAINT "AIAffiliateReferrals_pkey" PRIMARY KEY (id);


--
-- Name: AIAgentAssignments AIAgentAssignments_companyId_agentConfigId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentAssignments"
    ADD CONSTRAINT "AIAgentAssignments_companyId_agentConfigId_key" UNIQUE ("companyId", "agentConfigId");


--
-- Name: AIAgentAssignments AIAgentAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentAssignments"
    ADD CONSTRAINT "AIAgentAssignments_pkey" PRIMARY KEY (id);


--
-- Name: AIAgentConfigs AIAgentConfigs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentConfigs"
    ADD CONSTRAINT "AIAgentConfigs_pkey" PRIMARY KEY (id);


--
-- Name: AIAgentLogs AIAgentLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentLogs"
    ADD CONSTRAINT "AIAgentLogs_pkey" PRIMARY KEY (id);


--
-- Name: AIChatbotConfigs AIChatbotConfigs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotConfigs"
    ADD CONSTRAINT "AIChatbotConfigs_pkey" PRIMARY KEY (id);


--
-- Name: AIChatbotDataSources AIChatbotDataSources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDataSources"
    ADD CONSTRAINT "AIChatbotDataSources_pkey" PRIMARY KEY (id);


--
-- Name: AIChatbotDomains AIChatbotDomains_appKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains"
    ADD CONSTRAINT "AIChatbotDomains_appKey_key" UNIQUE ("appKey");


--
-- Name: AIChatbotDomains AIChatbotDomains_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains"
    ADD CONSTRAINT "AIChatbotDomains_domain_key" UNIQUE (domain);


--
-- Name: AIChatbotDomains AIChatbotDomains_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains"
    ADD CONSTRAINT "AIChatbotDomains_pkey" PRIMARY KEY (id);


--
-- Name: AIChatbotDomains AIChatbotDomains_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains"
    ADD CONSTRAINT "AIChatbotDomains_uuid_key" UNIQUE (uuid);


--
-- Name: AIChunks AIChunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChunks"
    ADD CONSTRAINT "AIChunks_pkey" PRIMARY KEY (id);


--
-- Name: AICompanyExtensions AICompanyExtensions_companyId_extensionId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICompanyExtensions"
    ADD CONSTRAINT "AICompanyExtensions_companyId_extensionId_key" UNIQUE ("companyId", "extensionId");


--
-- Name: AICompanyExtensions AICompanyExtensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICompanyExtensions"
    ADD CONSTRAINT "AICompanyExtensions_pkey" PRIMARY KEY (id);


--
-- Name: AICreditBalances AICreditBalances_companyId_creditTypeId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditBalances"
    ADD CONSTRAINT "AICreditBalances_companyId_creditTypeId_key" UNIQUE ("companyId", "creditTypeId");


--
-- Name: AICreditBalances AICreditBalances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditBalances"
    ADD CONSTRAINT "AICreditBalances_pkey" PRIMARY KEY (id);


--
-- Name: AICreditTransactions AICreditTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTransactions"
    ADD CONSTRAINT "AICreditTransactions_pkey" PRIMARY KEY (id);


--
-- Name: AICreditTypes AICreditTypes_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTypes"
    ADD CONSTRAINT "AICreditTypes_key_key" UNIQUE (key);


--
-- Name: AICreditTypes AICreditTypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTypes"
    ADD CONSTRAINT "AICreditTypes_pkey" PRIMARY KEY (id);


--
-- Name: AIDocuments AIDocuments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIDocuments"
    ADD CONSTRAINT "AIDocuments_pkey" PRIMARY KEY (id);


--
-- Name: AIEmailTemplates AIEmailTemplates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEmailTemplates"
    ADD CONSTRAINT "AIEmailTemplates_pkey" PRIMARY KEY (id);


--
-- Name: AIEntities AIEntities_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEntities"
    ADD CONSTRAINT "AIEntities_key_key" UNIQUE (key);


--
-- Name: AIEntities AIEntities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEntities"
    ADD CONSTRAINT "AIEntities_pkey" PRIMARY KEY (id);


--
-- Name: AIExtensions AIExtensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIExtensions"
    ADD CONSTRAINT "AIExtensions_pkey" PRIMARY KEY (id);


--
-- Name: AIExtensions AIExtensions_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIExtensions"
    ADD CONSTRAINT "AIExtensions_slug_key" UNIQUE (slug);


--
-- Name: AIFineTuningJobs AIFineTuningJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIFineTuningJobs"
    ADD CONSTRAINT "AIFineTuningJobs_pkey" PRIMARY KEY (id);


--
-- Name: AIHistoricalQA AIHistoricalQA_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIHistoricalQA"
    ADD CONSTRAINT "AIHistoricalQA_pkey" PRIMARY KEY (id);


--
-- Name: AIImageCreditTransactions AIImageCreditTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageCreditTransactions"
    ADD CONSTRAINT "AIImageCreditTransactions_pkey" PRIMARY KEY (id);


--
-- Name: AIImageGenerationItems AIImageGenerationItems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerationItems"
    ADD CONSTRAINT "AIImageGenerationItems_pkey" PRIMARY KEY (id);


--
-- Name: AIImageGenerations AIImageGenerations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerations"
    ADD CONSTRAINT "AIImageGenerations_pkey" PRIMARY KEY (id);


--
-- Name: AIPromptTemplates AIPromptTemplates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIPromptTemplates"
    ADD CONSTRAINT "AIPromptTemplates_pkey" PRIMARY KEY (id);


--
-- Name: AIProviderConfigs AIProviderConfigs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIProviderConfigs"
    ADD CONSTRAINT "AIProviderConfigs_pkey" PRIMARY KEY (id);


--
-- Name: AIScheduledTasks AIScheduledTasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIScheduledTasks"
    ADD CONSTRAINT "AIScheduledTasks_pkey" PRIMARY KEY (id);


--
-- Name: AISemanticCache AISemanticCache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISemanticCache"
    ADD CONSTRAINT "AISemanticCache_pkey" PRIMARY KEY (id);


--
-- Name: AISpans AISpans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISpans"
    ADD CONSTRAINT "AISpans_pkey" PRIMARY KEY (id);


--
-- Name: AISubplans AISubplans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISubplans"
    ADD CONSTRAINT "AISubplans_pkey" PRIMARY KEY (id);


--
-- Name: AISupportCorrections AISupportCorrections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISupportCorrections"
    ADD CONSTRAINT "AISupportCorrections_pkey" PRIMARY KEY (id);


--
-- Name: AITeamMembers AITeamMembers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeamMembers"
    ADD CONSTRAINT "AITeamMembers_pkey" PRIMARY KEY (id);


--
-- Name: AITeamMembers AITeamMembers_teamId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeamMembers"
    ADD CONSTRAINT "AITeamMembers_teamId_userId_key" UNIQUE ("teamId", "userId");


--
-- Name: AITeams AITeams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeams"
    ADD CONSTRAINT "AITeams_pkey" PRIMARY KEY (id);


--
-- Name: AITraces AITraces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITraces"
    ADD CONSTRAINT "AITraces_pkey" PRIMARY KEY (id);


--
-- Name: AIUsageLogs AIUsageLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs"
    ADD CONSTRAINT "AIUsageLogs_pkey" PRIMARY KEY (id);


--
-- Name: AIUsageMetrics AIUsageMetrics_companyId_date_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageMetrics"
    ADD CONSTRAINT "AIUsageMetrics_companyId_date_period_key" UNIQUE ("companyId", date, period);


--
-- Name: AIUsageMetrics AIUsageMetrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageMetrics"
    ADD CONSTRAINT "AIUsageMetrics_pkey" PRIMARY KEY (id);


--
-- Name: AIVideoCreditTransactions AIVideoCreditTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoCreditTransactions"
    ADD CONSTRAINT "AIVideoCreditTransactions_pkey" PRIMARY KEY (id);


--
-- Name: AIVideoGenerationItems AIVideoGenerationItems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoGenerationItems"
    ADD CONSTRAINT "AIVideoGenerationItems_pkey" PRIMARY KEY (id);


--
-- Name: AIVideoGenerations AIVideoGenerations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoGenerations"
    ADD CONSTRAINT "AIVideoGenerations_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateLinks AffiliateLinks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateLinks"
    ADD CONSTRAINT "AffiliateLinks_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateLinks AffiliateLinks_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateLinks"
    ADD CONSTRAINT "AffiliateLinks_slug_key" UNIQUE (slug);


--
-- Name: AffiliateTiers AffiliateTiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTiers"
    ADD CONSTRAINT "AffiliateTiers_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateTransactions AffiliateTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTransactions"
    ADD CONSTRAINT "AffiliateTransactions_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateWallets AffiliateWallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWallets"
    ADD CONSTRAINT "AffiliateWallets_pkey" PRIMARY KEY (id);


--
-- Name: AffiliateWithdrawals AffiliateWithdrawals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals"
    ADD CONSTRAINT "AffiliateWithdrawals_pkey" PRIMARY KEY (id);


--
-- Name: AgentDevices AgentDevices_deviceId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentDevices"
    ADD CONSTRAINT "AgentDevices_deviceId_key" UNIQUE ("deviceId");


--
-- Name: AgentDevices AgentDevices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentDevices"
    ADD CONSTRAINT "AgentDevices_pkey" PRIMARY KEY (id);


--
-- Name: AgentIdentities AgentIdentities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentIdentities"
    ADD CONSTRAINT "AgentIdentities_pkey" PRIMARY KEY (id);


--
-- Name: AgentInteractions AgentInteractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentInteractions"
    ADD CONSTRAINT "AgentInteractions_pkey" PRIMARY KEY (id);


--
-- Name: AgentMemories AgentMemories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentMemories"
    ADD CONSTRAINT "AgentMemories_pkey" PRIMARY KEY (id);


--
-- Name: AgentProfilePhotos AgentProfilePhotos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentProfilePhotos"
    ADD CONSTRAINT "AgentProfilePhotos_pkey" PRIMARY KEY (id);


--
-- Name: AiTokenPlans AiTokenPlans_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenPlans"
    ADD CONSTRAINT "AiTokenPlans_code_key" UNIQUE (code);


--
-- Name: AiTokenPlans AiTokenPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenPlans"
    ADD CONSTRAINT "AiTokenPlans_pkey" PRIMARY KEY (id);


--
-- Name: AiTokenTransactions AiTokenTransactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenTransactions"
    ADD CONSTRAINT "AiTokenTransactions_pkey" PRIMARY KEY (id);


--
-- Name: Announcements Announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcements"
    ADD CONSTRAINT "Announcements_pkey" PRIMARY KEY (id);


--
-- Name: ApiFailedMessages ApiFailedMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiFailedMessages"
    ADD CONSTRAINT "ApiFailedMessages_pkey" PRIMARY KEY (id);


--
-- Name: ApiUsages ApiUsages_companyId_dateUsed_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiUsages"
    ADD CONSTRAINT "ApiUsages_companyId_dateUsed_key" UNIQUE ("companyId", "dateUsed");


--
-- Name: ApiUsages ApiUsages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiUsages"
    ADD CONSTRAINT "ApiUsages_pkey" PRIMARY KEY (id);


--
-- Name: ApplePurchases ApplePurchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApplePurchases"
    ADD CONSTRAINT "ApplePurchases_pkey" PRIMARY KEY (id);


--
-- Name: AttributionChannelAggregates AttributionChannelAggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionChannelAggregates"
    ADD CONSTRAINT "AttributionChannelAggregates_pkey" PRIMARY KEY (id);


--
-- Name: AttributionConversions AttributionConversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionConversions"
    ADD CONSTRAINT "AttributionConversions_pkey" PRIMARY KEY (id);


--
-- Name: AttributionResults AttributionResults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionResults"
    ADD CONSTRAINT "AttributionResults_pkey" PRIMARY KEY (id);


--
-- Name: AttributionTouchpoints AttributionTouchpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionTouchpoints"
    ADD CONSTRAINT "AttributionTouchpoints_pkey" PRIMARY KEY (id);


--
-- Name: AutomationRules AutomationRules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AutomationRules"
    ADD CONSTRAINT "AutomationRules_pkey" PRIMARY KEY (id);


--
-- Name: Baileys Baileys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Baileys"
    ADD CONSTRAINT "Baileys_pkey" PRIMARY KEY (id);


--
-- Name: CampaignAlerts CampaignAlerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignAlerts"
    ADD CONSTRAINT "CampaignAlerts_pkey" PRIMARY KEY (id);


--
-- Name: CampaignMessages CampaignMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_pkey" PRIMARY KEY (id);


--
-- Name: CampaignRecommendations CampaignRecommendations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRecommendations"
    ADD CONSTRAINT "CampaignRecommendations_pkey" PRIMARY KEY (id);


--
-- Name: CampaignRuleLogs CampaignRuleLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRuleLogs"
    ADD CONSTRAINT "CampaignRuleLogs_pkey" PRIMARY KEY (id);


--
-- Name: CampaignRules CampaignRules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRules"
    ADD CONSTRAINT "CampaignRules_pkey" PRIMARY KEY (id);


--
-- Name: CampaignSettings CampaignSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignSettings"
    ADD CONSTRAINT "CampaignSettings_pkey" PRIMARY KEY (id);


--
-- Name: CampaignShipping CampaignShipping_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShipping"
    ADD CONSTRAINT "CampaignShipping_pkey" PRIMARY KEY (id);


--
-- Name: CampaignShippings CampaignShippings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings"
    ADD CONSTRAINT "CampaignShippings_pkey" PRIMARY KEY (id);


--
-- Name: Campaigns Campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_pkey" PRIMARY KEY (id);


--
-- Name: ChatMessages ChatMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessages"
    ADD CONSTRAINT "ChatMessages_pkey" PRIMARY KEY (id);


--
-- Name: ChatUsers ChatUsers_chatId_userId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatUsers"
    ADD CONSTRAINT "ChatUsers_chatId_userId_key" UNIQUE ("chatId", "userId");


--
-- Name: ChatUsers ChatUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatUsers"
    ADD CONSTRAINT "ChatUsers_pkey" PRIMARY KEY (id);


--
-- Name: Chatbots Chatbots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbots"
    ADD CONSTRAINT "Chatbots_pkey" PRIMARY KEY (id);


--
-- Name: Chats Chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chats"
    ADD CONSTRAINT "Chats_pkey" PRIMARY KEY (id);


--
-- Name: CommentAutoReplyCampaigns CommentAutoReplyCampaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyCampaigns"
    ADD CONSTRAINT "CommentAutoReplyCampaigns_pkey" PRIMARY KEY (id);


--
-- Name: CommentAutoReplyLogs CommentAutoReplyLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyLogs"
    ADD CONSTRAINT "CommentAutoReplyLogs_pkey" PRIMARY KEY (id);


--
-- Name: CommentResponseSettings CommentResponseSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings"
    ADD CONSTRAINT "CommentResponseSettings_pkey" PRIMARY KEY (id);


--
-- Name: CompaniesSettings CompaniesSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompaniesSettings"
    ADD CONSTRAINT "CompaniesSettings_pkey" PRIMARY KEY (id);


--
-- Name: Companies Companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Companies"
    ADD CONSTRAINT "Companies_pkey" PRIMARY KEY (id);


--
-- Name: CompanyBillings CompanyBillings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyBillings"
    ADD CONSTRAINT "CompanyBillings_pkey" PRIMARY KEY (id);


--
-- Name: CompanyEmailPlans CompanyEmailPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyEmailPlans"
    ADD CONSTRAINT "CompanyEmailPlans_pkey" PRIMARY KEY (id);


--
-- Name: CompanyMetaConversionSettings CompanyMetaConversionSettings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyMetaConversionSettings"
    ADD CONSTRAINT "CompanyMetaConversionSettings_pkey" PRIMARY KEY (id);


--
-- Name: CompanyTokenUsages CompanyTokenUsages_companyId_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyTokenUsages"
    ADD CONSTRAINT "CompanyTokenUsages_companyId_date_key" UNIQUE ("companyId", date);


--
-- Name: CompanyTokenUsages CompanyTokenUsages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyTokenUsages"
    ADD CONSTRAINT "CompanyTokenUsages_pkey" PRIMARY KEY (id);


--
-- Name: CompanyUserQueues CompanyUserQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUserQueues"
    ADD CONSTRAINT "CompanyUserQueues_pkey" PRIMARY KEY (id);


--
-- Name: CompanyUsers CompanyUsers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers"
    ADD CONSTRAINT "CompanyUsers_pkey" PRIMARY KEY (id);


--
-- Name: ContactBindings ContactBindings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings"
    ADD CONSTRAINT "ContactBindings_pkey" PRIMARY KEY (id);


--
-- Name: ContactCustomFields ContactCustomFields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields"
    ADD CONSTRAINT "ContactCustomFields_pkey" PRIMARY KEY (id);


--
-- Name: ContactListItems ContactListItems_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems"
    ADD CONSTRAINT "ContactListItems_pkey" PRIMARY KEY (id);


--
-- Name: ContactLists ContactLists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactLists"
    ADD CONSTRAINT "ContactLists_pkey" PRIMARY KEY (id);


--
-- Name: ContactTags ContactTags_contactId_tagId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_contactId_tagId_key" UNIQUE ("contactId", "tagId");


--
-- Name: ContactTags ContactTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_pkey" PRIMARY KEY (id);


--
-- Name: ContactTemperatures ContactTemperatures_companyId_contactId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTemperatures"
    ADD CONSTRAINT "ContactTemperatures_companyId_contactId_key" UNIQUE ("companyId", "contactId");


--
-- Name: ContactTemperatures ContactTemperatures_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTemperatures"
    ADD CONSTRAINT "ContactTemperatures_pkey" PRIMARY KEY (id);


--
-- Name: ContactWallets ContactWallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactWallets"
    ADD CONSTRAINT "ContactWallets_pkey" PRIMARY KEY (id);


--
-- Name: Contacts Contacts_number_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_number_companyId_key" UNIQUE (number, "companyId");


--
-- Name: Contacts Contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_pkey" PRIMARY KEY (id);


--
-- Name: CustomerOrigins CustomerOrigins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerOrigins"
    ADD CONSTRAINT "CustomerOrigins_pkey" PRIMARY KEY (id);


--
-- Name: DialogChatBots DialogChatBots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DialogChatBots"
    ADD CONSTRAINT "DialogChatBots_pkey" PRIMARY KEY (id);


--
-- Name: EmailPlans EmailPlans_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailPlans"
    ADD CONSTRAINT "EmailPlans_name_key" UNIQUE (name);


--
-- Name: EmailPlans EmailPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."EmailPlans"
    ADD CONSTRAINT "EmailPlans_pkey" PRIMARY KEY (id);


--
-- Name: FacebookConversionEvents FacebookConversionEvents_facebookEventId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_facebookEventId_key" UNIQUE ("facebookEventId");


--
-- Name: FacebookConversionEvents FacebookConversionEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_pkey" PRIMARY KEY (id);


--
-- Name: FacebookDatasets FacebookDatasets_datasetId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookDatasets"
    ADD CONSTRAINT "FacebookDatasets_datasetId_key" UNIQUE ("datasetId");


--
-- Name: FacebookDatasets FacebookDatasets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookDatasets"
    ADD CONSTRAINT "FacebookDatasets_pkey" PRIMARY KEY (id);


--
-- Name: FilesOptions FilesOptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FilesOptions"
    ADD CONSTRAINT "FilesOptions_pkey" PRIMARY KEY (id);


--
-- Name: Files Files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Files"
    ADD CONSTRAINT "Files_pkey" PRIMARY KEY (id);


--
-- Name: FlowAudios FlowAudios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowAudios"
    ADD CONSTRAINT "FlowAudios_pkey" PRIMARY KEY (id);


--
-- Name: FlowBuilders FlowBuilders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowBuilders"
    ADD CONSTRAINT "FlowBuilders_pkey" PRIMARY KEY (id);


--
-- Name: FlowCampaigns FlowCampaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowCampaigns"
    ADD CONSTRAINT "FlowCampaigns_pkey" PRIMARY KEY (id);


--
-- Name: FlowDefaults FlowDefaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowDefaults"
    ADD CONSTRAINT "FlowDefaults_pkey" PRIMARY KEY (id);


--
-- Name: FlowImgs FlowImgs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowImgs"
    ADD CONSTRAINT "FlowImgs_pkey" PRIMARY KEY (id);


--
-- Name: Helps Helps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Helps"
    ADD CONSTRAINT "Helps_pkey" PRIMARY KEY (id);


--
-- Name: InboundEventLedger InboundEventLedger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InboundEventLedger"
    ADD CONSTRAINT "InboundEventLedger_pkey" PRIMARY KEY (id);


--
-- Name: InsightsDaily InsightsDaily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightsDaily"
    ADD CONSTRAINT "InsightsDaily_pkey" PRIMARY KEY (id);


--
-- Name: Invoices Invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoices"
    ADD CONSTRAINT "Invoices_pkey" PRIMARY KEY (id);


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_pkey" PRIMARY KEY (id);


--
-- Name: KanbanMovementLogs KanbanMovementLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_pkey" PRIMARY KEY (id);


--
-- Name: LogTickets LogTickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LogTickets"
    ADD CONSTRAINT "LogTickets_pkey" PRIMARY KEY (id);


--
-- Name: Messages Messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_pkey" PRIMARY KEY (id);


--
-- Name: MetaAgentActionLogs MetaAgentActionLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentActionLogs"
    ADD CONSTRAINT "MetaAgentActionLogs_pkey" PRIMARY KEY (id);


--
-- Name: MetaAgentPlans MetaAgentPlans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentPlans"
    ADD CONSTRAINT "MetaAgentPlans_pkey" PRIMARY KEY (id);


--
-- Name: MetaMarketingAuditLogs MetaMarketingAuditLogs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaMarketingAuditLogs"
    ADD CONSTRAINT "MetaMarketingAuditLogs_pkey" PRIMARY KEY (id);


--
-- Name: MetaOfficialMcpConnections MetaOfficialMcpConnections_companyId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaOfficialMcpConnections"
    ADD CONSTRAINT "MetaOfficialMcpConnections_companyId_key" UNIQUE ("companyId");


--
-- Name: MetaOfficialMcpConnections MetaOfficialMcpConnections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaOfficialMcpConnections"
    ADD CONSTRAINT "MetaOfficialMcpConnections_pkey" PRIMARY KEY (id);


--
-- Name: Notifications Notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notifications"
    ADD CONSTRAINT "Notifications_pkey" PRIMARY KEY (id);


--
-- Name: OutboundDispatches OutboundDispatches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_pkey" PRIMARY KEY (id);


--
-- Name: Partners Partners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Partners"
    ADD CONSTRAINT "Partners_pkey" PRIMARY KEY (id);


--
-- Name: PlanCreditAllocations PlanCreditAllocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanCreditAllocations"
    ADD CONSTRAINT "PlanCreditAllocations_pkey" PRIMARY KEY (id);


--
-- Name: Plans Plans_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plans"
    ADD CONSTRAINT "Plans_name_key" UNIQUE (name);


--
-- Name: Plans Plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plans"
    ADD CONSTRAINT "Plans_pkey" PRIMARY KEY (id);


--
-- Name: PromptQueues PromptQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptQueues"
    ADD CONSTRAINT "PromptQueues_pkey" PRIMARY KEY (id);


--
-- Name: PromptQueues PromptQueues_promptId_queueId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptQueues"
    ADD CONSTRAINT "PromptQueues_promptId_queueId_key" UNIQUE ("promptId", "queueId");


--
-- Name: Prompts Prompts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prompts"
    ADD CONSTRAINT "Prompts_pkey" PRIMARY KEY (id);


--
-- Name: QueueIntegrations QueueIntegrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueIntegrations"
    ADD CONSTRAINT "QueueIntegrations_pkey" PRIMARY KEY (id);


--
-- Name: QueueOptions QueueOptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueOptions"
    ADD CONSTRAINT "QueueOptions_pkey" PRIMARY KEY (id);


--
-- Name: Queues Queues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_pkey" PRIMARY KEY (id);


--
-- Name: QuickMessages QuickMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickMessages"
    ADD CONSTRAINT "QuickMessages_pkey" PRIMARY KEY (id);


--
-- Name: Receipts Receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts"
    ADD CONSTRAINT "Receipts_pkey" PRIMARY KEY (id);


--
-- Name: Roles Roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Roles"
    ADD CONSTRAINT "Roles_pkey" PRIMARY KEY (id);


--
-- Name: ScheduledMessagesEnvios ScheduledMessagesEnvios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessagesEnvios"
    ADD CONSTRAINT "ScheduledMessagesEnvios_pkey" PRIMARY KEY (id);


--
-- Name: ScheduledMessages ScheduledMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessages"
    ADD CONSTRAINT "ScheduledMessages_pkey" PRIMARY KEY (id);


--
-- Name: Schedules Schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_pkey" PRIMARY KEY (id);


--
-- Name: SequelizeMeta SequelizeMeta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."SequelizeMeta"
    ADD CONSTRAINT "SequelizeMeta_pkey" PRIMARY KEY (name);


--
-- Name: Sessions Sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessions"
    ADD CONSTRAINT "Sessions_pkey" PRIMARY KEY (id);


--
-- Name: Settings Settings_new_key_companyId_key1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_new_key_companyId_key1" UNIQUE (key, "companyId");


--
-- Name: Settings Settings_new_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_new_pkey1" PRIMARY KEY (id);


--
-- Name: Subscriptions Subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subscriptions"
    ADD CONSTRAINT "Subscriptions_pkey" PRIMARY KEY (id);


--
-- Name: Tags Tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_pkey" PRIMARY KEY (id);


--
-- Name: TelegramQueues TelegramQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelegramQueues"
    ADD CONSTRAINT "TelegramQueues_pkey" PRIMARY KEY (id);


--
-- Name: TelegramQueues TelegramQueues_telegramId_queueId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelegramQueues"
    ADD CONSTRAINT "TelegramQueues_telegramId_queueId_key" UNIQUE ("telegramId", "queueId");


--
-- Name: Telegrams Telegrams_botToken_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_botToken_key" UNIQUE ("botToken");


--
-- Name: Telegrams Telegrams_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_name_key" UNIQUE (name);


--
-- Name: Telegrams Telegrams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_pkey" PRIMARY KEY (id);


--
-- Name: TicketNotes TicketNotes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketNotes"
    ADD CONSTRAINT "TicketNotes_pkey" PRIMARY KEY (id);


--
-- Name: TicketTags TicketTags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_pkey" PRIMARY KEY (id);


--
-- Name: TicketTags TicketTags_ticketId_tagId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_ticketId_tagId_key" UNIQUE ("ticketId", "tagId");


--
-- Name: TicketTrakings TicketTrakings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_pkey" PRIMARY KEY (id);


--
-- Name: Tickets Tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_pkey" PRIMARY KEY (id);


--
-- Name: UGCCampaignMetrics UGCCampaignMetrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaignMetrics"
    ADD CONSTRAINT "UGCCampaignMetrics_pkey" PRIMARY KEY (id);


--
-- Name: UGCCampaigns UGCCampaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaigns"
    ADD CONSTRAINT "UGCCampaigns_pkey" PRIMARY KEY (id);


--
-- Name: UGCCreativeLearnings UGCCreativeLearnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeLearnings"
    ADD CONSTRAINT "UGCCreativeLearnings_pkey" PRIMARY KEY (id);


--
-- Name: UGCCreativeVariants UGCCreativeVariants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeVariants"
    ADD CONSTRAINT "UGCCreativeVariants_pkey" PRIMARY KEY (id);


--
-- Name: UGCCreatorAssignments UGCCreatorAssignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorAssignments"
    ADD CONSTRAINT "UGCCreatorAssignments_pkey" PRIMARY KEY (id);


--
-- Name: UGCCreatorPayments UGCCreatorPayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorPayments"
    ADD CONSTRAINT "UGCCreatorPayments_pkey" PRIMARY KEY (id);


--
-- Name: UGCCreators UGCCreators_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreators"
    ADD CONSTRAINT "UGCCreators_pkey" PRIMARY KEY (id);


--
-- Name: UGCPostComments UGCPostComments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_pkey" PRIMARY KEY (id);


--
-- Name: UGCSocialAccounts UGCSocialAccounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialAccounts"
    ADD CONSTRAINT "UGCSocialAccounts_pkey" PRIMARY KEY (id);


--
-- Name: UGCSocialPosts UGCSocialPosts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_pkey" PRIMARY KEY (id);


--
-- Name: UGCVideoAssets UGCVideoAssets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoAssets"
    ADD CONSTRAINT "UGCVideoAssets_pkey" PRIMARY KEY (id);


--
-- Name: UGCVideoJobs UGCVideoJobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoJobs"
    ADD CONSTRAINT "UGCVideoJobs_pkey" PRIMARY KEY (id);


--
-- Name: UnifiedConversations UnifiedConversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UnifiedConversations"
    ADD CONSTRAINT "UnifiedConversations_pkey" PRIMARY KEY (id);


--
-- Name: UserQueues UserQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues"
    ADD CONSTRAINT "UserQueues_pkey" PRIMARY KEY (id);


--
-- Name: UserQueues UserQueues_userId_queueId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues"
    ADD CONSTRAINT "UserQueues_userId_queueId_key" UNIQUE ("userId", "queueId");


--
-- Name: UserRatings UserRatings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRatings"
    ADD CONSTRAINT "UserRatings_pkey" PRIMARY KEY (id);


--
-- Name: UserTermsAcceptances UserTermsAcceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserTermsAcceptances"
    ADD CONSTRAINT "UserTermsAcceptances_pkey" PRIMARY KEY (id);


--
-- Name: Users Users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_email_key" UNIQUE (email);


--
-- Name: Users Users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_pkey" PRIMARY KEY (id);


--
-- Name: Versions Versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Versions"
    ADD CONSTRAINT "Versions_pkey" PRIMARY KEY (id);


--
-- Name: WebChatConversationMessages WebChatConversationMessages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversationMessages"
    ADD CONSTRAINT "WebChatConversationMessages_pkey" PRIMARY KEY (id);


--
-- Name: WebChatConversations WebChatConversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversations"
    ADD CONSTRAINT "WebChatConversations_pkey" PRIMARY KEY (id);


--
-- Name: WebChatWidgets WebChatWidgets_apiKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets"
    ADD CONSTRAINT "WebChatWidgets_apiKey_key" UNIQUE ("apiKey");


--
-- Name: WebChatWidgets WebChatWidgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets"
    ADD CONSTRAINT "WebChatWidgets_pkey" PRIMARY KEY (id);


--
-- Name: Webhooks Webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhooks"
    ADD CONSTRAINT "Webhooks_pkey" PRIMARY KEY (id);


--
-- Name: WhatsAppTemplates WhatsAppTemplates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsAppTemplates"
    ADD CONSTRAINT "WhatsAppTemplates_pkey" PRIMARY KEY (id);


--
-- Name: WhatsappQueues WhatsappQueues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues"
    ADD CONSTRAINT "WhatsappQueues_pkey" PRIMARY KEY (id);


--
-- Name: WhatsappQueues WhatsappQueues_whatsappId_queueId_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues"
    ADD CONSTRAINT "WhatsappQueues_whatsappId_queueId_key" UNIQUE ("whatsappId", "queueId");


--
-- Name: Whatsapps Whatsapps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_pkey" PRIMARY KEY (id);


--
-- Name: appointment_ai_suggestions appointment_ai_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions
    ADD CONSTRAINT appointment_ai_suggestions_pkey PRIMARY KEY (id);


--
-- Name: appointment_analytics appointment_analytics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_analytics
    ADD CONSTRAINT appointment_analytics_pkey PRIMARY KEY (id);


--
-- Name: appointment_availability appointment_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_availability
    ADD CONSTRAINT appointment_availability_pkey PRIMARY KEY (id);


--
-- Name: appointment_blocks appointment_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_blocks
    ADD CONSTRAINT appointment_blocks_pkey PRIMARY KEY (id);


--
-- Name: appointment_calendar_sync appointment_calendar_sync_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_sync
    ADD CONSTRAINT appointment_calendar_sync_pkey PRIMARY KEY (id);


--
-- Name: appointment_calendar_syncs appointment_calendar_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_syncs
    ADD CONSTRAINT appointment_calendar_syncs_pkey PRIMARY KEY (id);


--
-- Name: appointment_reminders appointment_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT appointment_reminders_pkey PRIMARY KEY (id);


--
-- Name: appointment_services appointment_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT appointment_services_pkey PRIMARY KEY (id);


--
-- Name: appointments appointments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT appointments_pkey PRIMARY KEY (id);


--
-- Name: campaign_approvals campaign_approvals_companyId_period_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approvals
    ADD CONSTRAINT "campaign_approvals_companyId_period_key" UNIQUE ("companyId", period);


--
-- Name: campaign_approvals campaign_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_approvals
    ADD CONSTRAINT campaign_approvals_pkey PRIMARY KEY (id);


--
-- Name: comment_moderation_audits comment_moderation_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comment_moderation_audits
    ADD CONSTRAINT comment_moderation_audits_pkey PRIMARY KEY (id);


--
-- Name: contact_memory contact_memory_contact_id_content_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_memory
    ADD CONSTRAINT contact_memory_contact_id_content_key UNIQUE (contact_id, content);


--
-- Name: contact_memory contact_memory_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_memory
    ADD CONSTRAINT contact_memory_pkey PRIMARY KEY (id);


--
-- Name: email_ab_tests email_ab_tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_ab_tests
    ADD CONSTRAINT email_ab_tests_pkey PRIMARY KEY (id);


--
-- Name: email_automations email_automations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT email_automations_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_recipients email_campaign_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT email_campaign_recipients_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_provider_configs email_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_provider_configs
    ADD CONSTRAINT email_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_tracking_events email_tracking_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tracking_events
    ADD CONSTRAINT email_tracking_events_pkey PRIMARY KEY (id);


--
-- Name: impersonation_audits impersonation_audits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.impersonation_audits
    ADD CONSTRAINT impersonation_audits_pkey PRIMARY KEY (id);


--
-- Name: integration_api_requests integration_api_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_api_requests
    ADD CONSTRAINT integration_api_requests_pkey PRIMARY KEY (id);


--
-- Name: integration_connections integration_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT integration_connections_pkey PRIMARY KEY (id);


--
-- Name: integration_entity_mappings integration_entity_mappings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_entity_mappings
    ADD CONSTRAINT integration_entity_mappings_pkey PRIMARY KEY (id);


--
-- Name: integration_providers integration_providers_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_providers
    ADD CONSTRAINT integration_providers_name_key UNIQUE (name);


--
-- Name: integration_providers integration_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_providers
    ADD CONSTRAINT integration_providers_pkey PRIMARY KEY (id);


--
-- Name: integration_sync_logs integration_sync_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT integration_sync_logs_pkey PRIMARY KEY (id);


--
-- Name: integration_webhook_events integration_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_events
    ADD CONSTRAINT integration_webhook_events_pkey PRIMARY KEY (id);


--
-- Name: meta_audit_logs meta_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_audit_logs
    ADD CONSTRAINT meta_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: PlanCreditAllocations plan_credit_allocations_plan_credit_type_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanCreditAllocations"
    ADD CONSTRAINT plan_credit_allocations_plan_credit_type_unique UNIQUE ("planId", "creditTypeId");


--
-- Name: recommendation_runs recommendation_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recommendation_runs
    ADD CONSTRAINT recommendation_runs_pkey PRIMARY KEY (id);


--
-- Name: reminder_templates reminder_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates
    ADD CONSTRAINT reminder_templates_pkey PRIMARY KEY (id);


--
-- Name: sensitive_categories sensitive_categories_companyId_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensitive_categories
    ADD CONSTRAINT "sensitive_categories_companyId_key_key" UNIQUE ("companyId", key);


--
-- Name: sensitive_categories sensitive_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sensitive_categories
    ADD CONSTRAINT sensitive_categories_pkey PRIMARY KEY (id);


--
-- Name: Plans unique_plan_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Plans"
    ADD CONSTRAINT unique_plan_name UNIQUE (name);


--
-- Name: Queues unique_queue_color_per_company; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT unique_queue_color_per_company UNIQUE (color, "companyId");


--
-- Name: Queues unique_queue_name_per_company; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT unique_queue_name_per_company UNIQUE (name, "companyId");


--
-- Name: CompanyUsers uq_companyusers_user_company; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers"
    ADD CONSTRAINT uq_companyusers_user_company UNIQUE ("userId", "companyId");


--
-- Name: CompanyUserQueues uq_cuq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUserQueues"
    ADD CONSTRAINT uq_cuq UNIQUE ("companyUserId", "queueId");


--
-- Name: InsightsDaily uq_insightsdaily; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InsightsDaily"
    ADD CONSTRAINT uq_insightsdaily UNIQUE ("companyId", date, level, "objectId");


--
-- Name: WebChatConversations_widget_session_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "WebChatConversations_widget_session_unique" ON public."WebChatConversations" USING btree ("widgetId", "sessionId");


--
-- Name: ai_affiliate_referrals_affiliate_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_affiliate_referrals_affiliate_company_idx ON public."AIAffiliateReferrals" USING btree ("affiliateCompanyId");


--
-- Name: ai_affiliate_referrals_link_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_affiliate_referrals_link_idx ON public."AIAffiliateReferrals" USING btree ("linkId");


--
-- Name: ai_affiliate_referrals_referred_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_affiliate_referrals_referred_company_idx ON public."AIAffiliateReferrals" USING btree ("referredCompanyId");


--
-- Name: automationrules_company_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX automationrules_company_event ON public."AutomationRules" USING btree ("companyId", event, active);


--
-- Name: campaign_alerts_alert_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_alert_type ON public."CampaignAlerts" USING btree ("alertType");


--
-- Name: campaign_alerts_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_campaign_id ON public."CampaignAlerts" USING btree ("campaignId");


--
-- Name: campaign_alerts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_company_id ON public."CampaignAlerts" USING btree ("companyId");


--
-- Name: campaign_alerts_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_company_status ON public."CampaignAlerts" USING btree ("companyId", status);


--
-- Name: campaign_alerts_dedup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_dedup ON public."CampaignAlerts" USING btree ("companyId", "campaignId", "alertType", status);


--
-- Name: campaign_alerts_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_severity ON public."CampaignAlerts" USING btree (severity);


--
-- Name: campaign_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_alerts_status ON public."CampaignAlerts" USING btree (status);


--
-- Name: campaign_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_channel ON public."CampaignMessages" USING btree (channel);


--
-- Name: campaign_messages_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_company_id ON public."CampaignMessages" USING btree ("companyId");


--
-- Name: campaign_messages_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_contact_id ON public."CampaignMessages" USING btree ("contactId");


--
-- Name: campaign_messages_ctwa_clid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_ctwa_clid ON public."CampaignMessages" USING btree ("ctwaClid");


--
-- Name: campaign_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_messages_ticket_id ON public."CampaignMessages" USING btree ("ticketId");


--
-- Name: campaign_recommendations_campaign_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recommendations_campaign_id ON public."CampaignRecommendations" USING btree ("campaignId");


--
-- Name: campaign_recommendations_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recommendations_company_id ON public."CampaignRecommendations" USING btree ("companyId");


--
-- Name: campaign_recommendations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX campaign_recommendations_status ON public."CampaignRecommendations" USING btree (status);


--
-- Name: contacts_number_company_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_number_company_unique ON public."Contacts" USING btree (number, "companyId") WHERE ("whatsappId" IS NULL);


--
-- Name: contacts_number_company_whatsapp_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_number_company_whatsapp_unique ON public."Contacts" USING btree (number, "companyId", "whatsappId") WHERE ("whatsappId" IS NOT NULL);


--
-- Name: contacts_remotejid_company_whatsapp_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX contacts_remotejid_company_whatsapp_unique ON public."Contacts" USING btree ("remoteJid", "companyId", "whatsappId") WHERE (("remoteJid" IS NOT NULL) AND ("whatsappId" IS NOT NULL));


--
-- Name: contacts_remotejid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX contacts_remotejid_idx ON public."Contacts" USING btree ("remoteJid");


--
-- Name: cr_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cr_company_id ON public."CampaignRules" USING btree ("companyId");


--
-- Name: cr_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cr_company_status ON public."CampaignRules" USING btree ("companyId", status);


--
-- Name: cr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX cr_status ON public."CampaignRules" USING btree (status);


--
-- Name: crl_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crl_company_id ON public."CampaignRuleLogs" USING btree ("companyId");


--
-- Name: crl_executed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crl_executed_at ON public."CampaignRuleLogs" USING btree ("executedAt" DESC);


--
-- Name: crl_rule_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crl_rule_id ON public."CampaignRuleLogs" USING btree ("ruleId");


--
-- Name: ct_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ct_category ON public."ContactTemperatures" USING btree (category);


--
-- Name: ct_company_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ct_company_category ON public."ContactTemperatures" USING btree ("companyId", category);


--
-- Name: ct_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ct_company_id ON public."ContactTemperatures" USING btree ("companyId");


--
-- Name: ct_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ct_contact_id ON public."ContactTemperatures" USING btree ("contactId");


--
-- Name: ct_temperature; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ct_temperature ON public."ContactTemperatures" USING btree (temperature DESC);


--
-- Name: idx_CampaignMessages_messageId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_CampaignMessages_messageId" ON public."CampaignMessages" USING btree ("messageId");


--
-- Name: idx_CampaignMessages_whatsappId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_CampaignMessages_whatsappId" ON public."CampaignMessages" USING btree ("whatsappId");


--
-- Name: idx_Contacts_whatsappId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Contacts_whatsappId" ON public."Contacts" USING btree ("whatsappId");


--
-- Name: idx_LogTickets_queueId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_LogTickets_queueId" ON public."LogTickets" USING btree ("queueId");


--
-- Name: idx_LogTickets_ticketId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_LogTickets_ticketId" ON public."LogTickets" USING btree ("ticketId");


--
-- Name: idx_LogTickets_userId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_LogTickets_userId" ON public."LogTickets" USING btree ("userId");


--
-- Name: idx_Messages_contactId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Messages_contactId" ON public."Messages" USING btree ("contactId");


--
-- Name: idx_Messages_queueId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Messages_queueId" ON public."Messages" USING btree ("queueId");


--
-- Name: idx_Messages_ticketTrakingId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Messages_ticketTrakingId" ON public."Messages" USING btree ("ticketTrakingId");


--
-- Name: idx_TicketTrakings_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_TicketTrakings_companyId" ON public."TicketTrakings" USING btree ("companyId");


--
-- Name: idx_TicketTrakings_queueId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_TicketTrakings_queueId" ON public."TicketTrakings" USING btree ("queueId");


--
-- Name: idx_TicketTrakings_ticketId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_TicketTrakings_ticketId" ON public."TicketTrakings" USING btree ("ticketId");


--
-- Name: idx_TicketTrakings_userId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_TicketTrakings_userId" ON public."TicketTrakings" USING btree ("userId");


--
-- Name: idx_TicketTrakings_whatsappId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_TicketTrakings_whatsappId" ON public."TicketTrakings" USING btree ("whatsappId");


--
-- Name: idx_Tickets_integrationId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Tickets_integrationId" ON public."Tickets" USING btree ("integrationId");


--
-- Name: idx_Tickets_queueId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Tickets_queueId" ON public."Tickets" USING btree ("queueId");


--
-- Name: idx_Tickets_queueOptionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Tickets_queueOptionId" ON public."Tickets" USING btree ("queueOptionId");


--
-- Name: idx_Tickets_userId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Tickets_userId" ON public."Tickets" USING btree ("userId");


--
-- Name: idx_Tickets_whatsappId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_Tickets_whatsappId" ON public."Tickets" USING btree ("whatsappId");


--
-- Name: idx_affiliate_links_affiliate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_links_affiliate ON public."AffiliateLinks" USING btree ("affiliateId");


--
-- Name: idx_affiliate_links_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_links_company ON public."AffiliateLinks" USING btree ("companyId");


--
-- Name: idx_affiliate_links_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_affiliate_links_slug ON public."AffiliateLinks" USING btree (slug);


--
-- Name: idx_affiliate_programs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_programs_company ON public."AIAffiliatePrograms" USING btree ("companyId");


--
-- Name: idx_affiliate_programs_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_programs_company_status ON public."AIAffiliatePrograms" USING btree ("companyId", status);


--
-- Name: idx_affiliate_programs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_programs_parent ON public."AIAffiliatePrograms" USING btree ("parentAffiliateId");


--
-- Name: idx_affiliate_referrals_affiliate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_referrals_affiliate ON public."AIAffiliateReferrals" USING btree ("affiliateId");


--
-- Name: idx_affiliate_referrals_affiliate_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_referrals_affiliate_company ON public."AIAffiliateReferrals" USING btree ("affiliateId", "referredCompanyId");


--
-- Name: idx_affiliate_tiers_company_level; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_affiliate_tiers_company_level ON public."AffiliateTiers" USING btree ("companyId", level);


--
-- Name: idx_affiliate_transactions_company_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_transactions_company_type ON public."AffiliateTransactions" USING btree ("companyId", type);


--
-- Name: idx_affiliate_transactions_wallet_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_transactions_wallet_date ON public."AffiliateTransactions" USING btree ("walletId", "createdAt");


--
-- Name: idx_affiliate_wallets_company_affiliate; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_affiliate_wallets_company_affiliate ON public."AffiliateWallets" USING btree ("companyId", "affiliateId");


--
-- Name: idx_affiliate_withdrawals_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_withdrawals_company_status ON public."AffiliateWithdrawals" USING btree ("companyId", status);


--
-- Name: idx_affiliate_withdrawals_wallet_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_affiliate_withdrawals_wallet_status ON public."AffiliateWithdrawals" USING btree ("walletId", status);


--
-- Name: idx_agent_assignments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_assignments_company ON public."AIAgentAssignments" USING btree ("companyId");


--
-- Name: idx_agent_configs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_configs_company ON public."AIAgentConfigs" USING btree ("companyId");


--
-- Name: idx_agent_configs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_configs_type ON public."AIAgentConfigs" USING btree ("agentType");


--
-- Name: idx_agent_devices_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_devices_company ON public."AgentDevices" USING btree ("companyId");


--
-- Name: idx_agent_devices_device_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_devices_device_id ON public."AgentDevices" USING btree ("deviceId");


--
-- Name: idx_agent_devices_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_devices_identity ON public."AgentDevices" USING btree ("assignedIdentityId");


--
-- Name: idx_agent_devices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_devices_status ON public."AgentDevices" USING btree (status);


--
-- Name: idx_agent_identity_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_identity_company ON public."AgentIdentities" USING btree ("companyId");


--
-- Name: idx_agent_identity_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_identity_creator ON public."AgentIdentities" USING btree ("createdBy");


--
-- Name: idx_agent_identity_niche; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_identity_niche ON public."AgentIdentities" USING btree (niche);


--
-- Name: idx_agent_identity_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_identity_status ON public."AgentIdentities" USING btree (status);


--
-- Name: idx_agent_interactions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_company ON public."AgentInteractions" USING btree ("companyId");


--
-- Name: idx_agent_interactions_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_device ON public."AgentInteractions" USING btree ("agentDeviceId");


--
-- Name: idx_agent_interactions_exec_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_exec_status ON public."AgentInteractions" USING btree ("executionStatus");


--
-- Name: idx_agent_interactions_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_identity ON public."AgentInteractions" USING btree ("agentIdentityId");


--
-- Name: idx_agent_interactions_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_platform ON public."AgentInteractions" USING btree (platform);


--
-- Name: idx_agent_interactions_sentiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_sentiment ON public."AgentInteractions" USING btree (sentiment);


--
-- Name: idx_agent_interactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_interactions_type ON public."AgentInteractions" USING btree (type);


--
-- Name: idx_agent_logs_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_logs_company_date ON public."AIAgentLogs" USING btree ("companyId", "createdAt");


--
-- Name: idx_agent_logs_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_logs_ticket ON public."AIAgentLogs" USING btree ("ticketId");


--
-- Name: idx_agent_logs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_logs_type ON public."AIAgentLogs" USING btree ("agentType");


--
-- Name: idx_agent_memory_company_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_company_identity ON public."AgentMemories" USING btree ("companyId", "agentIdentityId");


--
-- Name: idx_agent_memory_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_identity ON public."AgentMemories" USING btree ("agentIdentityId");


--
-- Name: idx_agent_memory_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_memory_type ON public."AgentMemories" USING btree ("memoryType");


--
-- Name: idx_agent_photo_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_photo_identity ON public."AgentProfilePhotos" USING btree ("agentIdentityId");


--
-- Name: idx_agent_photo_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_photo_type ON public."AgentProfilePhotos" USING btree ("photoType");


--
-- Name: idx_ai_agent_logs_feedback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_logs_feedback ON public."AIAgentLogs" USING btree ("feedbackImplicit") WHERE ("feedbackImplicit" IS NOT NULL);


--
-- Name: idx_ai_agent_logs_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_logs_parent ON public."AIAgentLogs" USING btree ("parentLogId") WHERE ("parentLogId" IS NOT NULL);


--
-- Name: idx_ai_agent_logs_ticket_feedback; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_logs_ticket_feedback ON public."AIAgentLogs" USING btree ("ticketId", "feedbackImplicit") WHERE ("feedbackImplicit" IS NOT NULL);


--
-- Name: idx_ai_chunks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chunks_company ON public."AIChunks" USING btree ("companyId");


--
-- Name: idx_ai_chunks_content_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chunks_content_fts ON public."AIChunks" USING gin (to_tsvector('spanish'::regconfig, content));


--
-- Name: idx_ai_chunks_document; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chunks_document ON public."AIChunks" USING btree ("documentId");


--
-- Name: idx_ai_chunks_keywords; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_chunks_keywords ON public."AIChunks" USING gin (keywords);


--
-- Name: idx_ai_corrections_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_corrections_active ON public."AISupportCorrections" USING btree ("companyId", "isActive");


--
-- Name: idx_ai_corrections_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_corrections_company ON public."AISupportCorrections" USING btree ("companyId");


--
-- Name: idx_ai_credit_balances_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_credit_balances_company ON public."AICreditBalances" USING btree ("companyId");


--
-- Name: idx_ai_documents_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_documents_company ON public."AIDocuments" USING btree ("companyId");


--
-- Name: idx_ai_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_documents_status ON public."AIDocuments" USING btree (status);


--
-- Name: idx_ai_entities_engine_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_entities_engine_type ON public."AIEntities" USING btree (engine, type);


--
-- Name: idx_ai_entities_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_entities_status ON public."AIEntities" USING btree (status);


--
-- Name: idx_ai_image_credits_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_company ON public."AIImageCreditTransactions" USING btree ("companyId");


--
-- Name: idx_ai_image_credits_company_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_company_type ON public."AIImageCreditTransactions" USING btree ("companyId", "transactionType");


--
-- Name: idx_ai_image_credits_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_created ON public."AIImageCreditTransactions" USING btree ("createdAt");


--
-- Name: idx_ai_image_credits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_status ON public."AIImageCreditTransactions" USING btree (status);


--
-- Name: idx_ai_image_credits_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_type ON public."AIImageCreditTransactions" USING btree ("transactionType");


--
-- Name: idx_ai_image_credits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_credits_user ON public."AIImageCreditTransactions" USING btree ("userId");


--
-- Name: idx_ai_image_gen_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_company ON public."AIImageGenerations" USING btree ("companyId");


--
-- Name: idx_ai_image_gen_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_company_created ON public."AIImageGenerations" USING btree ("companyId", "createdAt");


--
-- Name: idx_ai_image_gen_company_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_company_status_created ON public."AIImageGenerations" USING btree ("companyId", status, "createdAt" DESC);


--
-- Name: idx_ai_image_gen_company_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_company_user_created ON public."AIImageGenerations" USING btree ("companyId", "userId", "createdAt" DESC);


--
-- Name: idx_ai_image_gen_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_created ON public."AIImageGenerations" USING btree ("createdAt");


--
-- Name: idx_ai_image_gen_prompt_fts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_prompt_fts ON public."AIImageGenerations" USING gin (to_tsvector('spanish'::regconfig, prompt));


--
-- Name: idx_ai_image_gen_prompt_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_prompt_trgm ON public."AIImageGenerations" USING gin (prompt public.gin_trgm_ops);


--
-- Name: idx_ai_image_gen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_status ON public."AIImageGenerations" USING btree (status);


--
-- Name: idx_ai_image_gen_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_gen_user ON public."AIImageGenerations" USING btree ("userId");


--
-- Name: idx_ai_image_items_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_items_company ON public."AIImageGenerationItems" USING btree ("companyId");


--
-- Name: idx_ai_image_items_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_items_created ON public."AIImageGenerationItems" USING btree ("createdAt");


--
-- Name: idx_ai_image_items_generation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_image_items_generation ON public."AIImageGenerationItems" USING btree ("aiImageGenerationId");


--
-- Name: idx_ai_prompt_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_prompt_templates_company ON public."AIPromptTemplates" USING btree ("companyId");


--
-- Name: idx_ai_provider_configs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_configs_company ON public."AIProviderConfigs" USING btree ("companyId");


--
-- Name: idx_ai_provider_global; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_global ON public."AIProviderConfigs" USING btree ("companyId") WHERE ("companyId" IS NULL);


--
-- Name: idx_ai_provider_image_analysis; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_image_analysis ON public."AIProviderConfigs" USING btree ("imageAnalysisEnabled") WHERE ("imageAnalysisEnabled" = true);


--
-- Name: idx_ai_provider_image_gen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_image_gen ON public."AIProviderConfigs" USING btree ("imageGenerationEnabled") WHERE ("imageGenerationEnabled" = true);


--
-- Name: idx_ai_provider_stt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_stt ON public."AIProviderConfigs" USING btree ("speechToTextEnabled") WHERE ("speechToTextEnabled" = true);


--
-- Name: idx_ai_provider_text_gen; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_provider_text_gen ON public."AIProviderConfigs" USING btree ("textGenerationEnabled") WHERE ("textGenerationEnabled" = true);


--
-- Name: idx_ai_semantic_cache_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_semantic_cache_company ON public."AISemanticCache" USING btree ("companyId");


--
-- Name: idx_ai_semantic_cache_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_semantic_cache_expires ON public."AISemanticCache" USING btree ("expiresAt");


--
-- Name: idx_ai_team_members_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_team_members_team ON public."AITeamMembers" USING btree ("teamId");


--
-- Name: idx_ai_team_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_team_members_user ON public."AITeamMembers" USING btree ("userId");


--
-- Name: idx_ai_teams_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_teams_company ON public."AITeams" USING btree ("companyId");


--
-- Name: idx_ai_token_transactions_company_type_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_token_transactions_company_type_created_at ON public."AiTokenTransactions" USING btree ("companyId", type, "createdAt" DESC);


--
-- Name: idx_ai_token_transactions_type_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_token_transactions_type_created_at ON public."AiTokenTransactions" USING btree (type, "createdAt" DESC);


--
-- Name: idx_ai_usage_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_logs_company ON public."AIUsageLogs" USING btree ("companyId");


--
-- Name: idx_ai_video_credits_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_credits_company ON public."AIVideoCreditTransactions" USING btree ("companyId");


--
-- Name: idx_ai_video_credits_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_credits_created ON public."AIVideoCreditTransactions" USING btree ("createdAt");


--
-- Name: idx_ai_video_credits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_credits_status ON public."AIVideoCreditTransactions" USING btree (status);


--
-- Name: idx_ai_video_credits_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_credits_type ON public."AIVideoCreditTransactions" USING btree ("transactionType");


--
-- Name: idx_ai_video_credits_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_credits_user ON public."AIVideoCreditTransactions" USING btree ("userId");


--
-- Name: idx_ai_video_gen_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_gen_company ON public."AIVideoGenerations" USING btree ("companyId");


--
-- Name: idx_ai_video_gen_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_gen_created ON public."AIVideoGenerations" USING btree ("createdAt");


--
-- Name: idx_ai_video_gen_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_gen_status ON public."AIVideoGenerations" USING btree (status);


--
-- Name: idx_ai_video_gen_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_gen_user ON public."AIVideoGenerations" USING btree ("userId");


--
-- Name: idx_ai_video_items_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_items_company ON public."AIVideoGenerationItems" USING btree ("companyId");


--
-- Name: idx_ai_video_items_generation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_video_items_generation ON public."AIVideoGenerationItems" USING btree ("aiVideoGenerationId");


--
-- Name: idx_aiabtests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiabtests_company ON public."AIABTests" USING btree ("companyId");


--
-- Name: idx_aiabtests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiabtests_status ON public."AIABTests" USING btree (status);


--
-- Name: idx_aiabtests_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiabtests_type ON public."AIABTests" USING btree ("testType");


--
-- Name: idx_aiabtestvariants_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiabtestvariants_company ON public."AIABTestVariants" USING btree ("companyId");


--
-- Name: idx_aiabtestvariants_test; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiabtestvariants_test ON public."AIABTestVariants" USING btree ("testId");


--
-- Name: idx_aiagent_department; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiagent_department ON public."AIAgentConfigs" USING btree (department);


--
-- Name: idx_aiagent_department_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiagent_department_active ON public."AIAgentConfigs" USING btree (department, "isActive") WHERE ("isActive" = true);


--
-- Name: idx_aiagent_global_catalog; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiagent_global_catalog ON public."AIAgentConfigs" USING btree ("companyId", department, "isActive") WHERE (("companyId" IS NULL) AND ("isActive" = true));


--
-- Name: idx_aiagent_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aiagent_slug ON public."AIAgentConfigs" USING btree (slug);


--
-- Name: idx_aifinetuning_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aifinetuning_company ON public."AIFineTuningJobs" USING btree ("companyId");


--
-- Name: idx_aifinetuning_jobid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aifinetuning_jobid ON public."AIFineTuningJobs" USING btree ("jobId");


--
-- Name: idx_aifinetuning_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aifinetuning_provider ON public."AIFineTuningJobs" USING btree (provider);


--
-- Name: idx_aifinetuning_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aifinetuning_status ON public."AIFineTuningJobs" USING btree (status);


--
-- Name: idx_aischeduled_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aischeduled_company ON public."AIScheduledTasks" USING btree ("companyId");


--
-- Name: idx_aischeduled_nextrun; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aischeduled_nextrun ON public."AIScheduledTasks" USING btree ("nextRunAt");


--
-- Name: idx_aischeduled_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aischeduled_status ON public."AIScheduledTasks" USING btree (status);


--
-- Name: idx_aischeduled_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aischeduled_type ON public."AIScheduledTasks" USING btree ("taskType");


--
-- Name: idx_aispans_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_company ON public."AISpans" USING btree ("companyId");


--
-- Name: idx_aispans_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_model ON public."AISpans" USING btree (model);


--
-- Name: idx_aispans_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_parent ON public."AISpans" USING btree ("parentSpanId");


--
-- Name: idx_aispans_spanid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_spanid ON public."AISpans" USING btree ("spanId");


--
-- Name: idx_aispans_traceid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_traceid ON public."AISpans" USING btree ("traceId");


--
-- Name: idx_aispans_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aispans_type ON public."AISpans" USING btree (type);


--
-- Name: idx_aisubplans_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aisubplans_company ON public."AISubplans" USING btree ("companyId");


--
-- Name: idx_ait_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ait_company ON public."AICreditTransactions" USING btree ("companyId");


--
-- Name: idx_ait_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ait_company_date ON public."AICreditTransactions" USING btree ("companyId", "createdAt");


--
-- Name: idx_ait_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ait_created ON public."AICreditTransactions" USING btree ("createdAt");


--
-- Name: idx_ait_credit_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ait_credit_type ON public."AICreditTransactions" USING btree ("creditTypeId");


--
-- Name: idx_ait_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ait_source ON public."AICreditTransactions" USING btree (source);


--
-- Name: idx_aitokentrans_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentrans_company ON public."AiTokenTransactions" USING btree ("companyId");


--
-- Name: idx_aitokentransactions_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentransactions_companyid ON public."AiTokenTransactions" USING btree ("companyId");


--
-- Name: idx_aitokentransactions_companyid_module; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentransactions_companyid_module ON public."AiTokenTransactions" USING btree ("companyId", module);


--
-- Name: idx_aitokentransactions_companyid_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentransactions_companyid_type ON public."AiTokenTransactions" USING btree ("companyId", type);


--
-- Name: idx_aitokentransactions_createdat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentransactions_createdat ON public."AiTokenTransactions" USING btree ("createdAt");


--
-- Name: idx_aitokentransactions_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitokentransactions_userid ON public."AiTokenTransactions" USING btree ("userId");


--
-- Name: idx_aitraces_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_company ON public."AITraces" USING btree ("companyId");


--
-- Name: idx_aitraces_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_session ON public."AITraces" USING btree ("sessionId");


--
-- Name: idx_aitraces_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_started ON public."AITraces" USING btree ("startedAt");


--
-- Name: idx_aitraces_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_status ON public."AITraces" USING btree (status);


--
-- Name: idx_aitraces_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_tags ON public."AITraces" USING gin (tags);


--
-- Name: idx_aitraces_traceid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aitraces_traceid ON public."AITraces" USING btree ("traceId");


--
-- Name: idx_api_usages_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_usages_company_date ON public."ApiUsages" USING btree ("companyId", "dateUsed");


--
-- Name: idx_applepurchase_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_applepurchase_company ON public."ApplePurchases" USING btree ("companyId");


--
-- Name: idx_appointment_services_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointment_services_company ON public.appointment_services USING btree ("companyId");


--
-- Name: idx_appointments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_company ON public.appointments USING btree ("companyId");


--
-- Name: idx_appointments_reminder_template; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_reminder_template ON public.appointments USING btree ("reminderTemplateId");


--
-- Name: idx_appointments_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_start ON public.appointments USING btree ("startTime");


--
-- Name: idx_appointments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_status ON public.appointments USING btree (status);


--
-- Name: idx_appointments_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_appointments_user ON public.appointments USING btree ("userId");


--
-- Name: idx_availability_company_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_company_user ON public.appointment_availability USING btree ("companyId", "userId");


--
-- Name: idx_availability_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_availability_day ON public.appointment_availability USING btree ("dayOfWeek");


--
-- Name: idx_blocks_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_company ON public.appointment_blocks USING btree ("companyId");


--
-- Name: idx_blocks_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_time ON public.appointment_blocks USING btree ("startTime", "endTime");


--
-- Name: idx_blocks_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_blocks_user ON public.appointment_blocks USING btree ("userId");


--
-- Name: idx_campaign_approvals_company_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_approvals_company_period ON public.campaign_approvals USING btree ("companyId", period);


--
-- Name: idx_campaign_shippings_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_shippings_campaign ON public."CampaignShippings" USING btree ("campaignId");


--
-- Name: idx_campaignmessages_company_adset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaignmessages_company_adset ON public."CampaignMessages" USING btree ("companyId", "adSetId");


--
-- Name: idx_campaignmessages_company_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaignmessages_company_campaign ON public."CampaignMessages" USING btree ("companyId", "campaignId");


--
-- Name: idx_campaigns_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_company ON public."Campaigns" USING btree ("companyId");


--
-- Name: idx_car_campaigns_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_campaigns_company ON public."CommentAutoReplyCampaigns" USING btree ("companyId");


--
-- Name: idx_car_campaigns_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_campaigns_page ON public."CommentAutoReplyCampaigns" USING btree ("pageId");


--
-- Name: idx_car_campaigns_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_campaigns_post ON public."CommentAutoReplyCampaigns" USING btree ("postId");


--
-- Name: idx_car_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_campaigns_status ON public."CommentAutoReplyCampaigns" USING btree (status);


--
-- Name: idx_car_logs_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_logs_campaign ON public."CommentAutoReplyLogs" USING btree ("campaignId");


--
-- Name: idx_car_logs_commenter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_logs_commenter ON public."CommentAutoReplyLogs" USING btree ("commenterId");


--
-- Name: idx_car_logs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_logs_company ON public."CommentAutoReplyLogs" USING btree ("companyId");


--
-- Name: idx_car_logs_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_logs_post ON public."CommentAutoReplyLogs" USING btree ("postId");


--
-- Name: idx_car_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_car_logs_status ON public."CommentAutoReplyLogs" USING btree ("publicReplyStatus");


--
-- Name: idx_chat_messages_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_chat ON public."ChatMessages" USING btree ("chatId");


--
-- Name: idx_chat_users_chat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_users_chat ON public."ChatUsers" USING btree ("chatId");


--
-- Name: idx_chatbot_configs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_configs_company ON public."AIChatbotConfigs" USING btree ("companyId");


--
-- Name: idx_chatbot_configs_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_configs_queue ON public."AIChatbotConfigs" USING btree ("queueId");


--
-- Name: idx_chatbot_configs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_configs_status ON public."AIChatbotConfigs" USING btree (status);


--
-- Name: idx_chatbot_datasources_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_datasources_chatbot ON public."AIChatbotDataSources" USING btree ("chatbotId");


--
-- Name: idx_chatbot_datasources_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_datasources_company ON public."AIChatbotDataSources" USING btree ("companyId");


--
-- Name: idx_chatbot_domains_chatbot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_domains_chatbot ON public."AIChatbotDomains" USING btree ("chatbotId");


--
-- Name: idx_chatbot_domains_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_domains_company ON public."AIChatbotDomains" USING btree ("companyId");


--
-- Name: idx_chats_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chats_company ON public."Chats" USING btree ("companyId");


--
-- Name: idx_comment_response_settings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comment_response_settings_company ON public."CommentResponseSettings" USING btree ("companyId");


--
-- Name: idx_companies_image_credits; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_image_credits ON public."Companies" USING btree ("imageGenerationCredits");


--
-- Name: idx_companies_referred_by_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_referred_by_code ON public."Companies" USING btree ("referredByCode");


--
-- Name: idx_companies_settings_tiktok_client; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companies_settings_tiktok_client ON public."CompaniesSettings" USING btree ("tiktokClientKey");


--
-- Name: idx_company_email_plan_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_email_plan_company ON public."CompanyEmailPlans" USING btree ("companyId");


--
-- Name: idx_company_email_plan_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_email_plan_email ON public."CompanyEmailPlans" USING btree ("emailPlanId");


--
-- Name: idx_company_extensions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_extensions_company ON public."AICompanyExtensions" USING btree ("companyId");


--
-- Name: idx_company_meta_conversion_settings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_meta_conversion_settings_company ON public."CompanyMetaConversionSettings" USING btree ("companyId");


--
-- Name: idx_company_meta_conversion_settings_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_meta_conversion_settings_event ON public."CompanyMetaConversionSettings" USING btree ("eventKey");


--
-- Name: idx_company_token_usages_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_token_usages_company_date ON public."CompanyTokenUsages" USING btree ("companyId", date);


--
-- Name: idx_companybilling_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companybilling_company ON public."CompanyBillings" USING btree (company_id);


--
-- Name: idx_companyusers_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companyusers_company ON public."CompanyUsers" USING btree ("companyId");


--
-- Name: idx_companyusers_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_companyusers_user ON public."CompanyUsers" USING btree ("userId");


--
-- Name: idx_contact_bindings_company_provider_ident; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_bindings_company_provider_ident ON public."ContactBindings" USING btree ("companyId", provider, "providerIdentifier");


--
-- Name: idx_contact_bindings_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_bindings_contact ON public."ContactBindings" USING btree ("contactId");


--
-- Name: idx_contact_bindings_conv_provider_ident_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_contact_bindings_conv_provider_ident_unique ON public."ContactBindings" USING btree ("conversationId", provider, "providerIdentifier");


--
-- Name: idx_contact_bindings_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_bindings_whatsapp ON public."ContactBindings" USING btree ("whatsappId");


--
-- Name: idx_contact_custom_fields_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_custom_fields_contact ON public."ContactCustomFields" USING btree ("contactId");


--
-- Name: idx_contact_list_items_list; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_list_items_list ON public."ContactListItems" USING btree ("contactListId");


--
-- Name: idx_contact_lists_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_lists_company ON public."ContactLists" USING btree ("companyId");


--
-- Name: idx_contact_lists_isEmailList; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_contact_lists_isEmailList" ON public."ContactLists" USING btree ("isEmailList");


--
-- Name: idx_contact_memory_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_memory_company ON public.contact_memory USING btree (company_id);


--
-- Name: idx_contact_memory_contact_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_memory_contact_type ON public.contact_memory USING btree (contact_id, memory_type);


--
-- Name: idx_contact_memory_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_memory_embedding ON public.contact_memory USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_contact_memory_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_memory_verified ON public.contact_memory USING btree (contact_id, verified) WHERE (verified = true);


--
-- Name: idx_contact_tags_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_tags_contact ON public."ContactTags" USING btree ("contactId");


--
-- Name: idx_contactlists_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contactlists_provider ON public."ContactLists" USING btree (provider, "providerListId");


--
-- Name: idx_contacts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_company ON public."Contacts" USING btree ("companyId");


--
-- Name: idx_contacts_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_number ON public."Contacts" USING btree (number);


--
-- Name: idx_cpsh_campaign_delivered; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cpsh_campaign_delivered ON public."CampaignShipping" USING btree ("campaignId", "deliveredAt");


--
-- Name: idx_cpsh_campaign_failed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cpsh_campaign_failed ON public."CampaignShipping" USING btree ("campaignId", "failedAt");


--
-- Name: idx_cuq_companyuser; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cuq_companyuser ON public."CompanyUserQueues" USING btree ("companyUserId");


--
-- Name: idx_customer_origins_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_origins_active ON public."CustomerOrigins" USING btree ("isActive");


--
-- Name: idx_customer_origins_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_origins_company ON public."CustomerOrigins" USING btree ("companyId");


--
-- Name: idx_customer_origins_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_origins_company_active ON public."CustomerOrigins" USING btree ("companyId", "isActive");


--
-- Name: idx_ecr_company_contact_bounces; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_company_contact_bounces ON public.email_campaign_recipients USING btree ("companyId", "contactId", "bouncedAt");


--
-- Name: idx_ecr_company_contact_clicks; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_company_contact_clicks ON public.email_campaign_recipients USING btree ("companyId", "contactId", "clickedAt");


--
-- Name: idx_ecr_company_contact_opens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_company_contact_opens ON public.email_campaign_recipients USING btree ("companyId", "contactId", "openedAt");


--
-- Name: idx_ecr_personalization_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ecr_personalization_data ON public.email_campaign_recipients USING gin ("personalizationData");


--
-- Name: idx_email_ab_tests_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_ab_tests_active ON public.email_ab_tests USING btree ("isActive");


--
-- Name: idx_email_ab_tests_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_ab_tests_campaign ON public.email_ab_tests USING btree ("campaignId");


--
-- Name: idx_email_ab_tests_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_ab_tests_company ON public.email_ab_tests USING btree ("companyId");


--
-- Name: idx_email_ab_tests_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_ab_tests_company_active ON public.email_ab_tests USING btree ("companyId", "isActive");


--
-- Name: idx_email_ab_tests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_ab_tests_status ON public.email_ab_tests USING btree (status);


--
-- Name: idx_email_automations_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_active ON public.email_automations USING btree ("isActive");


--
-- Name: idx_email_automations_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_company ON public.email_automations USING btree ("companyId");


--
-- Name: idx_email_automations_company_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_company_active ON public.email_automations USING btree ("companyId", "isActive", status);


--
-- Name: idx_email_automations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_status ON public.email_automations USING btree (status);


--
-- Name: idx_email_automations_trigger_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_automations_trigger_type ON public.email_automations USING btree ("triggerType");


--
-- Name: idx_email_campaign_recipients_campaignId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_campaign_recipients_campaignId" ON public.email_campaign_recipients USING btree ("campaignId");


--
-- Name: idx_email_campaign_recipients_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_recipients_email ON public.email_campaign_recipients USING btree (email);


--
-- Name: idx_email_campaigns_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_campaigns_companyId" ON public.email_campaigns USING btree ("companyId");


--
-- Name: idx_email_campaigns_contactListId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_campaigns_contactListId" ON public.email_campaigns USING btree ("contactListId");


--
-- Name: idx_email_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_status ON public.email_campaigns USING btree (status);


--
-- Name: idx_email_provider_configs_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_provider_configs_companyId" ON public.email_provider_configs USING btree ("companyId");


--
-- Name: idx_email_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_company ON public."AIEmailTemplates" USING btree ("companyId");


--
-- Name: idx_email_templates_company_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_company_type_status ON public.email_templates USING btree ("companyId", type, status);


--
-- Name: idx_email_templates_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_companyid ON public.email_templates USING btree ("companyId");


--
-- Name: idx_email_templates_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_slug ON public."AIEmailTemplates" USING btree (slug);


--
-- Name: idx_email_templates_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_type ON public."AIEmailTemplates" USING btree (type);


--
-- Name: idx_email_tracking_events_campaignId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_tracking_events_campaignId" ON public.email_tracking_events USING btree ("campaignId");


--
-- Name: idx_email_tracking_events_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_tracking_events_companyid ON public.email_tracking_events USING btree ("companyId");


--
-- Name: idx_email_tracking_events_companyid_eventtype; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_tracking_events_companyid_eventtype ON public.email_tracking_events USING btree ("companyId", "eventType");


--
-- Name: idx_email_tracking_events_recipientId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_email_tracking_events_recipientId" ON public.email_tracking_events USING btree ("recipientId");


--
-- Name: idx_fce_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fce_companyId" ON public."FacebookConversionEvents" USING btree ("companyId");


--
-- Name: idx_fce_contactId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fce_contactId" ON public."FacebookConversionEvents" USING btree ("contactId");


--
-- Name: idx_fce_datasetId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fce_datasetId" ON public."FacebookConversionEvents" USING btree ("datasetId");


--
-- Name: idx_fce_eventName; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fce_eventName" ON public."FacebookConversionEvents" USING btree ("eventName");


--
-- Name: idx_fce_responseStatus; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fce_responseStatus" ON public."FacebookConversionEvents" USING btree ("responseStatus");


--
-- Name: idx_fd_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fd_channel ON public."FacebookDatasets" USING btree (channel);


--
-- Name: idx_fd_companyId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fd_companyId" ON public."FacebookDatasets" USING btree ("companyId");


--
-- Name: idx_flow_builders_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flow_builders_company ON public."FlowBuilders" USING btree ("companyId");


--
-- Name: idx_historical_qa_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_company ON public."AIHistoricalQA" USING btree ("companyId");


--
-- Name: idx_historical_qa_company_lang; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_company_lang ON public."AIHistoricalQA" USING btree ("companyId", language, channel);


--
-- Name: idx_historical_qa_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_embedding ON public."AIHistoricalQA" USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');


--
-- Name: idx_historical_qa_norm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_norm ON public."AIHistoricalQA" USING btree ("companyId", "normalizedQuestion");


--
-- Name: idx_historical_qa_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_product ON public."AIHistoricalQA" USING btree ("companyId", "productKey");


--
-- Name: idx_historical_qa_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_tags ON public."AIHistoricalQA" USING gin (tags);


--
-- Name: idx_historical_qa_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_trgm ON public."AIHistoricalQA" USING gin ("normalizedQuestion" public.gin_trgm_ops);


--
-- Name: idx_historical_qa_verified; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_historical_qa_verified ON public."AIHistoricalQA" USING btree ("companyId", verified, superseded);


--
-- Name: idx_impersonation_super_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_impersonation_super_date ON public.impersonation_audits USING btree ("superUserId", "createdAt");


--
-- Name: idx_inbound_event_ledger_company_eventkey_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_inbound_event_ledger_company_eventkey_unique ON public."InboundEventLedger" USING btree ("companyId", "eventKey");


--
-- Name: idx_inbound_event_ledger_company_provider_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_event_ledger_company_provider_time ON public."InboundEventLedger" USING btree ("companyId", provider, "receivedAt");


--
-- Name: idx_inbound_event_ledger_outcome_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_event_ledger_outcome_time ON public."InboundEventLedger" USING btree (outcome, "receivedAt");


--
-- Name: idx_inbound_event_ledger_provider_msg_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_event_ledger_provider_msg_id ON public."InboundEventLedger" USING btree ("providerMessageId");


--
-- Name: idx_inbound_event_ledger_trace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inbound_event_ledger_trace_id ON public."InboundEventLedger" USING btree ("traceId");


--
-- Name: idx_insightsdaily_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insightsdaily_campaign ON public."InsightsDaily" USING btree ("companyId", "campaignId");


--
-- Name: idx_insightsdaily_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insightsdaily_company_date ON public."InsightsDaily" USING btree ("companyId", date);


--
-- Name: idx_invoices_email_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_email_plan ON public."Invoices" USING btree ("isEmailPlan", "emailPlanId");


--
-- Name: idx_kanban_movement_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_movement_company_date ON public."KanbanMovementLogs" USING btree ("companyId", "createdAt");


--
-- Name: idx_kanban_movement_moved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_movement_moved_by ON public."KanbanMovementLogs" USING btree ("movedBy");


--
-- Name: idx_kanban_movement_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_movement_ticket ON public."KanbanMovementLogs" USING btree ("ticketId");


--
-- Name: idx_messages_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_conversation_id ON public."Messages" USING btree ("conversationId");


--
-- Name: idx_messages_externalid_companyid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_externalid_companyid ON public."Messages" USING btree ("externalId", "companyId") WHERE ("externalId" IS NOT NULL);


--
-- Name: idx_messages_provider_externalid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_provider_externalid ON public."Messages" USING btree (provider, "externalId") WHERE ((provider IS NOT NULL) AND ("externalId" IS NOT NULL));


--
-- Name: idx_messages_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_ticket ON public."Messages" USING btree ("ticketId");


--
-- Name: idx_messages_wid_companyid_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_messages_wid_companyid_unique ON public."Messages" USING btree (wid, "companyId") WHERE ((wid IS NOT NULL) AND ("companyId" IS NOT NULL));


--
-- Name: idx_meta_agent_action_logs_company_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_action_logs_company_action ON public."MetaAgentActionLogs" USING btree ("companyId", action);


--
-- Name: idx_meta_agent_action_logs_company_executed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_action_logs_company_executed ON public."MetaAgentActionLogs" USING btree ("companyId", "executedAt");


--
-- Name: idx_meta_agent_action_logs_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_action_logs_plan ON public."MetaAgentActionLogs" USING btree ("planId");


--
-- Name: idx_meta_agent_plans_company_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_plans_company_created ON public."MetaAgentPlans" USING btree ("companyId", "createdAt");


--
-- Name: idx_meta_agent_plans_company_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_plans_company_status ON public."MetaAgentPlans" USING btree ("companyId", status);


--
-- Name: idx_meta_agent_plans_company_wa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_plans_company_wa ON public."MetaAgentPlans" USING btree ("companyId", "whatsappId");


--
-- Name: idx_meta_agent_plans_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_agent_plans_expires ON public."MetaAgentPlans" USING btree ("expiresAt");


--
-- Name: idx_meta_audit_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_audit_company ON public."MetaMarketingAuditLogs" USING btree ("companyId");


--
-- Name: idx_meta_audit_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_audit_company_date ON public.meta_audit_logs USING btree ("companyId", "createdAt");


--
-- Name: idx_meta_audit_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_audit_created ON public."MetaMarketingAuditLogs" USING btree ("createdAt");


--
-- Name: idx_meta_audit_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_audit_status ON public."MetaMarketingAuditLogs" USING btree ("responseStatus");


--
-- Name: idx_meta_official_mcp_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_meta_official_mcp_company ON public."MetaOfficialMcpConnections" USING btree ("companyId");


--
-- Name: idx_meta_official_mcp_oauth_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_official_mcp_oauth_state ON public."MetaOfficialMcpConnections" USING btree ("oauthState");


--
-- Name: idx_meta_official_mcp_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_official_mcp_status ON public."MetaOfficialMcpConnections" USING btree (status);


--
-- Name: idx_notifications_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_category ON public."Notifications" USING btree (category);


--
-- Name: idx_notifications_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_company ON public."Notifications" USING btree ("companyId");


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public."Notifications" USING btree ("userId", "isRead", "createdAt" DESC);


--
-- Name: idx_outbound_dispatches_company_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_dispatches_company_status_time ON public."OutboundDispatches" USING btree ("companyId", status, "requestedAt");


--
-- Name: idx_outbound_dispatches_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_dispatches_conversation ON public."OutboundDispatches" USING btree ("conversationId", "requestedAt" DESC);


--
-- Name: idx_outbound_dispatches_provider_msg_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_dispatches_provider_msg_id ON public."OutboundDispatches" USING btree ("providerMessageId");


--
-- Name: idx_outbound_dispatches_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_dispatches_ticket ON public."OutboundDispatches" USING btree ("ticketId", "requestedAt" DESC);


--
-- Name: idx_outbound_dispatches_trace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_outbound_dispatches_trace_id ON public."OutboundDispatches" USING btree ("traceId");


--
-- Name: idx_prompt_queues_prompt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_queues_prompt ON public."PromptQueues" USING btree ("promptId");


--
-- Name: idx_prompt_queues_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompt_queues_queue ON public."PromptQueues" USING btree ("queueId");


--
-- Name: idx_prompts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prompts_company ON public."Prompts" USING btree ("companyId");


--
-- Name: idx_queues_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_queues_company ON public."Queues" USING btree ("companyId");


--
-- Name: idx_quick_messages_ai_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_messages_ai_enabled ON public."QuickMessages" USING btree ("companyId", "isAiEnabled") WHERE (("isAiEnabled" = true) AND (intent IS NOT NULL));


--
-- Name: idx_quick_messages_ai_intent_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_messages_ai_intent_key ON public."QuickMessages" USING btree ("companyId", "intentKey") WHERE (("isAiEnabled" = true) AND ("intentKey" IS NOT NULL));


--
-- Name: idx_quick_messages_ai_shortcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_messages_ai_shortcode ON public."QuickMessages" USING btree ("companyId", shortcode) WHERE ("isAiEnabled" = true);


--
-- Name: idx_quick_messages_intent_embedding; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quick_messages_intent_embedding ON public."QuickMessages" USING ivfflat ("intentEmbedding" public.vector_cosine_ops) WITH (lists='20');


--
-- Name: idx_recruns_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recruns_company_date ON public.recommendation_runs USING btree ("companyId", "runDate");


--
-- Name: idx_reminder_templates_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reminder_templates_company ON public.reminder_templates USING btree ("companyId");


--
-- Name: idx_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires ON public."Sessions" USING btree ("expiresAt");


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public."Sessions" USING btree ("userId");


--
-- Name: idx_tags_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tags_company ON public."Tags" USING btree ("companyId");


--
-- Name: idx_telegram_queues_telegram; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegram_queues_telegram ON public."TelegramQueues" USING btree ("telegramId");


--
-- Name: idx_telegrams_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_telegrams_company ON public."Telegrams" USING btree ("companyId");


--
-- Name: idx_ticket_tags_ticket; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_tags_ticket ON public."TicketTags" USING btree ("ticketId");


--
-- Name: idx_tickets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_company ON public."Tickets" USING btree ("companyId");


--
-- Name: idx_tickets_company_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_company_origin ON public."Tickets" USING btree ("companyId", "customerOriginId");


--
-- Name: idx_tickets_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_contact ON public."Tickets" USING btree ("contactId");


--
-- Name: idx_tickets_conversation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_conversation_id ON public."Tickets" USING btree ("conversationId");


--
-- Name: idx_tickets_customer_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_customer_origin ON public."Tickets" USING btree ("customerOriginId");


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_status ON public."Tickets" USING btree (status);


--
-- Name: idx_ugc_campaign_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_company ON public."UGCCampaigns" USING btree ("companyId");


--
-- Name: idx_ugc_campaign_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_creator ON public."UGCCampaigns" USING btree ("createdBy");


--
-- Name: idx_ugc_campaign_metrics_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_metrics_campaign ON public."UGCCampaignMetrics" USING btree ("campaignId");


--
-- Name: idx_ugc_campaign_metrics_campaign_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_metrics_campaign_snapshot ON public."UGCCampaignMetrics" USING btree ("campaignId", "snapshotAt");


--
-- Name: idx_ugc_campaign_metrics_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_metrics_company ON public."UGCCampaignMetrics" USING btree ("companyId");


--
-- Name: idx_ugc_campaign_metrics_snapshot; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_metrics_snapshot ON public."UGCCampaignMetrics" USING btree ("snapshotAt");


--
-- Name: idx_ugc_campaign_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaign_status ON public."UGCCampaigns" USING btree (status);


--
-- Name: idx_ugc_campaigns_image_model_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaigns_image_model_key ON public."UGCCampaigns" USING btree ("imageModelKey");


--
-- Name: idx_ugc_campaigns_pipeline_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaigns_pipeline_mode ON public."UGCCampaigns" USING btree ("pipelineMode");


--
-- Name: idx_ugc_campaigns_video_model_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_campaigns_video_model_key ON public."UGCCampaigns" USING btree ("videoModelKey");


--
-- Name: idx_ugc_creative_learnings_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_active ON public."UGCCreativeLearnings" USING btree ("isActive");


--
-- Name: idx_ugc_creative_learnings_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_campaign ON public."UGCCreativeLearnings" USING btree ("campaignId");


--
-- Name: idx_ugc_creative_learnings_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_company ON public."UGCCreativeLearnings" USING btree ("companyId");


--
-- Name: idx_ugc_creative_learnings_impact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_impact ON public."UGCCreativeLearnings" USING btree (impact);


--
-- Name: idx_ugc_creative_learnings_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_source ON public."UGCCreativeLearnings" USING btree (source);


--
-- Name: idx_ugc_creative_learnings_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_learnings_type ON public."UGCCreativeLearnings" USING btree ("learningType");


--
-- Name: idx_ugc_creative_variants_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_variants_campaign ON public."UGCCreativeVariants" USING btree ("ugcCampaignId");


--
-- Name: idx_ugc_creative_variants_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_variants_company ON public."UGCCreativeVariants" USING btree ("companyId");


--
-- Name: idx_ugc_creative_variants_winner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creative_variants_winner ON public."UGCCreativeVariants" USING btree ("isWinner");


--
-- Name: idx_ugc_creator_assignments_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_assignments_campaign ON public."UGCCreatorAssignments" USING btree ("campaignId");


--
-- Name: idx_ugc_creator_assignments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_assignments_company ON public."UGCCreatorAssignments" USING btree ("companyId");


--
-- Name: idx_ugc_creator_assignments_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_assignments_creator ON public."UGCCreatorAssignments" USING btree ("creatorId");


--
-- Name: idx_ugc_creator_assignments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_assignments_status ON public."UGCCreatorAssignments" USING btree (status);


--
-- Name: idx_ugc_creator_payments_assignment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_payments_assignment ON public."UGCCreatorPayments" USING btree ("assignmentId");


--
-- Name: idx_ugc_creator_payments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_payments_company ON public."UGCCreatorPayments" USING btree ("companyId");


--
-- Name: idx_ugc_creator_payments_creator; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_payments_creator ON public."UGCCreatorPayments" USING btree ("creatorId");


--
-- Name: idx_ugc_creator_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creator_payments_status ON public."UGCCreatorPayments" USING btree (status);


--
-- Name: idx_ugc_creators_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creators_company ON public."UGCCreators" USING btree ("companyId");


--
-- Name: idx_ugc_creators_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creators_email ON public."UGCCreators" USING btree (email);


--
-- Name: idx_ugc_creators_niche; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creators_niche ON public."UGCCreators" USING btree (niche);


--
-- Name: idx_ugc_creators_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_creators_status ON public."UGCCreators" USING btree (status);


--
-- Name: idx_ugc_post_comments_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_agent ON public."UGCPostComments" USING btree ("assignedAgentIdentityId");


--
-- Name: idx_ugc_post_comments_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_company ON public."UGCPostComments" USING btree ("companyId");


--
-- Name: idx_ugc_post_comments_from_me; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_from_me ON public."UGCPostComments" USING btree ("fromMe");


--
-- Name: idx_ugc_post_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_parent ON public."UGCPostComments" USING btree ("parentCommentId");


--
-- Name: idx_ugc_post_comments_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_platform ON public."UGCPostComments" USING btree (platform);


--
-- Name: idx_ugc_post_comments_platform_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_platform_id ON public."UGCPostComments" USING btree ("platformCommentId");


--
-- Name: idx_ugc_post_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_post ON public."UGCPostComments" USING btree ("socialPostId");


--
-- Name: idx_ugc_post_comments_reply_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_reply_status ON public."UGCPostComments" USING btree ("autoReplyStatus");


--
-- Name: idx_ugc_post_comments_sentiment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_sentiment ON public."UGCPostComments" USING btree (sentiment);


--
-- Name: idx_ugc_post_comments_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_type ON public."UGCPostComments" USING btree ("commentType");


--
-- Name: idx_ugc_post_comments_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_post_comments_whatsapp ON public."UGCPostComments" USING btree ("whatsappId");


--
-- Name: idx_ugc_social_accounts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_accounts_company ON public."UGCSocialAccounts" USING btree ("companyId");


--
-- Name: idx_ugc_social_accounts_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_accounts_platform ON public."UGCSocialAccounts" USING btree (platform);


--
-- Name: idx_ugc_social_accounts_platform_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_accounts_platform_id ON public."UGCSocialAccounts" USING btree ("platformAccountId");


--
-- Name: idx_ugc_social_accounts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_accounts_status ON public."UGCSocialAccounts" USING btree (status);


--
-- Name: idx_ugc_social_posts_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_account ON public."UGCSocialPosts" USING btree ("socialAccountId");


--
-- Name: idx_ugc_social_posts_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_campaign ON public."UGCSocialPosts" USING btree ("ugcCampaignId");


--
-- Name: idx_ugc_social_posts_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_company ON public."UGCSocialPosts" USING btree ("companyId");


--
-- Name: idx_ugc_social_posts_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_identity ON public."UGCSocialPosts" USING btree ("agentIdentityId");


--
-- Name: idx_ugc_social_posts_platform; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_platform ON public."UGCSocialPosts" USING btree (platform);


--
-- Name: idx_ugc_social_posts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_social_posts_status ON public."UGCSocialPosts" USING btree (status);


--
-- Name: idx_ugc_video_asset_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_asset_company ON public."UGCVideoAssets" USING btree ("companyId");


--
-- Name: idx_ugc_video_asset_job; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_asset_job ON public."UGCVideoAssets" USING btree ("ugcVideoJobId");


--
-- Name: idx_ugc_video_asset_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_asset_type ON public."UGCVideoAssets" USING btree ("assetType");


--
-- Name: idx_ugc_video_job_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_job_campaign ON public."UGCVideoJobs" USING btree ("ugcCampaignId");


--
-- Name: idx_ugc_video_job_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_job_company ON public."UGCVideoJobs" USING btree ("companyId");


--
-- Name: idx_ugc_video_job_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_job_stage ON public."UGCVideoJobs" USING btree (stage);


--
-- Name: idx_ugc_video_job_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_job_status ON public."UGCVideoJobs" USING btree (status);


--
-- Name: idx_ugc_video_jobs_idem; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ugc_video_jobs_idem ON public."UGCVideoJobs" USING btree ("companyId", "idempotencyKey");


--
-- Name: idx_ugc_video_jobs_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ugc_video_jobs_provider ON public."UGCVideoJobs" USING btree ("companyId", provider);


--
-- Name: idx_unified_conversations_company_number_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_unified_conversations_company_number_unique ON public."UnifiedConversations" USING btree ("companyId", "canonicalNumber");


--
-- Name: idx_unified_conversations_company_status_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_unified_conversations_company_status_time ON public."UnifiedConversations" USING btree ("companyId", status, "lastInboundAt");


--
-- Name: idx_usage_company_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_company_date ON public."AIUsageMetrics" USING btree ("companyId", date);


--
-- Name: idx_usage_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usage_period ON public."AIUsageMetrics" USING btree (period, date);


--
-- Name: idx_user_queues_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_queues_user ON public."UserQueues" USING btree ("userId");


--
-- Name: idx_users_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_company ON public."Users" USING btree ("companyId");


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public."Users" USING btree (email);


--
-- Name: idx_webchat_widgets_apikey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_widgets_apikey ON public."WebChatWidgets" USING btree ("apiKey");


--
-- Name: idx_webchat_widgets_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webchat_widgets_company ON public."WebChatWidgets" USING btree ("companyId");


--
-- Name: idx_whatsapp_queues_whatsapp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_queues_whatsapp ON public."WhatsappQueues" USING btree ("whatsappId");


--
-- Name: idx_whatsapps_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapps_company ON public."Whatsapps" USING btree ("companyId");


--
-- Name: whatsapps_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapps_token_hash ON public."Whatsapps" USING btree ("tokenHash");


--
-- Name: klce_companyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_companyId_idx" ON public."KanbanLeadConversionEvents" USING btree ("companyId");


--
-- Name: klce_contactId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_contactId_idx" ON public."KanbanLeadConversionEvents" USING btree ("contactId");


--
-- Name: klce_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_createdAt_idx" ON public."KanbanLeadConversionEvents" USING btree ("createdAt");


--
-- Name: klce_dedupe_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX klce_dedupe_uq ON public."KanbanLeadConversionEvents" USING btree ("companyId", "contactId", "kanbanKey", "eventName");


--
-- Name: klce_eventName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_eventName_idx" ON public."KanbanLeadConversionEvents" USING btree ("eventName");


--
-- Name: klce_kanbanKey_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_kanbanKey_idx" ON public."KanbanLeadConversionEvents" USING btree ("kanbanKey");


--
-- Name: klce_kanbanTagId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_kanbanTagId_idx" ON public."KanbanLeadConversionEvents" USING btree ("kanbanTagId");


--
-- Name: klce_responseStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_responseStatus_idx" ON public."KanbanLeadConversionEvents" USING btree ("responseStatus");


--
-- Name: klce_ticketId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "klce_ticketId_idx" ON public."KanbanLeadConversionEvents" USING btree ("ticketId");


--
-- Name: messages_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX messages_company_id ON public."Messages" USING btree ("companyId");


--
-- Name: plan_credit_allocations_plan_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX plan_credit_allocations_plan_id_idx ON public."PlanCreditAllocations" USING btree ("planId");


--
-- Name: prompts_ai_provider_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prompts_ai_provider_id_idx ON public."Prompts" USING btree ("aiProviderId");


--
-- Name: roles_system_key_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX roles_system_key_uidx ON public."Roles" USING btree (key) WHERE ("companyId" IS NULL);


--
-- Name: tickets_flow_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_flow_state_idx ON public."Tickets" USING btree ("companyId", "flowState", status);


--
-- Name: tickets_followup_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tickets_followup_due_idx ON public."Tickets" USING btree ("nextFollowupAt", "followupEnabled", status) WHERE (("nextFollowupAt" IS NOT NULL) AND ("followupEnabled" = true));


--
-- Name: uniq_comment_response_settings_connection; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_comment_response_settings_connection ON public."CommentResponseSettings" USING btree ("companyId", "whatsappId") WHERE ("socialPostId" IS NULL);


--
-- Name: uniq_comment_response_settings_post; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_comment_response_settings_post ON public."CommentResponseSettings" USING btree ("companyId", "whatsappId", "socialPostId") WHERE ("socialPostId" IS NOT NULL);


--
-- Name: uniq_company_meta_conversion_settings_company_event; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_company_meta_conversion_settings_company_event ON public."CompanyMetaConversionSettings" USING btree ("companyId", "eventKey");


--
-- Name: uniq_messages_companyid_wid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_messages_companyid_wid ON public."Messages" USING btree ("companyId", wid) WHERE (wid IS NOT NULL);


--
-- Name: uniq_tickets_company_conversation_open; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_tickets_company_conversation_open ON public."Tickets" USING btree ("companyId", "conversationId") WHERE (("conversationId" IS NOT NULL) AND ((status)::text = ANY (ARRAY[('open'::character varying)::text, ('pending'::character varying)::text, ('group'::character varying)::text, ('nps'::character varying)::text, ('lgpd'::character varying)::text])));


--
-- Name: web_chat_conversation_messages_company_direction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_conversation_messages_company_direction ON public."WebChatConversationMessages" USING btree ("companyId", direction);


--
-- Name: web_chat_conversation_messages_conversation_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_conversation_messages_conversation_created ON public."WebChatConversationMessages" USING btree ("conversationId", "createdAt");


--
-- Name: web_chat_conversations_company_id_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_conversations_company_id_status ON public."WebChatConversations" USING btree ("companyId", status);


--
-- Name: web_chat_conversations_last_message_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX web_chat_conversations_last_message_at ON public."WebChatConversations" USING btree ("lastMessageAt");


--
-- Name: whatsapp_templates_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_company_id ON public."WhatsAppTemplates" USING btree ("companyId");


--
-- Name: whatsapp_templates_meta_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_meta_id ON public."WhatsAppTemplates" USING btree ("metaTemplateId");


--
-- Name: whatsapp_templates_name_company_language_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX whatsapp_templates_name_company_language_unique ON public."WhatsAppTemplates" USING btree (name, "companyId", language);


--
-- Name: whatsapp_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_status ON public."WhatsAppTemplates" USING btree (status);


--
-- Name: whatsapp_templates_whatsapp_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX whatsapp_templates_whatsapp_id ON public."WhatsAppTemplates" USING btree ("whatsappId");


--
-- Name: contact_memory contact_memory_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER contact_memory_updated_at BEFORE UPDATE ON public.contact_memory FOR EACH ROW EXECUTE FUNCTION public.update_contact_memory_timestamp();


--
-- Name: AIHistoricalQA trg_historical_qa_touch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_historical_qa_touch BEFORE UPDATE ON public."AIHistoricalQA" FOR EACH ROW EXECUTE FUNCTION public.touch_historical_qa_updated_at();


--
-- Name: AIImageCreditTransactions update_ai_image_credits_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_image_credits_updated_at BEFORE UPDATE ON public."AIImageCreditTransactions" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: AIImageGenerations update_ai_image_generations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_image_generations_updated_at BEFORE UPDATE ON public."AIImageGenerations" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: AIImageGenerationItems update_ai_image_items_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_image_items_updated_at BEFORE UPDATE ON public."AIImageGenerationItems" FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: AIABTestVariants AIABTestVariants_testId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIABTestVariants"
    ADD CONSTRAINT "AIABTestVariants_testId_fkey" FOREIGN KEY ("testId") REFERENCES public."AIABTests"(id) ON DELETE CASCADE;


--
-- Name: AIAffiliatePrograms AIAffiliatePrograms_parentAffiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms"
    ADD CONSTRAINT "AIAffiliatePrograms_parentAffiliateId_fkey" FOREIGN KEY ("parentAffiliateId") REFERENCES public."AIAffiliatePrograms"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIAffiliateReferrals AIAffiliateReferrals_affiliateCompanyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals"
    ADD CONSTRAINT "AIAffiliateReferrals_affiliateCompanyId_fkey" FOREIGN KEY ("affiliateCompanyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIAffiliateReferrals AIAffiliateReferrals_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals"
    ADD CONSTRAINT "AIAffiliateReferrals_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."AIAffiliatePrograms"(id) ON DELETE CASCADE;


--
-- Name: AIAffiliateReferrals AIAffiliateReferrals_linkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals"
    ADD CONSTRAINT "AIAffiliateReferrals_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES public."AffiliateLinks"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIAffiliateReferrals AIAffiliateReferrals_rewardClaimedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliateReferrals"
    ADD CONSTRAINT "AIAffiliateReferrals_rewardClaimedBy_fkey" FOREIGN KEY ("rewardClaimedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIAgentAssignments AIAgentAssignments_agentConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentAssignments"
    ADD CONSTRAINT "AIAgentAssignments_agentConfigId_fkey" FOREIGN KEY ("agentConfigId") REFERENCES public."AIAgentConfigs"(id) ON DELETE CASCADE;


--
-- Name: AIAgentAssignments AIAgentAssignments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentAssignments"
    ADD CONSTRAINT "AIAgentAssignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIAgentConfigs AIAgentConfigs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentConfigs"
    ADD CONSTRAINT "AIAgentConfigs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIAgentLogs AIAgentLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentLogs"
    ADD CONSTRAINT "AIAgentLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIAgentLogs AIAgentLogs_parentLogId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAgentLogs"
    ADD CONSTRAINT "AIAgentLogs_parentLogId_fkey" FOREIGN KEY ("parentLogId") REFERENCES public."AIAgentLogs"(id);


--
-- Name: AIChatbotConfigs AIChatbotConfigs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotConfigs"
    ADD CONSTRAINT "AIChatbotConfigs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIChatbotDataSources AIChatbotDataSources_chatbotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDataSources"
    ADD CONSTRAINT "AIChatbotDataSources_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES public."AIChatbotConfigs"(id) ON DELETE CASCADE;


--
-- Name: AIChatbotDataSources AIChatbotDataSources_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDataSources"
    ADD CONSTRAINT "AIChatbotDataSources_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIChatbotDomains AIChatbotDomains_chatbotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChatbotDomains"
    ADD CONSTRAINT "AIChatbotDomains_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES public."AIChatbotConfigs"(id) ON DELETE CASCADE;


--
-- Name: AIChunks AIChunks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChunks"
    ADD CONSTRAINT "AIChunks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIChunks AIChunks_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChunks"
    ADD CONSTRAINT "AIChunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public."AIDocuments"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIChunks AIChunks_parentChunkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIChunks"
    ADD CONSTRAINT "AIChunks_parentChunkId_fkey" FOREIGN KEY ("parentChunkId") REFERENCES public."AIChunks"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AICompanyExtensions AICompanyExtensions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICompanyExtensions"
    ADD CONSTRAINT "AICompanyExtensions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AICompanyExtensions AICompanyExtensions_extensionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICompanyExtensions"
    ADD CONSTRAINT "AICompanyExtensions_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES public."AIExtensions"(id) ON DELETE CASCADE;


--
-- Name: AICreditBalances AICreditBalances_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditBalances"
    ADD CONSTRAINT "AICreditBalances_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AICreditBalances AICreditBalances_creditTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditBalances"
    ADD CONSTRAINT "AICreditBalances_creditTypeId_fkey" FOREIGN KEY ("creditTypeId") REFERENCES public."AICreditTypes"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AICreditTransactions AICreditTransactions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTransactions"
    ADD CONSTRAINT "AICreditTransactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AICreditTransactions AICreditTransactions_creditTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTransactions"
    ADD CONSTRAINT "AICreditTransactions_creditTypeId_fkey" FOREIGN KEY ("creditTypeId") REFERENCES public."AICreditTypes"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AICreditTransactions AICreditTransactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AICreditTransactions"
    ADD CONSTRAINT "AICreditTransactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIDocuments AIDocuments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIDocuments"
    ADD CONSTRAINT "AIDocuments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIEmailTemplates AIEmailTemplates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIEmailTemplates"
    ADD CONSTRAINT "AIEmailTemplates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIHistoricalQA AIHistoricalQA_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIHistoricalQA"
    ADD CONSTRAINT "AIHistoricalQA_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIHistoricalQA AIHistoricalQA_supersededBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIHistoricalQA"
    ADD CONSTRAINT "AIHistoricalQA_supersededBy_fkey" FOREIGN KEY ("supersededBy") REFERENCES public."AIHistoricalQA"(id) ON DELETE SET NULL;


--
-- Name: AIPromptTemplates AIPromptTemplates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIPromptTemplates"
    ADD CONSTRAINT "AIPromptTemplates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIPromptTemplates AIPromptTemplates_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIPromptTemplates"
    ADD CONSTRAINT "AIPromptTemplates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id);


--
-- Name: AIProviderConfigs AIProviderConfigs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIProviderConfigs"
    ADD CONSTRAINT "AIProviderConfigs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AISubplans AISubplans_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISubplans"
    ADD CONSTRAINT "AISubplans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AISupportCorrections AISupportCorrections_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISupportCorrections"
    ADD CONSTRAINT "AISupportCorrections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AISupportCorrections AISupportCorrections_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AISupportCorrections"
    ADD CONSTRAINT "AISupportCorrections_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id);


--
-- Name: AITeamMembers AITeamMembers_teamId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeamMembers"
    ADD CONSTRAINT "AITeamMembers_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES public."AITeams"(id) ON DELETE CASCADE;


--
-- Name: AITeams AITeams_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AITeams"
    ADD CONSTRAINT "AITeams_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIUsageLogs AIUsageLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs"
    ADD CONSTRAINT "AIUsageLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AIUsageLogs AIUsageLogs_providerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs"
    ADD CONSTRAINT "AIUsageLogs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES public."AIProviderConfigs"(id);


--
-- Name: AIUsageLogs AIUsageLogs_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs"
    ADD CONSTRAINT "AIUsageLogs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public."AIPromptTemplates"(id);


--
-- Name: AIUsageLogs AIUsageLogs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIUsageLogs"
    ADD CONSTRAINT "AIUsageLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: AffiliateLinks AffiliateLinks_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateLinks"
    ADD CONSTRAINT "AffiliateLinks_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."AIAffiliatePrograms"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateLinks AffiliateLinks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateLinks"
    ADD CONSTRAINT "AffiliateLinks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateTiers AffiliateTiers_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTiers"
    ADD CONSTRAINT "AffiliateTiers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateTransactions AffiliateTransactions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTransactions"
    ADD CONSTRAINT "AffiliateTransactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateTransactions AffiliateTransactions_walletId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateTransactions"
    ADD CONSTRAINT "AffiliateTransactions_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public."AffiliateWallets"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateWallets AffiliateWallets_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWallets"
    ADD CONSTRAINT "AffiliateWallets_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."AIAffiliatePrograms"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateWallets AffiliateWallets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWallets"
    ADD CONSTRAINT "AffiliateWallets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateWithdrawals AffiliateWithdrawals_affiliateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals"
    ADD CONSTRAINT "AffiliateWithdrawals_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES public."AIAffiliatePrograms"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateWithdrawals AffiliateWithdrawals_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals"
    ADD CONSTRAINT "AffiliateWithdrawals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AffiliateWithdrawals AffiliateWithdrawals_processedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals"
    ADD CONSTRAINT "AffiliateWithdrawals_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AffiliateWithdrawals AffiliateWithdrawals_walletId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AffiliateWithdrawals"
    ADD CONSTRAINT "AffiliateWithdrawals_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public."AffiliateWallets"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentDevices AgentDevices_assignedIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentDevices"
    ADD CONSTRAINT "AgentDevices_assignedIdentityId_fkey" FOREIGN KEY ("assignedIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentDevices AgentDevices_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentDevices"
    ADD CONSTRAINT "AgentDevices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentIdentities AgentIdentities_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentIdentities"
    ADD CONSTRAINT "AgentIdentities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentIdentities AgentIdentities_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentIdentities"
    ADD CONSTRAINT "AgentIdentities_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentInteractions AgentInteractions_agentDeviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentInteractions"
    ADD CONSTRAINT "AgentInteractions_agentDeviceId_fkey" FOREIGN KEY ("agentDeviceId") REFERENCES public."AgentDevices"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AgentInteractions AgentInteractions_agentIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentInteractions"
    ADD CONSTRAINT "AgentInteractions_agentIdentityId_fkey" FOREIGN KEY ("agentIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentInteractions AgentInteractions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentInteractions"
    ADD CONSTRAINT "AgentInteractions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentMemories AgentMemories_agentIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentMemories"
    ADD CONSTRAINT "AgentMemories_agentIdentityId_fkey" FOREIGN KEY ("agentIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentMemories AgentMemories_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentMemories"
    ADD CONSTRAINT "AgentMemories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentProfilePhotos AgentProfilePhotos_agentIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentProfilePhotos"
    ADD CONSTRAINT "AgentProfilePhotos_agentIdentityId_fkey" FOREIGN KEY ("agentIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AgentProfilePhotos AgentProfilePhotos_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AgentProfilePhotos"
    ADD CONSTRAINT "AgentProfilePhotos_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AiTokenTransactions AiTokenTransactions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenTransactions"
    ADD CONSTRAINT "AiTokenTransactions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AiTokenTransactions AiTokenTransactions_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenTransactions"
    ADD CONSTRAINT "AiTokenTransactions_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."AiTokenPlans"(id);


--
-- Name: AiTokenTransactions AiTokenTransactions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AiTokenTransactions"
    ADD CONSTRAINT "AiTokenTransactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: Announcements Announcements_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Announcements"
    ADD CONSTRAINT "Announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ApiUsages ApiUsages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApiUsages"
    ADD CONSTRAINT "ApiUsages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ApplePurchases ApplePurchases_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApplePurchases"
    ADD CONSTRAINT "ApplePurchases_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ApplePurchases ApplePurchases_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ApplePurchases"
    ADD CONSTRAINT "ApplePurchases_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."Plans"(id);


--
-- Name: AttributionChannelAggregates AttributionChannelAggregates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionChannelAggregates"
    ADD CONSTRAINT "AttributionChannelAggregates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AttributionConversions AttributionConversions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionConversions"
    ADD CONSTRAINT "AttributionConversions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AttributionConversions AttributionConversions_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionConversions"
    ADD CONSTRAINT "AttributionConversions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: AttributionResults AttributionResults_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionResults"
    ADD CONSTRAINT "AttributionResults_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AttributionTouchpoints AttributionTouchpoints_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionTouchpoints"
    ADD CONSTRAINT "AttributionTouchpoints_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaigns"(id) ON DELETE SET NULL;


--
-- Name: AttributionTouchpoints AttributionTouchpoints_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionTouchpoints"
    ADD CONSTRAINT "AttributionTouchpoints_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: AttributionTouchpoints AttributionTouchpoints_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AttributionTouchpoints"
    ADD CONSTRAINT "AttributionTouchpoints_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: Baileys Baileys_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Baileys"
    ADD CONSTRAINT "Baileys_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE CASCADE;


--
-- Name: CampaignAlerts CampaignAlerts_acknowledgedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignAlerts"
    ADD CONSTRAINT "CampaignAlerts_acknowledgedBy_fkey" FOREIGN KEY ("acknowledgedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CampaignAlerts CampaignAlerts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignAlerts"
    ADD CONSTRAINT "CampaignAlerts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignMessages CampaignMessages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignMessages CampaignMessages_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignMessages CampaignMessages_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."Messages"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignMessages CampaignMessages_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignMessages CampaignMessages_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignMessages"
    ADD CONSTRAINT "CampaignMessages_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CampaignRecommendations CampaignRecommendations_appliedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRecommendations"
    ADD CONSTRAINT "CampaignRecommendations_appliedBy_fkey" FOREIGN KEY ("appliedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CampaignRecommendations CampaignRecommendations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRecommendations"
    ADD CONSTRAINT "CampaignRecommendations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignRuleLogs CampaignRuleLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRuleLogs"
    ADD CONSTRAINT "CampaignRuleLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: CampaignRuleLogs CampaignRuleLogs_ruleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRuleLogs"
    ADD CONSTRAINT "CampaignRuleLogs_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES public."CampaignRules"(id) ON DELETE CASCADE;


--
-- Name: CampaignRules CampaignRules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRules"
    ADD CONSTRAINT "CampaignRules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: CampaignRules CampaignRules_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignRules"
    ADD CONSTRAINT "CampaignRules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id);


--
-- Name: CampaignSettings CampaignSettings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignSettings"
    ADD CONSTRAINT "CampaignSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: CampaignShipping CampaignShipping_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShipping"
    ADD CONSTRAINT "CampaignShipping_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CampaignShipping CampaignShipping_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShipping"
    ADD CONSTRAINT "CampaignShipping_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."ContactListItems"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: CampaignShippings CampaignShippings_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings"
    ADD CONSTRAINT "CampaignShippings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaigns"(id) ON DELETE CASCADE;


--
-- Name: CampaignShippings CampaignShippings_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CampaignShippings"
    ADD CONSTRAINT "CampaignShippings_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE SET NULL;


--
-- Name: Campaigns Campaigns_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Campaigns Campaigns_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON DELETE SET NULL;


--
-- Name: Campaigns Campaigns_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Campaigns Campaigns_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Campaigns Campaigns_whastsAppTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_whastsAppTemplateId_fkey" FOREIGN KEY ("whastsAppTemplateId") REFERENCES public."WhatsAppTemplates"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Campaigns Campaigns_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Campaigns"
    ADD CONSTRAINT "Campaigns_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: ChatMessages ChatMessages_chatId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessages"
    ADD CONSTRAINT "ChatMessages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES public."Chats"(id) ON DELETE CASCADE;


--
-- Name: ChatMessages ChatMessages_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatMessages"
    ADD CONSTRAINT "ChatMessages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: ChatUsers ChatUsers_chatId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatUsers"
    ADD CONSTRAINT "ChatUsers_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES public."Chats"(id) ON DELETE CASCADE;


--
-- Name: ChatUsers ChatUsers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ChatUsers"
    ADD CONSTRAINT "ChatUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: Chatbots Chatbots_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbots"
    ADD CONSTRAINT "Chatbots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Chatbots Chatbots_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chatbots"
    ADD CONSTRAINT "Chatbots_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Chats Chats_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chats"
    ADD CONSTRAINT "Chats_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Chats Chats_ownerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Chats"
    ADD CONSTRAINT "Chats_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: CommentAutoReplyCampaigns CommentAutoReplyCampaigns_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyCampaigns"
    ADD CONSTRAINT "CommentAutoReplyCampaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: CommentAutoReplyLogs CommentAutoReplyLogs_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyLogs"
    ADD CONSTRAINT "CommentAutoReplyLogs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."CommentAutoReplyCampaigns"(id);


--
-- Name: CommentAutoReplyLogs CommentAutoReplyLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentAutoReplyLogs"
    ADD CONSTRAINT "CommentAutoReplyLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: CommentResponseSettings CommentResponseSettings_aiAgentConfigId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings"
    ADD CONSTRAINT "CommentResponseSettings_aiAgentConfigId_fkey" FOREIGN KEY ("aiAgentConfigId") REFERENCES public."AIAgentConfigs"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CommentResponseSettings CommentResponseSettings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings"
    ADD CONSTRAINT "CommentResponseSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CommentResponseSettings CommentResponseSettings_socialPostId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings"
    ADD CONSTRAINT "CommentResponseSettings_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES public."UGCSocialPosts"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CommentResponseSettings CommentResponseSettings_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CommentResponseSettings"
    ADD CONSTRAINT "CommentResponseSettings_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompaniesSettings CompaniesSettings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompaniesSettings"
    ADD CONSTRAINT "CompaniesSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Companies Companies_activeAISubplanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Companies"
    ADD CONSTRAINT "Companies_activeAISubplanId_fkey" FOREIGN KEY ("activeAISubplanId") REFERENCES public."AISubplans"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Companies Companies_activeEmailPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Companies"
    ADD CONSTRAINT "Companies_activeEmailPlanId_fkey" FOREIGN KEY ("activeEmailPlanId") REFERENCES public."EmailPlans"(id);


--
-- Name: CompanyBillings CompanyBillings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyBillings"
    ADD CONSTRAINT "CompanyBillings_company_id_fkey" FOREIGN KEY (company_id) REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: CompanyEmailPlans CompanyEmailPlans_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyEmailPlans"
    ADD CONSTRAINT "CompanyEmailPlans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: CompanyEmailPlans CompanyEmailPlans_emailPlanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyEmailPlans"
    ADD CONSTRAINT "CompanyEmailPlans_emailPlanId_fkey" FOREIGN KEY ("emailPlanId") REFERENCES public."EmailPlans"(id);


--
-- Name: CompanyMetaConversionSettings CompanyMetaConversionSettings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyMetaConversionSettings"
    ADD CONSTRAINT "CompanyMetaConversionSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompanyTokenUsages CompanyTokenUsages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyTokenUsages"
    ADD CONSTRAINT "CompanyTokenUsages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: CompanyUserQueues CompanyUserQueues_companyUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUserQueues"
    ADD CONSTRAINT "CompanyUserQueues_companyUserId_fkey" FOREIGN KEY ("companyUserId") REFERENCES public."CompanyUsers"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompanyUserQueues CompanyUserQueues_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUserQueues"
    ADD CONSTRAINT "CompanyUserQueues_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompanyUsers CompanyUsers_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers"
    ADD CONSTRAINT "CompanyUsers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: CompanyUsers CompanyUsers_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers"
    ADD CONSTRAINT "CompanyUsers_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Roles"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: CompanyUsers CompanyUsers_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CompanyUsers"
    ADD CONSTRAINT "CompanyUsers_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactBindings ContactBindings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings"
    ADD CONSTRAINT "ContactBindings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ContactBindings ContactBindings_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings"
    ADD CONSTRAINT "ContactBindings_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactBindings ContactBindings_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings"
    ADD CONSTRAINT "ContactBindings_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."UnifiedConversations"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: ContactBindings ContactBindings_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactBindings"
    ADD CONSTRAINT "ContactBindings_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ContactCustomFields ContactCustomFields_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactCustomFields"
    ADD CONSTRAINT "ContactCustomFields_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: ContactListItems ContactListItems_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems"
    ADD CONSTRAINT "ContactListItems_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ContactListItems ContactListItems_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactListItems"
    ADD CONSTRAINT "ContactListItems_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON DELETE CASCADE;


--
-- Name: ContactLists ContactLists_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactLists"
    ADD CONSTRAINT "ContactLists_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ContactTags ContactTags_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: ContactTags ContactTags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTags"
    ADD CONSTRAINT "ContactTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: ContactTemperatures ContactTemperatures_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTemperatures"
    ADD CONSTRAINT "ContactTemperatures_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactTemperatures ContactTemperatures_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactTemperatures"
    ADD CONSTRAINT "ContactTemperatures_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ContactWallets ContactWallets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactWallets"
    ADD CONSTRAINT "ContactWallets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ContactWallets ContactWallets_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactWallets"
    ADD CONSTRAINT "ContactWallets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: ContactWallets ContactWallets_walletId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ContactWallets"
    ADD CONSTRAINT "ContactWallets_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Contacts Contacts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Contacts Contacts_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Contacts"
    ADD CONSTRAINT "Contacts_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: CustomerOrigins CustomerOrigins_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."CustomerOrigins"
    ADD CONSTRAINT "CustomerOrigins_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: DialogChatBots DialogChatBots_chatbotId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DialogChatBots"
    ADD CONSTRAINT "DialogChatBots_chatbotId_fkey" FOREIGN KEY ("chatbotId") REFERENCES public."Chatbots"(id) ON DELETE CASCADE;


--
-- Name: DialogChatBots DialogChatBots_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DialogChatBots"
    ADD CONSTRAINT "DialogChatBots_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: DialogChatBots DialogChatBots_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."DialogChatBots"
    ADD CONSTRAINT "DialogChatBots_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: FacebookConversionEvents FacebookConversionEvents_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."Campaigns"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: FacebookConversionEvents FacebookConversionEvents_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FacebookConversionEvents FacebookConversionEvents_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: FacebookConversionEvents FacebookConversionEvents_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."Messages"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: FacebookConversionEvents FacebookConversionEvents_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookConversionEvents"
    ADD CONSTRAINT "FacebookConversionEvents_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FacebookDatasets FacebookDatasets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookDatasets"
    ADD CONSTRAINT "FacebookDatasets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FacebookDatasets FacebookDatasets_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FacebookDatasets"
    ADD CONSTRAINT "FacebookDatasets_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: FilesOptions FilesOptions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FilesOptions"
    ADD CONSTRAINT "FilesOptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FilesOptions FilesOptions_fileId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FilesOptions"
    ADD CONSTRAINT "FilesOptions_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES public."Files"(id) ON DELETE CASCADE;


--
-- Name: Files Files_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Files"
    ADD CONSTRAINT "Files_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FlowAudios FlowAudios_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowAudios"
    ADD CONSTRAINT "FlowAudios_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FlowAudios FlowAudios_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowAudios"
    ADD CONSTRAINT "FlowAudios_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: FlowBuilders FlowBuilders_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowBuilders"
    ADD CONSTRAINT "FlowBuilders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FlowBuilders FlowBuilders_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowBuilders"
    ADD CONSTRAINT "FlowBuilders_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public."FlowDefaults"(id) ON DELETE CASCADE;


--
-- Name: FlowBuilders FlowBuilders_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowBuilders"
    ADD CONSTRAINT "FlowBuilders_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: FlowCampaigns FlowCampaigns_flowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowCampaigns"
    ADD CONSTRAINT "FlowCampaigns_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES public."FlowDefaults"(id) ON DELETE CASCADE;


--
-- Name: FlowDefaults FlowDefaults_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowDefaults"
    ADD CONSTRAINT "FlowDefaults_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FlowDefaults FlowDefaults_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowDefaults"
    ADD CONSTRAINT "FlowDefaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: FlowImgs FlowImgs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowImgs"
    ADD CONSTRAINT "FlowImgs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: FlowImgs FlowImgs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."FlowImgs"
    ADD CONSTRAINT "FlowImgs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: InboundEventLedger InboundEventLedger_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."InboundEventLedger"
    ADD CONSTRAINT "InboundEventLedger_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: Invoices Invoices_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Invoices"
    ADD CONSTRAINT "Invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_kanbanTagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_kanbanTagId_fkey" FOREIGN KEY ("kanbanTagId") REFERENCES public."Tags"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: KanbanLeadConversionEvents KanbanLeadConversionEvents_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanLeadConversionEvents"
    ADD CONSTRAINT "KanbanLeadConversionEvents_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: KanbanMovementLogs KanbanMovementLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: KanbanMovementLogs KanbanMovementLogs_fromTagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_fromTagId_fkey" FOREIGN KEY ("fromTagId") REFERENCES public."Tags"(id) ON DELETE SET NULL;


--
-- Name: KanbanMovementLogs KanbanMovementLogs_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: KanbanMovementLogs KanbanMovementLogs_toTagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_toTagId_fkey" FOREIGN KEY ("toTagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: KanbanMovementLogs KanbanMovementLogs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."KanbanMovementLogs"
    ADD CONSTRAINT "KanbanMovementLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: LogTickets LogTickets_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LogTickets"
    ADD CONSTRAINT "LogTickets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: LogTickets LogTickets_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LogTickets"
    ADD CONSTRAINT "LogTickets_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: LogTickets LogTickets_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."LogTickets"
    ADD CONSTRAINT "LogTickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Messages Messages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Messages Messages_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: Messages Messages_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."UnifiedConversations"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Messages Messages_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Messages Messages_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: Messages Messages_ticketTrakingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Messages"
    ADD CONSTRAINT "Messages_ticketTrakingId_fkey" FOREIGN KEY ("ticketTrakingId") REFERENCES public."TicketTrakings"(id) ON DELETE SET NULL;


--
-- Name: MetaAgentActionLogs MetaAgentActionLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentActionLogs"
    ADD CONSTRAINT "MetaAgentActionLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MetaAgentActionLogs MetaAgentActionLogs_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentActionLogs"
    ADD CONSTRAINT "MetaAgentActionLogs_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."MetaAgentPlans"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MetaAgentPlans MetaAgentPlans_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentPlans"
    ADD CONSTRAINT "MetaAgentPlans_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: MetaAgentPlans MetaAgentPlans_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentPlans"
    ADD CONSTRAINT "MetaAgentPlans_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: MetaAgentPlans MetaAgentPlans_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaAgentPlans"
    ADD CONSTRAINT "MetaAgentPlans_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: MetaMarketingAuditLogs MetaMarketingAuditLogs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaMarketingAuditLogs"
    ADD CONSTRAINT "MetaMarketingAuditLogs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: MetaMarketingAuditLogs MetaMarketingAuditLogs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaMarketingAuditLogs"
    ADD CONSTRAINT "MetaMarketingAuditLogs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: MetaOfficialMcpConnections MetaOfficialMcpConnections_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."MetaOfficialMcpConnections"
    ADD CONSTRAINT "MetaOfficialMcpConnections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Notifications Notifications_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notifications"
    ADD CONSTRAINT "Notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Notifications Notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Notifications"
    ADD CONSTRAINT "Notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: OutboundDispatches OutboundDispatches_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: OutboundDispatches OutboundDispatches_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."UnifiedConversations"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OutboundDispatches OutboundDispatches_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."Messages"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OutboundDispatches OutboundDispatches_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: OutboundDispatches OutboundDispatches_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."OutboundDispatches"
    ADD CONSTRAINT "OutboundDispatches_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Partners Partners_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Partners"
    ADD CONSTRAINT "Partners_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: PlanCreditAllocations PlanCreditAllocations_creditTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanCreditAllocations"
    ADD CONSTRAINT "PlanCreditAllocations_creditTypeId_fkey" FOREIGN KEY ("creditTypeId") REFERENCES public."AICreditTypes"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PlanCreditAllocations PlanCreditAllocations_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PlanCreditAllocations"
    ADD CONSTRAINT "PlanCreditAllocations_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."Plans"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PromptQueues PromptQueues_promptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptQueues"
    ADD CONSTRAINT "PromptQueues_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES public."Prompts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: PromptQueues PromptQueues_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."PromptQueues"
    ADD CONSTRAINT "PromptQueues_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Prompts Prompts_aiProviderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prompts"
    ADD CONSTRAINT "Prompts_aiProviderId_fkey" FOREIGN KEY ("aiProviderId") REFERENCES public."AIProviderConfigs"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Prompts Prompts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prompts"
    ADD CONSTRAINT "Prompts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Prompts Prompts_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Prompts"
    ADD CONSTRAINT "Prompts_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: QueueIntegrations QueueIntegrations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueIntegrations"
    ADD CONSTRAINT "QueueIntegrations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: QueueOptions QueueOptions_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueOptions"
    ADD CONSTRAINT "QueueOptions_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."QueueOptions"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: QueueOptions QueueOptions_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QueueOptions"
    ADD CONSTRAINT "QueueOptions_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Queues Queues_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Queues Queues_fileListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_fileListId_fkey" FOREIGN KEY ("fileListId") REFERENCES public."Files"(id) ON DELETE SET NULL;


--
-- Name: Queues Queues_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Queues"
    ADD CONSTRAINT "Queues_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."QueueIntegrations"(id) ON DELETE SET NULL;


--
-- Name: QuickMessages QuickMessages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickMessages"
    ADD CONSTRAINT "QuickMessages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: QuickMessages QuickMessages_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."QuickMessages"
    ADD CONSTRAINT "QuickMessages_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Receipts Receipts_aiSubplanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts"
    ADD CONSTRAINT "Receipts_aiSubplanId_fkey" FOREIGN KEY ("aiSubplanId") REFERENCES public."AISubplans"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Receipts Receipts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts"
    ADD CONSTRAINT "Receipts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Receipts Receipts_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts"
    ADD CONSTRAINT "Receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public."Invoices"(id) ON DELETE SET NULL;


--
-- Name: Receipts Receipts_processedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Receipts"
    ADD CONSTRAINT "Receipts_processedBy_fkey" FOREIGN KEY ("processedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Roles Roles_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Roles"
    ADD CONSTRAINT "Roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ScheduledMessagesEnvios ScheduledMessagesEnvios_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessagesEnvios"
    ADD CONSTRAINT "ScheduledMessagesEnvios_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: ScheduledMessagesEnvios ScheduledMessagesEnvios_scheduledmessageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessagesEnvios"
    ADD CONSTRAINT "ScheduledMessagesEnvios_scheduledmessageId_fkey" FOREIGN KEY ("scheduledmessageId") REFERENCES public."ScheduledMessages"(id) ON DELETE CASCADE;


--
-- Name: ScheduledMessages ScheduledMessages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ScheduledMessages"
    ADD CONSTRAINT "ScheduledMessages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Schedules Schedules_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Schedules Schedules_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: Schedules Schedules_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: Schedules Schedules_ticketUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_ticketUserId_fkey" FOREIGN KEY ("ticketUserId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Schedules Schedules_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Schedules"
    ADD CONSTRAINT "Schedules_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: Sessions Sessions_activeCompanyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessions"
    ADD CONSTRAINT "Sessions_activeCompanyId_fkey" FOREIGN KEY ("activeCompanyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Sessions Sessions_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Sessions"
    ADD CONSTRAINT "Sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: Settings Settings_new_companyId_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_new_companyId_fkey1" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Subscriptions Subscriptions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Subscriptions"
    ADD CONSTRAINT "Subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Tags Tags_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tags"
    ADD CONSTRAINT "Tags_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: TelegramQueues TelegramQueues_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelegramQueues"
    ADD CONSTRAINT "TelegramQueues_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE CASCADE;


--
-- Name: Telegrams Telegrams_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Telegrams Telegrams_queueIdImportMessages_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_queueIdImportMessages_fkey" FOREIGN KEY ("queueIdImportMessages") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Telegrams Telegrams_sendIdQueue_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT "Telegrams_sendIdQueue_fkey" FOREIGN KEY ("sendIdQueue") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: TicketNotes TicketNotes_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketNotes"
    ADD CONSTRAINT "TicketNotes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: TicketNotes TicketNotes_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketNotes"
    ADD CONSTRAINT "TicketNotes_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: TicketTags TicketTags_tagId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES public."Tags"(id) ON DELETE CASCADE;


--
-- Name: TicketTags TicketTags_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTags"
    ADD CONSTRAINT "TicketTags_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: TicketTrakings TicketTrakings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: TicketTrakings TicketTrakings_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: TicketTrakings TicketTrakings_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: TicketTrakings TicketTrakings_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: TicketTrakings TicketTrakings_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TicketTrakings"
    ADD CONSTRAINT "TicketTrakings_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Tickets Tickets_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: Tickets Tickets_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."UnifiedConversations"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Tickets Tickets_customerOriginId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_customerOriginId_fkey" FOREIGN KEY ("customerOriginId") REFERENCES public."CustomerOrigins"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_integrationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES public."QueueIntegrations"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_queueOptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_queueOptionId_fkey" FOREIGN KEY ("queueOptionId") REFERENCES public."QueueOptions"(id) ON UPDATE SET NULL ON DELETE SET NULL;


--
-- Name: Tickets Tickets_telegramId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_telegramId_fkey" FOREIGN KEY ("telegramId") REFERENCES public."Telegrams"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE SET NULL;


--
-- Name: Tickets Tickets_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Tickets"
    ADD CONSTRAINT "Tickets_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE CASCADE;


--
-- Name: UGCCampaignMetrics UGCCampaignMetrics_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaignMetrics"
    ADD CONSTRAINT "UGCCampaignMetrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCampaignMetrics UGCCampaignMetrics_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaignMetrics"
    ADD CONSTRAINT "UGCCampaignMetrics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCampaigns UGCCampaigns_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaigns"
    ADD CONSTRAINT "UGCCampaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCampaigns UGCCampaigns_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaigns"
    ADD CONSTRAINT "UGCCampaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCCampaigns UGCCampaigns_modelSelectedBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCampaigns"
    ADD CONSTRAINT "UGCCampaigns_modelSelectedBy_fkey" FOREIGN KEY ("modelSelectedBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCCreativeLearnings UGCCreativeLearnings_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeLearnings"
    ADD CONSTRAINT "UGCCreativeLearnings_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCCreativeLearnings UGCCreativeLearnings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeLearnings"
    ADD CONSTRAINT "UGCCreativeLearnings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreativeVariants UGCCreativeVariants_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeVariants"
    ADD CONSTRAINT "UGCCreativeVariants_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreativeVariants UGCCreativeVariants_ugcCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreativeVariants"
    ADD CONSTRAINT "UGCCreativeVariants_ugcCampaignId_fkey" FOREIGN KEY ("ugcCampaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreatorAssignments UGCCreatorAssignments_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorAssignments"
    ADD CONSTRAINT "UGCCreatorAssignments_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreatorAssignments UGCCreatorAssignments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorAssignments"
    ADD CONSTRAINT "UGCCreatorAssignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreatorAssignments UGCCreatorAssignments_creatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorAssignments"
    ADD CONSTRAINT "UGCCreatorAssignments_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES public."UGCCreators"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreatorPayments UGCCreatorPayments_assignmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorPayments"
    ADD CONSTRAINT "UGCCreatorPayments_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES public."UGCCreatorAssignments"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCCreatorPayments UGCCreatorPayments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorPayments"
    ADD CONSTRAINT "UGCCreatorPayments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreatorPayments UGCCreatorPayments_creatorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreatorPayments"
    ADD CONSTRAINT "UGCCreatorPayments_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES public."UGCCreators"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCCreators UGCCreators_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCCreators"
    ADD CONSTRAINT "UGCCreators_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCPostComments UGCPostComments_assignedAgentIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_assignedAgentIdentityId_fkey" FOREIGN KEY ("assignedAgentIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCPostComments UGCPostComments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCPostComments UGCPostComments_parentCommentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_parentCommentId_fkey" FOREIGN KEY ("parentCommentId") REFERENCES public."UGCPostComments"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCPostComments UGCPostComments_socialPostId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_socialPostId_fkey" FOREIGN KEY ("socialPostId") REFERENCES public."UGCSocialPosts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCPostComments UGCPostComments_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCPostComments"
    ADD CONSTRAINT "UGCPostComments_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCSocialAccounts UGCSocialAccounts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialAccounts"
    ADD CONSTRAINT "UGCSocialAccounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCSocialPosts UGCSocialPosts_agentIdentityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_agentIdentityId_fkey" FOREIGN KEY ("agentIdentityId") REFERENCES public."AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCSocialPosts UGCSocialPosts_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCSocialPosts UGCSocialPosts_socialAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES public."UGCSocialAccounts"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCSocialPosts UGCSocialPosts_ugcCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_ugcCampaignId_fkey" FOREIGN KEY ("ugcCampaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCSocialPosts UGCSocialPosts_ugcVideoJobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCSocialPosts"
    ADD CONSTRAINT "UGCSocialPosts_ugcVideoJobId_fkey" FOREIGN KEY ("ugcVideoJobId") REFERENCES public."UGCVideoJobs"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UGCVideoAssets UGCVideoAssets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoAssets"
    ADD CONSTRAINT "UGCVideoAssets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCVideoAssets UGCVideoAssets_ugcCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoAssets"
    ADD CONSTRAINT "UGCVideoAssets_ugcCampaignId_fkey" FOREIGN KEY ("ugcCampaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCVideoAssets UGCVideoAssets_ugcVideoJobId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoAssets"
    ADD CONSTRAINT "UGCVideoAssets_ugcVideoJobId_fkey" FOREIGN KEY ("ugcVideoJobId") REFERENCES public."UGCVideoJobs"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCVideoJobs UGCVideoJobs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoJobs"
    ADD CONSTRAINT "UGCVideoJobs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCVideoJobs UGCVideoJobs_ugcCampaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoJobs"
    ADD CONSTRAINT "UGCVideoJobs_ugcCampaignId_fkey" FOREIGN KEY ("ugcCampaignId") REFERENCES public."UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: UGCVideoJobs UGCVideoJobs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UGCVideoJobs"
    ADD CONSTRAINT "UGCVideoJobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UnifiedConversations UnifiedConversations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UnifiedConversations"
    ADD CONSTRAINT "UnifiedConversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: UnifiedConversations UnifiedConversations_primaryContactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UnifiedConversations"
    ADD CONSTRAINT "UnifiedConversations_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: UserQueues UserQueues_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues"
    ADD CONSTRAINT "UserQueues_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE CASCADE;


--
-- Name: UserQueues UserQueues_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserQueues"
    ADD CONSTRAINT "UserQueues_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: UserRatings UserRatings_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRatings"
    ADD CONSTRAINT "UserRatings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: UserRatings UserRatings_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRatings"
    ADD CONSTRAINT "UserRatings_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id) ON DELETE CASCADE;


--
-- Name: UserRatings UserRatings_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."UserRatings"
    ADD CONSTRAINT "UserRatings_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: Users Users_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Users Users_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Users"
    ADD CONSTRAINT "Users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public."Roles"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebChatConversationMessages WebChatConversationMessages_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversationMessages"
    ADD CONSTRAINT "WebChatConversationMessages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebChatConversationMessages WebChatConversationMessages_conversationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversationMessages"
    ADD CONSTRAINT "WebChatConversationMessages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."WebChatConversations"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebChatConversationMessages WebChatConversationMessages_senderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversationMessages"
    ADD CONSTRAINT "WebChatConversationMessages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebChatConversations WebChatConversations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversations"
    ADD CONSTRAINT "WebChatConversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebChatConversations WebChatConversations_widgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatConversations"
    ADD CONSTRAINT "WebChatConversations_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES public."WebChatWidgets"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebChatWidgets WebChatWidgets_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets"
    ADD CONSTRAINT "WebChatWidgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WebChatWidgets WebChatWidgets_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets"
    ADD CONSTRAINT "WebChatWidgets_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WebChatWidgets WebChatWidgets_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WebChatWidgets"
    ADD CONSTRAINT "WebChatWidgets_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: Webhooks Webhooks_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Webhooks"
    ADD CONSTRAINT "Webhooks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: WhatsAppTemplates WhatsAppTemplates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsAppTemplates"
    ADD CONSTRAINT "WhatsAppTemplates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: WhatsAppTemplates WhatsAppTemplates_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsAppTemplates"
    ADD CONSTRAINT "WhatsAppTemplates_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: WhatsappQueues WhatsappQueues_queueId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues"
    ADD CONSTRAINT "WhatsappQueues_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES public."Queues"(id) ON DELETE CASCADE;


--
-- Name: WhatsappQueues WhatsappQueues_whatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."WhatsappQueues"
    ADD CONSTRAINT "WhatsappQueues_whatsappId_fkey" FOREIGN KEY ("whatsappId") REFERENCES public."Whatsapps"(id) ON DELETE CASCADE;


--
-- Name: Whatsapps Whatsapps_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: Whatsapps Whatsapps_linkedWhatsappId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Whatsapps"
    ADD CONSTRAINT "Whatsapps_linkedWhatsappId_fkey" FOREIGN KEY ("linkedWhatsappId") REFERENCES public."Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointment_ai_suggestions appointment_ai_suggestions_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions
    ADD CONSTRAINT "appointment_ai_suggestions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointment_ai_suggestions appointment_ai_suggestions_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions
    ADD CONSTRAINT "appointment_ai_suggestions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id);


--
-- Name: appointment_ai_suggestions appointment_ai_suggestions_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions
    ADD CONSTRAINT "appointment_ai_suggestions_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.appointment_services(id);


--
-- Name: appointment_ai_suggestions appointment_ai_suggestions_suggestedUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_ai_suggestions
    ADD CONSTRAINT "appointment_ai_suggestions_suggestedUserId_fkey" FOREIGN KEY ("suggestedUserId") REFERENCES public."Users"(id);


--
-- Name: appointment_analytics appointment_analytics_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_analytics
    ADD CONSTRAINT "appointment_analytics_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointment_analytics appointment_analytics_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_analytics
    ADD CONSTRAINT "appointment_analytics_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.appointment_services(id);


--
-- Name: appointment_analytics appointment_analytics_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_analytics
    ADD CONSTRAINT "appointment_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: appointment_availability appointment_availability_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_availability
    ADD CONSTRAINT "appointment_availability_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointment_availability appointment_availability_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_availability
    ADD CONSTRAINT "appointment_availability_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.appointment_services(id);


--
-- Name: appointment_availability appointment_availability_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_availability
    ADD CONSTRAINT "appointment_availability_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: appointment_calendar_sync appointment_calendar_sync_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_sync
    ADD CONSTRAINT "appointment_calendar_sync_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointment_calendar_sync appointment_calendar_sync_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_sync
    ADD CONSTRAINT "appointment_calendar_sync_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: appointment_calendar_syncs appointment_calendar_syncs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_syncs
    ADD CONSTRAINT "appointment_calendar_syncs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: appointment_calendar_syncs appointment_calendar_syncs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_calendar_syncs
    ADD CONSTRAINT "appointment_calendar_syncs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON DELETE CASCADE;


--
-- Name: appointment_reminders appointment_reminders_appointmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT "appointment_reminders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES public.appointments(id) ON DELETE CASCADE;


--
-- Name: appointment_reminders appointment_reminders_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_reminders
    ADD CONSTRAINT "appointment_reminders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointment_services appointment_services_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointment_services
    ADD CONSTRAINT "appointment_services_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: appointments appointments_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id);


--
-- Name: appointments appointments_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id);


--
-- Name: appointments appointments_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id);


--
-- Name: appointments appointments_serviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES public.appointment_services(id);


--
-- Name: appointments appointments_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public."Tickets"(id);


--
-- Name: appointments appointments_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT "appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."Users"(id);


--
-- Name: contact_memory contact_memory_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_memory
    ADD CONSTRAINT contact_memory_company_id_fkey FOREIGN KEY (company_id) REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- Name: contact_memory contact_memory_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_memory
    ADD CONSTRAINT contact_memory_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public."Contacts"(id) ON DELETE CASCADE;


--
-- Name: contact_memory contact_memory_source_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_memory
    ADD CONSTRAINT contact_memory_source_ticket_id_fkey FOREIGN KEY (source_ticket_id) REFERENCES public."Tickets"(id) ON DELETE SET NULL;


--
-- Name: email_ab_tests email_ab_tests_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_ab_tests
    ADD CONSTRAINT "email_ab_tests_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.email_campaigns(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: email_ab_tests email_ab_tests_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_ab_tests
    ADD CONSTRAINT "email_ab_tests_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: email_ab_tests email_ab_tests_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_ab_tests
    ADD CONSTRAINT "email_ab_tests_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_automations email_automations_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT "email_automations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: email_automations email_automations_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT "email_automations_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_automations email_automations_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT "email_automations_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_automations email_automations_emailTemplateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_automations
    ADD CONSTRAINT "email_automations_emailTemplateId_fkey" FOREIGN KEY ("emailTemplateId") REFERENCES public.email_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_campaign_recipients email_campaign_recipients_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT "email_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.email_campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT "email_campaign_recipients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_campaign_recipients email_campaign_recipients_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_recipients
    ADD CONSTRAINT "email_campaign_recipients_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public."Contacts"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT "email_campaigns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_campaigns email_campaigns_contactListId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT "email_campaigns_contactListId_fkey" FOREIGN KEY ("contactListId") REFERENCES public."ContactLists"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT "email_campaigns_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_campaigns email_campaigns_templateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT "email_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES public.email_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_provider_configs email_provider_configs_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_provider_configs
    ADD CONSTRAINT "email_provider_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_templates email_templates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT "email_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_templates email_templates_createdBy_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT "email_templates_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: email_tracking_events email_tracking_events_campaignId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tracking_events
    ADD CONSTRAINT "email_tracking_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES public.email_campaigns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_tracking_events email_tracking_events_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tracking_events
    ADD CONSTRAINT "email_tracking_events_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: email_tracking_events email_tracking_events_recipientId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_tracking_events
    ADD CONSTRAINT "email_tracking_events_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES public.email_campaign_recipients(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIAffiliatePrograms fk_affiliate_programs_tier; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIAffiliatePrograms"
    ADD CONSTRAINT fk_affiliate_programs_tier FOREIGN KEY ("tierId") REFERENCES public."AffiliateTiers"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIImageCreditTransactions fk_ai_image_credits_company; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageCreditTransactions"
    ADD CONSTRAINT fk_ai_image_credits_company FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIImageCreditTransactions fk_ai_image_credits_generation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageCreditTransactions"
    ADD CONSTRAINT fk_ai_image_credits_generation FOREIGN KEY ("aiImageGenerationId") REFERENCES public."AIImageGenerations"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIImageCreditTransactions fk_ai_image_credits_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageCreditTransactions"
    ADD CONSTRAINT fk_ai_image_credits_user FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIImageGenerations fk_ai_image_gen_company; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerations"
    ADD CONSTRAINT fk_ai_image_gen_company FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIImageGenerations fk_ai_image_gen_provider; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerations"
    ADD CONSTRAINT fk_ai_image_gen_provider FOREIGN KEY ("aiProviderConfigId") REFERENCES public."AIProviderConfigs"(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: AIImageGenerations fk_ai_image_gen_user; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerations"
    ADD CONSTRAINT fk_ai_image_gen_user FOREIGN KEY ("userId") REFERENCES public."Users"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIImageGenerationItems fk_ai_image_item_generation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIImageGenerationItems"
    ADD CONSTRAINT fk_ai_image_item_generation FOREIGN KEY ("aiImageGenerationId") REFERENCES public."AIImageGenerations"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: AIVideoCreditTransactions fk_ai_video_credits_generation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoCreditTransactions"
    ADD CONSTRAINT fk_ai_video_credits_generation FOREIGN KEY ("aiVideoGenerationId") REFERENCES public."AIVideoGenerations"(id) ON DELETE SET NULL;


--
-- Name: AIVideoGenerationItems fk_ai_video_items_generation; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."AIVideoGenerationItems"
    ADD CONSTRAINT fk_ai_video_items_generation FOREIGN KEY ("aiVideoGenerationId") REFERENCES public."AIVideoGenerations"(id) ON DELETE CASCADE;


--
-- Name: appointments fk_appointments_reminder_template; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_appointments_reminder_template FOREIGN KEY ("reminderTemplateId") REFERENCES public.reminder_templates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: appointments fk_rescheduled_from; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_rescheduled_from FOREIGN KEY ("rescheduledFrom") REFERENCES public.appointments(id);


--
-- Name: appointments fk_rescheduled_to; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.appointments
    ADD CONSTRAINT fk_rescheduled_to FOREIGN KEY ("rescheduledTo") REFERENCES public.appointments(id);


--
-- Name: TelegramQueues fk_telegram_queues_telegram; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."TelegramQueues"
    ADD CONSTRAINT fk_telegram_queues_telegram FOREIGN KEY ("telegramId") REFERENCES public."Telegrams"(id) ON DELETE CASCADE;


--
-- Name: Telegrams fk_telegrams_flow_not_phrase; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT fk_telegrams_flow_not_phrase FOREIGN KEY ("flowIdNotPhrase") REFERENCES public."FlowBuilders"(id) ON DELETE SET NULL;


--
-- Name: Telegrams fk_telegrams_flow_welcome; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT fk_telegrams_flow_welcome FOREIGN KEY ("flowIdWelcome") REFERENCES public."FlowBuilders"(id) ON DELETE SET NULL;


--
-- Name: Telegrams fk_telegrams_integration; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT fk_telegrams_integration FOREIGN KEY ("integrationId") REFERENCES public."QueueIntegrations"(id) ON DELETE SET NULL;


--
-- Name: Telegrams fk_telegrams_prompt; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Telegrams"
    ADD CONSTRAINT fk_telegrams_prompt FOREIGN KEY ("promptId") REFERENCES public."Prompts"(id) ON DELETE SET NULL;


--
-- Name: integration_api_requests integration_api_requests_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_api_requests
    ADD CONSTRAINT "integration_api_requests_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.integration_connections(id);


--
-- Name: integration_connections integration_connections_providerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_connections
    ADD CONSTRAINT "integration_connections_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES public.integration_providers(id);


--
-- Name: integration_entity_mappings integration_entity_mappings_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_entity_mappings
    ADD CONSTRAINT "integration_entity_mappings_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.integration_connections(id);


--
-- Name: integration_sync_logs integration_sync_logs_connectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_sync_logs
    ADD CONSTRAINT "integration_sync_logs_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES public.integration_connections(id);


--
-- Name: integration_webhook_events integration_webhook_events_providerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_webhook_events
    ADD CONSTRAINT "integration_webhook_events_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES public.integration_providers(id);


--
-- Name: reminder_templates reminder_templates_companyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates
    ADD CONSTRAINT "reminder_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES public."Companies"(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--



--
-- Registro de migraciones ya aplicadas (SequelizeMeta), copiado de producción.
--
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260416120000-add-metrics-to-campaign-shipping.ts');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200717133438-create-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200717144403-create-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200717145643-create-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200717151645-create-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200717170223-create-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200723200315-create-contacts-custom-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260427000002-add-message-permissions-to-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260429000001-affiliate-rewards-tokens-days.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260501100001-add-expiration-alert-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260501100002-add-expiration-tracking-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260501110001-create-notifications.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260501110002-add-notifyNewAppointments-to-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260504120001-create-meta-agent-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260504120002-create-meta-agent-action-logs.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260504130001-seed-meta-ads-optimizer-agent.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260505100001-add-email-marketing-provider-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260505110001-add-meta-official-mcp-fields-to-companies-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260506100001-create-meta-official-mcp-connections.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260507100001-add-flow-and-followup-to-tickets.ts');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260428000001-add-allow-recurring-payments-to-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260507100001-add-flow-and-followup-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260509100001-add-unique-index-messages-wid-companyid.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260528100001-create-kanban-lead-conversion-events.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260609000001-add-meta-conversion-to-tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260612100000-create-comment-response-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260612100001-add-page-token-to-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260612100002-add-moderation-flags-to-ugc-post-comments.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260624120000-add-generation-fields-to-ugc-video-jobs.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260701000001-create-company-meta-conversion-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260703000001-create-webchat-conversations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260707000001-add-whatsapp-valid-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200723202116-add-email-field-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200730153237-remove-user-association-from-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200730153545-add-fromMe-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200813114236-change-ticket-lastMessage-column-type.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200901235509-add-profile-column-to-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200903215941-create-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200904220257-add-name-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200906122228-add-name-default-field-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200906155658-add-whatsapp-field-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200919124112-update-default-column-name-on-whatsappp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200927220708-add-isDeleted-column-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200929145451-add-user-tokenVersion-column.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200930162323-add-isGroup-column-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20200930194808-add-isGroup-column-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20201004150008-add-contactId-column-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20201004155719-add-vcardContactId-column-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20201004955719-remove-vcardContactId-column-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20201026215410-add-retries-to-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20201028124427-add-quoted-msg-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210108001431-add-unreadMessages-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210108164404-create-queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210108164504-add-queueId-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210108174594-associate-whatsapp-queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210108204708-associate-users-queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192513-add-greetingMessage-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192514-create-companies-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192515-add-column-companyId-to-Settings-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192516-add-column-companyId-to-Users-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192517-add-column-companyId-to-Contacts-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192518-add-column-companyId-to-Messages-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192519-add-column-companyId-to-Queues-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192520-add-column-companyId-to-Whatsapps-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192521-add-column-companyId-to-Tickets-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192522-create-plans-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192523-add-column-amount-to-Plan.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192523-add-column-planId-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192523-add-column-status-and-schedules-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192523-create-ticket-notes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192524-create-quick-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192525-add-column-complationMessage-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192526-add-column-outOfHoursMessage-to-whatsapp');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192527-add-column-super-to-Users-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192528-change-column-message-to-quick-messages-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192529-create-helps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192531-create-TicketTracking-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192532-add-column-online-to-Users-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192533-create-UserRatings-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210109192534-add-rated-to-TicketTraking.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210818102606-add-uuid-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20210818102609-add-token-to-Whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20211017014719-create-chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20211017014721-create-dialog-chatbot.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20211205164404-create-queue-options.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20211212125704-add-chatbot-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20211227010200-create-schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20212016014719-add-bot-ticket.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20212016014719-add-queueId-dialog.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220115114088-add-column-userId-to-QuickMessages-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220117130000-create-tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220117134400-associate-tickets-tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220122160900-add-status-to-schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220220014719-add-farewellMessage-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220221014717-add-provider-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220221014718-add-remoteJid-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220221014719-add-jsonMessage-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220221014720-add-participant-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220221014721-create-baileys.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220315110000-create-ContactLists-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220315110001-create-ContactListItems-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220315110002-create-Campaigns-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220315110004-create-CampaignSettings-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220321130000-create-CampaignShipping.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220404000000-add-column-queueId-to-Messages-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220406000000-add-column-dueDate-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220406000001-add-column-recurrence-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220411000000-add-column-startTime-and-endTime-to-Queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220411000001-remove-column-startTime-and-endTime-to-Queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220411000002-add-column-schedules-and-outOfHoursMessage-to-Queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220411000003-create-table-Announcements.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220425000000-create-table-Chats.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220425000001-create-table-ChatUsers.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220425000002-create-table-ChatMessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220512000001-create-Indexes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220723000001-add-mediaPath-to-quickmessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220723000002-add-mediaName-to-quickemessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20220723000003-add-geral-to-quickmessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20221123155118-add-acceptAudioMessages-to-contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20221227164300-add-colunms-document-and-paymentMethod-to-companies-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20221229000000-add-column-number-to-Whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-channel-session.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-channel-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-channel-token.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-channel-tokenUser.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-channel-to-ticket.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-facebookPageUserId-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-facebookUserId-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20222016014719-add-isAgent-chatbot.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230105164900-add-useFacebook-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230105164900-add-useInstagram-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230105164900-add-useWhatsapp-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230106164900-add-useCampaigns-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230106164900-add-useExternalApi-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230106164900-add-useInternalChat-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230106164900-add-useSchedules-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230110072000-create-integrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230119000002-create-subscriptions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230119000003-create-invoices.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230120000000-create-ApiUsage.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230123155600-add-colunms-lastLogin-to-companies-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230124110200-add-endWork-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230124110200-add-startWork-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230127091500-add-column-active-to-Contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230216173900-add-uuid-extension.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230301110200-add-color-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230301110201-add-farewellMessage-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230303223000-add-maxUseBotQueues-to-whatsapp');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230303223001-add-amountUsedBotQueues-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230403193000-add-disable-bot-column-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230403193000-add-expiresTicket-fields-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230411131007-add-allowGroup-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230505221007-add-closedAt-TicketTraking.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230517221007-add-optQueueId-Chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230517221007-add-optUserId-chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230517221007-add-queueType-Chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230603212335-create-QueueIntegrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230603212337-add-QueueIntegrations-integrationId-Chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230603212337-add-urlN8N-QueueIntegrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230612221007-add-remoteJid-Contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230623095932-add-whatsapp-to-user.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230623113000-add-timeUseBotQueues-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230623133903-add-chatbotAt-ticket-tracking.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230626141100-add-column-ticketTrakingId-to-Messages-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230628134807-add-orderQueue-Queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230630150600-create-associate-contacttags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230703221100-add-column-queueId-to-TicketTraking-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230704124428-update-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230707221100-add-column-isPrivate-to-Message-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230711080001-create-Index-Message-wid.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230711094417-add-column-companyId-to-QueueIntegrations-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230711111700-add-timeSendQueue-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230711111701-add-sendIdQueue-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230713131510-add-tempoRoteador-Queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230714113901-create-Files.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230714113902-create-fileOptions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230716229907-add-ativaRoteador-Queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230717113705-add-isEdited-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230717221007-add-optFileId-chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230723301001-add-kanban-to-Tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230724111007-add-collumns-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230724192535-add-column-ratingMessage-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230726203900-add-allTickets-user.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230731214345-create-table-webhooks.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230731224345-add-active-table-webhooks.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230731331007-add-lgpdAccept-Contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230801081907-add-collumns-Ticket.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230802214345-create-table-flowbuilder.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230807081007-add-lgpdAccept-Ticket.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230808135401-add-groupAsTicket-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230808141907-add-collumns-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081007-add-import-old-messages-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081007-add-import-recent-messages-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081008-add-status-import-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081009-add-closed-tickets-post-imported-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081010-add-import-old-messages-groups-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081011-add-imported-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230809081012-change-name-unique-false-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230810224345-add-company-table-webhooks.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230810234345-add-company-table-flowbuilder.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230813114236-change-ticket-lastMessage-column-type.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230816212401-add-timeCreateNewTicket-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230823082607-add-urlPicture-Contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230823114236-add-column-flow-and-location.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230823124236-add-column-data.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230823134236-add-column-hashflow.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230824082607-add-mediaType-FilesOptions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230824134719-add-greetingMediaAtachmentToWhatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230825080921-add-profile-image-to-user.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230828143411-add-Integrations-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230828143411-add-isOutOfHour-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230828144000-create-prompts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230828144100-add-column-promptid-into-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230829214345-create-table-imgs-flow.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230831093000-add-useKanban-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230901101300-create-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230901214345-create-table-audios-flow.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230902082607-add-pictureUpdate-Contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230904214345-create-table-campaign-flow.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230905114236-add-column-flow-now.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230911113900-add-unaccent-extension.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230911143705-add-isForwarded-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230912112028-insert-CompanieSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230913210007-create-table-LogTickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230915212800-add-public-to-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230922212337-add-integrationId-Queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230922214345-create-table-flow-default.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230923000001-create-Indexes-new.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230923124428-update-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230924212337-add-fileListId-Queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230925112401-create-Indexes');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230925212337-add-closeTicket-Queues-Chatbots.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20230926143705-add-isGroup-to-ContactListItems.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231008145702-add-column-schedules-to-Whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231016214537-add-allHistoric-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231019113637-add-columns-Campaign.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231019113637-add-columns-Schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231020125000-add-columns-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231103230445-change-collumn-expiresInactiveMessage.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231105221305-add-visao-to-quickMessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231110214537-add-allUserChat-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231114113637-add-openTicket-Campaign.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231114113637-add-openTicket-Schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231117000001-add-mediaName-to-schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231117000001-add-mediaPath-to-schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231121143411-add-isActiveDemand-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231122193355-create-table-wallets-contact.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231122223411-add-DirectTicketsToWallets-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231127113000-add-columns-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231128123537-add-typebot-QueueIntegrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231201123411-add-closeTicketOnTransfer-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231202143411-add-typebotSessionId-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231207080337-add-typebotDelayMessage-QueueIntegrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231207085011-add-typebotStatus-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231213214537-add-permissions-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231218160937-add-columns-QueueIntegrations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231220080937-add-columns-Whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231220223517-add-column-whatsappId-to-Contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231221080937-change-collectiveVacationMessage-Whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20231229214537-add-defaultTicketsManagerWidth-Users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20232010133900-create-Partners-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240102230240-create-ScheduledMessagesEnvio.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240102230240-create-ScheduledMessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240102230241-create-ContactGroup.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240111080937-change-profilePicUrl-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240125080937-change-urlPicture-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240202110037-add-collumns-custommessages-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240206110037-add-linkInvoice-to-Invoices.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240212113637-add-recorrencia-Schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240308133648-add-columns-to-Tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240308133648-add-rollbackLaneId-to-Tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240311125600-add-colunms-folderSize-to-companies-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240322143411-add-queueIdImportMessage-to-whatsapps.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240323220001-create-companyId-Index-Message.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240422214537-add-permissions-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240425223411-add-showNotificationPending-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240425225011-add-typebotSsessionTime-to-tickets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240515221400-create-Versions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240516112028-insert-version.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240523083535-create-index.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240610083535-create-index.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240718030548-add-column-flowIdNotPhrase-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240718084127-recriate-constraint-integracoes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240719130841-add-column-flowIdWelcome-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240719174849-add-column-whatsappId-to-flowCampaigns.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20240924171945-add-variables-column-to-flowbuilders.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20241220000001-add-payment-method-to-invoices.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000000-create-sessions-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000000-implement-multi-tenant-schema.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000001-create-media-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000001-create-tenants-table.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000002-create-company-billing.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000003-create-invoices.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000004-create-refunds.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000005-create-lead-sources.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000006-create-audits.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250101000007-add-indexes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250115000000-add-isPinned-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250115000001-add-isPinned-companyId-to-chatmessages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250819-alter-sessions-add-clientType-deviceId.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250930000001-create-ai-token-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250930000002-create-ai-token-wallets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20250930000003-create-ai-token-transactions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251010000000-add-id-column-to-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251012000000-add-marketing-leads-to-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251022000000-add-uuid-to-chats.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251128000001-create-PromptQueues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251204000001-create-company-token-usage.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251210120000-create-webchat-widgets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251218000001-add-interfacePermissions-to-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251222000001-create-receipts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251222000002-create-apple-purchases.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251222000003-add-payment-api-keys-to-Companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251222000004-add-payment-provider-ids-to-Plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20251229000001-add-composite-indexes-to-contacts.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260119000001-add-facebook-ads-fields-to-whatsapp.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260121000001-add-ai-token-balance-to-company.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260121000001-create-campaign-recommendations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260123000001-create-ai-token-plans.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260128000001-create-campaign-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260211000001-add-theme-colors-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000001-create-ai-entities.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000002-create-ai-documents.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000003-create-ai-chunks.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000004-create-ai-semantic-cache.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000005-create-ai-credit-types.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228000006-create-ai-credit-balances.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228100001-create-plan-credit-allocations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228200003-add-referral-to-companies.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260228210001-add-name-description-to-affiliate-programs.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260301000001-add-reset-password-to-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260301100001-add-new-company-alert-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260301200001-create-ugc-phase1-tables.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260301300001-add-coexistence-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302000001-create-kanban-movement-log.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302000002-add-timeLaneUnit-to-tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302000003-add-aiCacheTTL.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100001-enhance-affiliate-programs-mlm.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100002-create-affiliate-tiers.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100003-create-affiliate-wallets.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100004-create-affiliate-transactions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100005-create-affiliate-withdrawals.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302100006-create-affiliate-links.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302200001-create-ai-credit-transactions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302300001-add-tiktok-channel-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260302400001-add-cloudapi-enabled-to-companies-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260309000000-add-agent-ia-fields-to-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260319000001-add-message-pending-status.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260319000001-add-template-fields-campaigns.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260319000003-sessions-policy-indexes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260324000001-add-google-drive-to-CompaniesSettings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260325000001-add-aiGuidance-to-tags.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260406000001-fix-queue-unique-constraints-scoped.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260407000001-add-missing-columns-to-flowcampaigns.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260416000000-make-ticketId-nullable-in-schedules.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260416120000-add-metrics-to-campaign-shipping.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260417000001-add-indexes-to-campaign-messages-for-audit.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260421000001-create-inbound-event-ledger.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260421000002-create-coexistence-identity.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260421000003-create-outbound-dispatches.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260427000001-add-ai-token-receipt-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260503180001-seed-ai-credit-types-pricing-unified.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260503183002-backfill-ai-credit-pricing-allocations.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260504000001-add-coexistence-routing-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260513120000-add-model-selection-to-ugc-campaigns.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260514100000-add-pipeline-mode-to-ugc-campaigns.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260519000001-create-ai-historical-qa.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260520000010-create-ai-correction-review-queue.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260520000011-create-ai-correction-learned.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260520000012-add-correction-source-to-ai-support-corrections.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260520000030-upgrade-openai-text-models-to-gpt-55.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260522090001-create-api-failed-messages.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260603000001-create-ai-turn-events.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260611000001-alter-ai-token-transactions-amount-usd-precision.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260615000001-add-ai-token-usage-report-indexes.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260615000002-increase-ai-token-amount-usd-precision.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260616000001-add-meta-embedded-signup-config-id-to-companies-settings.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260618000001-align-coexistence-send-channel-default-meta.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260629000001-add-facebook-dataset-config-fields.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260629000001-drop-legacy-contact-number-company-unique.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260703000001-add-message-created-to-reminder-templates.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260716000001-create-recommendation-runs.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260716000002-create-campaign-approvals.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260716180000-create-company-users.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260716190000-add-activecompanyid-to-sessions.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260716200000-create-company-user-queues.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('20260717000001-recreate-media-table-aligned.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('copy.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('.js');
INSERT INTO public."SequelizeMeta" (name) VALUES ('Tickets.js');

CREATE TABLE IF NOT EXISTS "WebChatConversations" (
  "id" SERIAL PRIMARY KEY,
  "uuid" VARCHAR(255) NOT NULL,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "widgetId" INTEGER NOT NULL REFERENCES "WebChatWidgets"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "sessionId" VARCHAR(255) NOT NULL,
  "visitorName" VARCHAR(255) NOT NULL DEFAULT 'Visitante Web',
  "status" VARCHAR(255) NOT NULL DEFAULT 'open',
  "unreadMessages" INTEGER NOT NULL DEFAULT 0,
  "lastMessage" TEXT,
  "lastMessageAt" TIMESTAMP WITH TIME ZONE,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebChatConversations_widget_session_unique"
  ON "WebChatConversations" ("widgetId", "sessionId");

CREATE INDEX IF NOT EXISTS "web_chat_conversations_company_id_status"
  ON "WebChatConversations" ("companyId", "status");

CREATE INDEX IF NOT EXISTS "web_chat_conversations_last_message_at"
  ON "WebChatConversations" ("lastMessageAt");

CREATE TABLE IF NOT EXISTS "WebChatConversationMessages" (
  "id" SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES "WebChatConversations"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "direction" VARCHAR(255) NOT NULL,
  "body" TEXT NOT NULL,
  "senderId" INTEGER REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "type" VARCHAR(255) NOT NULL DEFAULT 'text',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "readAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE INDEX IF NOT EXISTS "web_chat_conversation_messages_conversation_created"
  ON "WebChatConversationMessages" ("conversationId", "createdAt");

CREATE INDEX IF NOT EXISTS "web_chat_conversation_messages_company_direction"
  ON "WebChatConversationMessages" ("companyId", "direction");

CREATE TABLE IF NOT EXISTS "SequelizeMeta" (
  "name" VARCHAR(255) NOT NULL PRIMARY KEY
);

INSERT INTO "SequelizeMeta" ("name")
VALUES ('20260703000001-create-webchat-conversations.js')
ON CONFLICT DO NOTHING;

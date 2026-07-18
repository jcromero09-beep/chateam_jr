# 04e · Benchmark ChatPion / XeroChat (CodeCanyon 24477224)

> Análisis técnico de producto sobre el código fuente de **ChatPion** (marca comercial hermana de XeroChat), "Complete Messenger Marketing Software for Facebook". Benchmark de features para **chateam_jr**.
> Ruta analizada: `/home/jcromero09/2026 Chateam JRCR/_analisis/chatpion/codecanyon-24477224-xerochat-complete-messenger-marketing-software-for-facebook`
> Fecha: 2026-07-12 · Trabajo de solo-lectura.

---

## 1) Qué es + stack

**ChatPion / XeroChat** es una plataforma SaaS auto-hospedada de *Messenger marketing* centrada en **Facebook Messenger + Instagram**, con módulos de e-commerce en chat, social posting, autoresponders, bots y marketing por SMS/Email. Se vende como script PHP monolítico multi-usuario (multi-cliente por `users`, no multi-tenant por schema).

**Stack (evidencia):**
- **Framework:** CodeIgniter 3 (MVC clásico). Núcleo en `system/core`, controladores en `application/controllers` (36 controladores), un modelo gigante `application/models/Basic.php` + `Grocery_CRUD_Model.php`.
- **PHP:** 7.x (composer.json, sin tipado estricto). `index.php` bootstrap CI3.
- **BD:** MySQL/MariaDB — **118 tablas** en `assets/backup_db/initial_db.sql` (dump único, sin migraciones).
- **Front:** Blade-less PHP views (`application/views`, ~19 subdirectorios), jQuery + Bootstrap, tema Stisla. **Vue.js compilado** solo para el Visual Flow Builder (`plugins/flow_builder/js/app.*.js`, bundle Webpack).
- **Realtime:** Pusher (`application/views/include/pusher-js.php`) para Live Chat.
- **Extensibilidad:** sistema de **addons** propietario (`plugins/api`, tabla `add_ons`/`modules`, `Addons.php::upload_addon_zip`) con validación de *purchase code* de Envato y feature-gating por `modules.limit_enabled`.
- **Integraciones externas:** Facebook Graph API, Instagram Graph API, Twilio/Nexmo (SMS), SMTP/Mailgun/Sendgrid/Mandrill (Email), Mailchimp, Stripe, PayPal, OpenAI (`open_ai_config`), WordPress self-hosted, WooCommerce.
- **i18n:** 13 idiomas (`application/language/` — incluye `spanish`).

**Diferencia de fondo con chateam_jr:** ChatPion es un producto **legacy PHP centrado en Facebook/IG** con e-commerce nativo en chat y social posting; chateam_jr es un CRM omnicanal **Node/TS moderno, WhatsApp-first y AI-first**. ChatPion aporta *ideas de producto* (comercio conversacional, growth de comentarios FB/IG, OTN), no arquitectura reutilizable.

---

## 2) Catálogo exhaustivo de funciones × área

Evidencia: `T:` = tabla en `initial_db.sql`; `C:` = controlador; `V:` = vista; `A:` = addon/module; `P:` = plugin.

### A. E-commerce en chat / checkout
| # | Función | Evidencia |
|---|---------|-----------|
| 1 | Multi-tienda (varias stores por usuario) | `T:ecommerce_store` · `V:store_add/edit/list` · `C:Ecommerce` |
| 2 | Catálogo de productos | `T:ecommerce_product` · `V:product_add/edit/single` |
| 3 | Atributos y variantes de producto | `T:ecommerce_attribute` · `V:attribute_list/value` |
| 4 | Categorías de producto | `T:ecommerce_category` · `V:category_list` |
| 5 | Carrito de compra en chat/webview | `T:ecommerce_cart, ecommerce_cart_item` · `V:cart_modal/cart_js` |
| 6 | Direcciones guardadas del carrito | `T:ecommerce_cart_address_saved` |
| 7 | Puntos de recogida (pickup points) | `T:ecommerce_cart_pickup_points` · `V:pickup_point_list` |
| 8 | Cupones / descuentos | `T:ecommerce_coupon` · `V:coupon_add/edit/list` |
| 9 | Productos digitales + descarga | `V:download_digital_orders` |
| 10 | Gestión de órdenes | `V:order_list, my_orders` · `T:ecommerce_reminder_report` |
| 11 | Lista de clientes de la tienda | `V:customer_list` |
| 12 | Recordatorio de carrito abandonado / orden | `T:ecommerce_reminder_report` · `V:reminder_settings` |
| 13 | Horario de atención de tienda | `T:ecommerce_store_business_hours` · `V:business_hour_settings` |
| 14 | Reseñas / comentarios de producto | `V:review_single, comment_single, comment_js` |
| 15 | Cuentas de pago por tienda (Stripe/PayPal/manual) | `V:payment_accounts` · `T:payment_config` |
| 16 | Botón "enviar pedido por WhatsApp" (click-to-chat) | `C:Ecommerce.php` (`whatsapp_send_order_button`) |
| 17 | QR de tienda | `V:qr_code` · `upload/qrc` |
| 18 | Apariencia/tema de storefront (webview) | `V:appearance_settings, store_style, bare-theme` |
| 19 | Notificaciones de tienda | `V:notification_settings, notification_js` |

### B. Bots / Flow Builder
| # | Función | Evidencia |
|---|---------|-----------|
| 20 | Bot Messenger por postback/árbol | `T:messenger_bot, messenger_bot_postback` · `V:tree_view` |
| 21 | **Visual Flow Builder** (drag-and-drop, Vue) | `A:visual_flow_builder` · `T:visual_flow_builder_campaign` · `P:flow_builder` |
| 22 | Plantillas de bot guardadas + categorías | `T:messenger_bot_saved_templates, messenger_bot_template_category` |
| 23 | Menú persistente (persistent menu) | `T:messenger_bot_persistent_menu` · `V:persistent_menu_*` |
| 24 | Whitelist de dominios del bot | `T:messenger_bot_domain_whitelist` · `V:domain_list` |
| 25 | Bot con respuesta IA (OpenAI) | `A:Bot - AI Reply` · `T:open_ai_config` |
| 26 | Captura de campos personalizados en flujo | `T:user_input_custom_fields, ..._assaign` |
| 27 | Export/Import/Tree del bot (conectividad) | `A:Bot - Connectivity: Export, Import & Tree View` |
| 28 | Quick replies / botones postback | `T:messenger_bot_postback` |
| 29 | Log de errores del bot | `T:messenger_bot_reply_error_log` |
| 30 | Estadísticas de mensajes enviados por bot | `T:messenger_bot_message_sent_stat` · `C:Messenger_bot_analytics` |

### C. Broadcasting / campañas
| # | Función | Evidencia |
|---|---------|-----------|
| 31 | Broadcast Messenger (serial + envío) | `T:messenger_bot_broadcast_serial, ..._send` · `C:Messenger_bot_broadcast` |
| 32 | Grupos de contactos para broadcast | `T:messenger_bot_broadcast_contact_group` |
| 33 | Drip campaigns (secuencias temporizadas) | `T:messenger_bot_drip_campaign, ..._assign, ..._report` |
| 34 | **OTN — One Time Notification** (opt-in + envío) | `T:otn_optin_subscriber, otn_postback` · `A:Broadcast - OTN Send` |
| 35 | Campañas de conversación patrocinada | `T:facebook_ex_conversation_campaign, ..._send` |
| 36 | Analítica de campañas / páginas | `C:Messenger_bot_analytics, Page_analytics` |

### D. Autoresponder
| # | Función | Evidencia |
|---|---------|-----------|
| 37 | Autoreply a posts/comentarios de página FB | `T:page_response_autoreply, facebook_ex_autoreply, ..._report` |
| 38 | Autoreply Instagram + plantillas | `T:instagram_reply_autoreply, instagram_reply_template` · `C:Instagram_reply` |
| 39 | Email auto-responder (integración) | `C:Email_auto_responder_integration` · `T:send_email_to_autoresponder_log` |
| 40 | Engagement checkbox opt-in (plugin de captación) | `T:messenger_bot_engagement_checkbox, ..._reply` |
| 41 | Ref-URL / m.me opt-in | `T:messenger_bot_subscriber` (ref) |

### E. Comment Growth Tool (auto-responder de comentarios FB/IG)
| # | Función | Evidencia |
|---|---------|-----------|
| 42 | Auto comment reply (público) | `T:auto_comment_reply_tb, auto_comment_reply_info` · `C:Comment_automation` |
| 43 | Private reply a comentario (DM) | `A:Instagram Bot & Private Reply` |
| 44 | Comment Tag Machine (bulk reply a comentaristas) | `T:tag_machine_bulk_reply, ..._send, tag_machine_commenter_info` |
| 45 | Bulk tag de comentaristas | `T:tag_machine_bulk_tag, tag_machine_comment_info` |
| 46 | Auto-like / auto-share al comentar | `T:page_response_auto_like_share, ..._report, page_response_auto_share_report` |
| 47 | Lista de posts habilitados para growth | `T:tag_machine_enabled_post_list` |
| 48 | Instagram auto comment reply | `A:Comment Automation: Instagram Auto Comment Reply` |
| 49 | Campaña auto-comment (comentar en tus posts) | `A:Comment Automation: Auto Comment Campaign` |

### F. Live Chat
| # | Función | Evidencia |
|---|---------|-----------|
| 50 | Bandeja de Live Chat (agentes) | `T:livechat_messages` · `C:Livechat` · `V:livechat/*` |
| 51 | Canned responses (respuestas predefinidas) | `T:canned_response` |
| 52 | Realtime vía Pusher | `V:include/pusher-js.php` |

### G. SMS / Email marketing
| # | Función | Evidencia |
|---|---------|-----------|
| 53 | Campañas SMS (Twilio/Nexmo) | `T:sms_sending_campaign, ..._send, sms_api_config` · `C:Sms_email_manager` |
| 54 | Campañas Email (SMTP/Mailgun/Sendgrid/Mandrill) | `T:email_sending_campaign, ..._send, email_*_config` |
| 55 | Contactos y grupos SMS/Email | `T:sms_email_contacts, sms_email_contact_group` |
| 56 | Plantillas SMS/Email + builder | `T:email_sms_template, email_template_management` · `P:email-template-builder` |
| 57 | Integración Mailchimp + listas | `T:mailchimp_config, mailchimp_list` |
| 58 | Tracking de clics en email | `T:email_clickrate_links_backup` |

### H. WooCommerce / WordPress
| # | Función | Evidencia |
|---|---------|-----------|
| 59 | Integración WooCommerce (94 refs) | grep `woocommerce` en `application/` |
| 60 | Posting a WordPress self-hosted | `T:wordpress_config_self_hosted` · `A:Social Posting - Account Import: WordPress` |

### I. Plantillas de mensajes
| # | Función | Evidencia |
|---|---------|-----------|
| 61 | Plantillas de bot + categorías | `T:messenger_bot_saved_templates, ..._template_category` |
| 62 | Plantillas de email/SMS reutilizables | `T:email_sms_template` |
| 63 | Plantillas de reply Instagram | `T:instagram_reply_template` |

### J. RSS Autopost
| # | Función | Evidencia |
|---|---------|-----------|
| 64 | RSS auto-post a redes | `T:facebook_rx_auto_post` · `A:Social Posting - RSS Auto Post` |

### K. Gestión / segmentación de suscriptores
| # | Función | Evidencia |
|---|---------|-----------|
| 65 | Suscriptores del bot + info extra | `T:messenger_bot_subscriber, ..._extra_info` · `C:Subscriber_manager` |
| 66 | Labels/etiquetas de suscriptor | `T:messenger_bot_subscribers_label` |
| 67 | Campos personalizados (custom fields) | `T:user_input_custom_fields` |
| 68 | Grupos de contactos | `T:messenger_bot_broadcast_contact_group` |
| 69 | Export de contactos | `download/contact_export` |

### L. Marketplace de plugins / addons
| # | Función | Evidencia |
|---|---------|-----------|
| 70 | Sistema de addons (instalar ZIP, feature-gate) | `C:Addons.php::upload_addon_zip` · `T:add_ons, modules` · `P:api` |
| 71 | Validación de purchase code (Envato) | `T:add_ons.purchase_code` |
| 72 | Addon Facebook Poster (ultrapost) | `A:Facebook Poster` · `T:ultrapost_auto_reply` |
| 73 | Addon Visual Flow Builder | `A:Visual Flow Builder` |
| 74 | Addon Instagram Bot & Private Reply | `A:Instagram Bot & Private Reply` |
| 75 | Feature-gating / límites por plan | `T:modules (limit_enabled, bulk_limit_enabled)` |

### M. Multicanal
| # | Función | Evidencia |
|---|---------|-----------|
| 76 | Facebook Messenger (canal núcleo) | `C:Messenger_bot` |
| 77 | Instagram (bot + reply + posting) | `C:Instagram_reply` · `T:instagram_*` |
| 78 | Native/JSON API (canal propio) | `C:Native_api` · `T:native_api` · `V:native_api/*` |
| 79 | WordPress (posting) | `T:wordpress_config_self_hosted` |
| 80 | WhatsApp click-to-order (no canal completo en base) | `C:Ecommerce.php` (whatsapp button) |

### N. Social Posting (redes)
| # | Función | Evidencia |
|---|---------|-----------|
| 81 | Post FB texto/imagen/link/video | `T:facebook_rx_*` · `A:Social Posting: Facebook Text/Image/Link/Video` |
| 82 | Carousel / slider FB | `T:facebook_rx_slider_post` |
| 83 | CTA post FB | `T:facebook_rx_cta_post` |
| 84 | Post Instagram imagen/video | `A:Social Posting: Instagram Image/Video Post` |
| 85 | Programación de publicaciones | `C:Autoposting` · `T:autoposting` |
| 86 | Posting a grupos FB | `T:facebook_rx_fb_group_info` |

### O. IA
| # | Función | Evidencia |
|---|---------|-----------|
| 87 | Bot AI Reply con OpenAI | `T:open_ai_config` · `A:Bot - AI Reply` |

### P. Soporte / Help Desk
| # | Función | Evidencia |
|---|---------|-----------|
| 88 | FB Simple Support Desk (tickets sobre Messenger) | `T:fb_simple_support_desk, fb_support_category, fb_support_desk_reply` |

### Q. Monetización SaaS / Admin
| # | Función | Evidencia |
|---|---------|-----------|
| 89 | Paquetes / planes | `T:package` · `V:member/buy_package` |
| 90 | Pasarelas Stripe / PayPal + IPN | `C:Stripe_action, Payment, Paypal_ipn` · `T:payment_config` |
| 91 | Historial de transacciones (auto + manual) | `T:transaction_history, transaction_history_manual` |
| 92 | Logs de uso y límites | `T:usage_log` · `V:member/usage_log` |
| 93 | Multi-idioma (13 idiomas) | `C:Multi_language` · `application/language/*` |
| 94 | Blog (posts, categorías, tags, comentarios) | `T:blog_posts, blog_post_categories/tags/comments` |
| 95 | Custom page builder | `T:custom_page_builder` |
| 96 | Webview builder | `C:Webview_builder` |
| 97 | Calendario / reserva de citas | `C:Calendar` · `upload/appointment_booking` |
| 98 | Anuncios (announcements) | `T:announcement` · `C:Announcement` |
| 99 | Gestor de tema personalizado | `C:Custom_theme_manager` · `application/views/brand_theme` |
| 100 | Update system (auto-update del script) | `C:Update_system` · `T:update_list, version` |
| 101 | Cron jobs de campañas/drip | `C:Cron_job` · `T:messenger_bot_drip_report` |

**Total catalogado: 101 funciones** en 17 áreas.

---

## 3) Features × ¿chateam lo tiene? × acción

Estado de chateam_jr según `models/` y `routes/` (evidencia: modelos Sequelize y rutas Express).

| Área / Feature ChatPion | ¿chateam lo tiene? | Acción | Nota |
|---|---|---|---|
| E-commerce en chat: catálogo | Parcial (`Product.ts` sin campos de tienda/orden) | **Mejorar** | Hay `Product` pero no store/cart/checkout conversacional |
| Carrito + checkout en chat/webview | No | **Implementar (evaluar)** | Oportunidad de comercio conversacional WA |
| Cupones / descuentos | No (`coupon`=0) | **Implementar** | Alto valor para campañas de venta |
| Pickup points / direcciones guardadas | No | Ignorar | Nicho logístico |
| Recordatorio de carrito abandonado | No | **Implementar** | Reengancha con IA de chateam |
| Reseñas de producto | No | Ignorar | |
| Flow Builder visual | **Sí** (`FlowBuilder, FlowCampaign, FlowDefault, flowBuilderRoutes`) | Mejorar | Ya existe, más moderno |
| Menú persistente Messenger | No (`persistent`=falsos positivos) | Ignorar | FB no es foco; WA usa list/button messages |
| Captura de custom fields en flujo | **Sí** (`ContactCustomField`) | — | |
| Bot AI Reply | **Sí, muy superior** (RAG, agentes, multimodal, créditos) | — | Ventaja fuerte de chateam |
| Broadcast / campañas | **Sí** (`Campaign, CampaignMessage, CampaignRule, ScheduledMessages`) | — | Más completo (rules, insights) |
| Drip / secuencias | **Sí** (`FlowCampaign, ScheduledMessages`) | Mejorar | |
| OTN / Recurring Notifications | No | **Implementar (evaluar)** | Concepto útil; en WA equivale a plantillas/opt-in re-engagement |
| Autoresponder posts/página | **Sí** (`CommentAutoReplyCampaign, socialComment`) | — | |
| **Comment Growth Tool FB/IG** | **Sí** (`CommentAutoReplyCampaign/Log, CommentResponseSettings`) | Mejorar | Ampliar a private-reply + bulk tag |
| Auto-like/share al comentar | No | Ignorar | Riesgo de políticas Meta |
| Live Chat / bandeja agentes | **Sí, superior** (`Ticket, Chat, Kanban, webchat`) | — | CRM completo con tickets |
| Canned responses | **Sí** (`QuickMessage`) | — | |
| SMS marketing | No (falsos positivos) | **Implementar (evaluar)** | Twilio; complementa WA en EC/US |
| Email marketing | **Sí, robusto** (`EmailMarketing, emailCampaign, listmonk, AIEmailTemplate`) | — | Superior |
| Mailchimp | No directo | Ignorar | Listmonk propio cubre |
| WooCommerce | No | **Implementar (evaluar)** | Sync catálogo/órdenes p/ tiendas cliente |
| WordPress posting | No | Ignorar | Fuera de foco |
| Plantillas de mensaje | **Sí** (`WhatsAppTemplate, QuickMessage, AIEmailTemplate`) | — | |
| RSS Autopost | No | Ignorar | Fuera de foco CRM |
| Segmentación suscriptores (tags/labels/listas) | **Sí, superior** (`ContactTag, ContactList, ContactTemperature, LeadSource`) | — | |
| Marketplace de addons | No (monolito Node modular) | Ignorar | No aplica al modelo |
| Feature-gating por plan | **Sí** (`Plan, Subscriptions, PlanCreditAllocation`) | — | |
| Multicanal FB/IG/WA/Telegram/WebChat | **Sí, superior** (`Whatsapp/Baileys/Meta, Telegram, WebChat, Facebook, tiktok`) | — | WA-first, ventaja clave |
| Native/JSON API canal | **Sí** (`api, webHook, integration`) | — | |
| Social posting programado | Parcial (`UGCSocialPost, tiktok, metaMarketing`) | Mejorar | Orientado a UGC, no scheduler multired |
| Support / Help Desk | **Sí, superior** (`Ticket, ticketFlow, TicketTraking`) | — | |
| Pagos/planes SaaS | **Sí** (`billing, Invoice, paypal, aiMercadoPago`) | — | |
| Multi-idioma | Parcial | Mejorar | ChatPion trae 13 idiomas listos |
| Blog / page builder / webview | No | Ignorar | Fuera de foco CRM |
| Calendario / citas | **Sí, superior** (`Appointments, AppointmentService, schedule`) | — | |

---

## 4) Top oportunidades para chateam (impacto / esfuerzo)

Priorizadas por relación valor-negocio / esfuerzo. chateam es WhatsApp-first + AI-first; se recomienda adoptar solo lo que refuerce **venta conversacional** y **re-engagement**, no lo legacy de Facebook.

| # | Oportunidad | Impacto | Esfuerzo | Racional (evidencia ChatPion) |
|---|---|---|---|---|
| 1 | **Comercio conversacional en WhatsApp** (catálogo → carrito → checkout → orden), extendiendo `Product.ts` con store/cart/order + webview de tienda | **Alto** | Alto | ChatPion lo tiene completo (`ecommerce_store/product/cart/coupon`, 19 funciones). Es su mayor diferenciador de monetización; chateam solo tiene `Product` sin flujo de compra. |
| 2 | **Cupones / descuentos** ligados a campañas y a la tienda | Alto | Bajo | `T:ecommerce_coupon` + `V:coupon_*`. chateam `coupon`=0. Gancho directo de conversión, barato de implementar sobre `Campaign`. |
| 3 | **Recordatorio de carrito/orden abandonada** con IA de chateam | Alto | Medio | `T:ecommerce_reminder_report` + `V:reminder_settings`. Encaja con `ScheduledMessages` + `AIAgent`; recupera ventas. |
| 4 | **Comment Growth Tool ampliado** (private-reply DM + bulk tag de comentaristas IG/FB) | Alto | Medio | ChatPion `tag_machine_*` + private reply addon. chateam ya tiene `CommentAutoReplyCampaign`; falta el salto comentario→DM que captura leads. Cuidar políticas Meta. |
| 5 | **OTN / Recurring-Notification style re-engagement** adaptado a plantillas WA + opt-in | Medio-Alto | Medio | `T:otn_optin_subscriber, otn_postback`. Traducir el patrón de re-permiso a plantillas WABA para reactivar contactos fuera de la ventana de 24h. |
| 6 | **SMS marketing (Twilio) como canal complementario** de campañas | Medio | Medio | `T:sms_sending_campaign, sms_api_config`. Reutiliza motor `Campaign`; útil para fallback cuando WA no está disponible. |
| 7 | **Integración WooCommerce** (sync catálogo + órdenes) para clientes con tienda | Medio | Alto | 94 refs Woo en ChatPion. Alimenta la oportunidad #1 con inventario real; alto esfuerzo por sync bidireccional. |
| 8 | **Packs de i18n listos (ES ya está)** aprovechando estructura de idiomas | Bajo-Medio | Bajo | `application/language/` 13 idiomas. chateam i18n parcial; acelera expansión regional. |

**Ignorar explícitamente:** social posting RSS/WordPress, blog, page builder, marketplace de addons, menú persistente Messenger, auto-like/share (fuera de foco CRM WA-first o con riesgo de políticas Meta).

---

### Resumen de cierre
- **Funciones catalogadas: 101** (en 17 áreas), con evidencia por tabla/controlador/vista/addon.
- **Archivo escrito:** `/home/jcromero09/chateam_jr/SPEC-FIRST/fase4/04e-chatpion.md`.
- **Veredicto:** ChatPion es un producto **legacy PHP/CodeIgniter FB-céntrico**; chateam ya lo supera en canales (WA-first), IA, tickets/CRM y email. Las **3 brechas reales y valiosas** son **comercio conversacional + cupones + recordatorio de carrito**, seguidas de **comment-growth con private-reply** y **OTN-style re-engagement**.

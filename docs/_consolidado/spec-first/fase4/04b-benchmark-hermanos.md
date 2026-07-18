# Fase 4b — Benchmark de Sistemas Hermanos (familia Whaticket / whatzardilapp)

> Sondeados con Playwright + login demo provisto por JC (read-only, inspección de UI). Fuente: `SPEC-FIRST/sondas/sondas-hermanos.json`. Todos son forks de la MISMA base que chateam (Whaticket), por eso comparten núcleo — el valor está en los **módulos operativos** que unos tienen y chateam no.

## Cobertura de sonda
| Sistema | Login | Stack | Menú | Colores | Título |
|---|---|---|---|---|---|
| superizing | ✅ | React+MUI | 31 | 39 | Ardila App |
| autoatende | ✅ | React+MUI | 25 | 26 | Whaticket Pro |
| isabox | ✅ | React+MUI | 39 | 29 | Plataforma WhatsApp |
| atendechat | ✅ | React+MUI | 21 | 20 | Atendechat |
| **agenteia** | ✅ | React+MUI | 32 | 36 | Ardila App |
| superzpro | ❌ (Vue/ZapMulti) | Vue | — | 12 | ZapMulti |
| digitalzap / wasender / equipechat | ❌ (flujo login distinto) | React+MUI | — | 7-19 | WADO/Ardila |

## Núcleo común (todos, incl. chateam) — confirma linaje
Dashboard · Tickets · Kanban · Contactos · Respuestas Rápidas · Etiquetas · Chat Interno · Campañas · Filas & Chatbot · Conexiones · Usuarios · API · Integraciones · Financiero · Agendas · Reportes · Configuración. → **chateam los tiene todos.**

## Módulos que los hermanos tienen y chateam NO (o con menor foco) — OPORTUNIDADES
| Feature | Visto en | chateam hoy | Acción |
|---|---|---|---|
| **Llamadas de voz** (WhatsApp + en vivo + **con IA**) | agenteia ("SMS y Llamadas", brief: llamadas WA/vivo/IA) | No hay módulo de voz | **Implementar** (Fase E) |
| **Canal SMS** | agenteia ("SMS y Llamadas") | No | Implementar |
| **Gmail/Email como canal entrante** (conversacional) | superizing ("Email"), agenteia | Solo Email Marketing (saliente) | Implementar entrante |
| **Panel de Atendimentos** (monitor de asesores en vivo) | isabox, autoatende | `whatsappMonitor` parcial, sin panel | Implementar (rol supervisor) |
| **Plantão / turnos-guardias** de agentes | autoatende | No | Implementar |
| **Tareas / ToDoList** por ticket/agente | isabox, superizing ("Tasks") | No | Implementar |
| **Sectores** además de Colas | isabox ("Filas e Setores") | Solo Queues | Evaluar |
| **Anti-spam en masivos con rotación de QR** | agenteia (brief) | Campañas sin anti-spam explícito | Endurecer Campañas |
| **Agente IA conversacional** (Gemini+ChatGPT visible) | isabox/autoatende/atendechat/agenteia ("Talk.Ai"/"Open.Ai"/"ChatGPT") | Multi-provider IA existe (RAG/AIAgent) | Asegurar paridad visible |
| **Monitoreo infra embebido** (Painel Zabbix) | superizing | Observabilidad desconectada (O-1) | Refuerza Fase D |
| **Export de datos** (un clic) | superizing ("Exportar dados") | Parcial (export contactos roto 500) | Corregir/ampliar |

## Donde chateam YA va ADELANTE (proteger, no copiar)
Ninguno de los hermanos muestra en su menú: **coexistencia Baileys↔WhatsApp Cloud API** (chateam la tiene), **UGC / generación IA de video** (fal/Higgsfield/ComfyUI), **Meta Ads + Conversions API**, **Afiliados/Partners**, **Créditos IA prepago** con panel de costos. chateam es **más amplio**; los hermanos son más operativos en atención/voz.

## Hallazgo de diseño (clave para la estrategia)
El **sprawl de color es endémico** a toda la familia: superizing 39, agenteia 36, isabox 29, chateam 38 colores únicos por pantalla. **Ninguno resolvió el design system.** → La Fase B (design system + IA de menú) de chateam es un **diferenciador real y barato**: ser el único de la familia con marca consistente y navegación ordenada.

## Conclusión estratégica
chateam ya es el más **amplio** de la familia. Para ganar: (1) cerrar confianza (seguridad/pagos, Ola 0/A), (2) ser el **más pulido** (design system, Fase B — nadie lo hizo), (3) sumar los pocos módulos **operativos** que faltan y que el mercado local valora: **voz/llamadas con IA, SMS, Gmail entrante, panel de asesores, tareas y plantão**.

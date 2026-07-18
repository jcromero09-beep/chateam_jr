# Módulo: Afiliados y Partners — Spec

## Propósito
Programa de referidos/comisiones: partners refieren tenants y ganan comisión sobre pagos; gestión de códigos de referido, seguimiento de conversiones y liquidación.

## Actores y capacidades
- **Partner/afiliado**: puede obtener su código/enlace de referido, ver referidos y comisiones acumuladas.
- **Sistema**: atribuye el alta de una company a un código de referido, calcula comisión al confirmarse un pago, acumula saldo a liquidar.
- **Super-admin**: define % de comisión, aprueba/liquida pagos, ve todos los partners.

## Rutas / Controladores / Modelo
- `services/AffiliateServices/` (12 archivos), `services/PartnerServices/`. Tablas `AIAffiliatePrograms`, `AIAffiliateReferrals` (y relacionadas).
- Atribución ligada al alta (`SignUp`) y al webhook de pago (dispara comisión).

## Flujos clave
1. **Referido se registra (happy)**: visitante usa enlace con código → alta de company atribuida al partner → al primer pago confirmado, se genera comisión. Error: código inválido → alta sin atribución.
2. **Liquidación**: super-admin revisa saldo del partner y marca pagado. Error: saldo insuficiente/duplicado.

## Deuda / bugs conocidos (Fase 2)
- **P0 (colateral de pagos)**: como el webhook PayPal no verifica firma, un atacante puede forjar un pago y **disparar comisión de afiliado real cobrable** (informe 09). Cerrar depende de S-5.
- Idempotencia de comisión: un webhook de pago replayado no debe generar comisión doble (ligado a S-10).

## Criterios de aceptación (Given/When/Then)
- **Dado** un enlace de referido válido, **cuando** un visitante se registra por él, **entonces** la nueva company queda atribuida al partner correcto.
- **Dado** un referido atribuido, **cuando** se confirma su primer pago legítimo (firma válida), **entonces** se genera exactamente UNA comisión con el % configurado.
- **Dado** un webhook de pago forjado (firma inválida), **cuando** llega, **entonces** NO se genera comisión (bloqueado por la verificación de firma).
- **Dado** un partner con saldo, **cuando** el super-admin lo liquida, **entonces** el saldo pasa a "pagado" y no puede re-liquidarse (idempotente).

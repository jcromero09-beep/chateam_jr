import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { Request, Response } from "express";
import * as Yup from "yup";
import Gerencianet from "gn-api-sdk-typescript";
import AppError from "../errors/AppError.js";

import options from "../config/Gn.js";
import Company from "../models/Company.js";
import Invoices from "../models/Invoices.js";
import { getIO } from "../libs/socket.js";
import Setting from "../models/Setting.js";
import User from "../models/User.js";
import UpdateUserService from "../services/UserServices/UpdateUserService.js";
import Stripe from 'stripe';
import paypal from "@paypal/checkout-server-sdk";
const axios = require('axios');
import Plan from "../models/Plan.js";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService.js";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession.js";
import * as Sentry from "@sentry/node";
import { updateDueDateByCompanyId } from "../services/CompanyService/dateCompany.js";
import CreateInvoiceService from "../services/InvoicesService/CreateInvoiceService.js";
import ApplePurchase from "../models/ApplePurchase.js";
import ProvisionCreditsService from "../services/AICreditServices/ProvisionCreditsService";
import { getPayPalClient } from "../services/PaypalService/paypalConfig.js";
import { getPaypalAccessToken, getPaypalBaseUrl } from "../services/PaymentSync/PaypalProductService.js";
import { processPaidPlanPayment, claimInvoiceForPayment } from "../services/SubscriptionService/PlanPaymentService.js";
// const app = express();

export const index = async (req: Request, res: Response): Promise<Response> => {
  const gerencianet = new Gerencianet(options);

  return res.json(gerencianet.getSubscriptions());
};

export const createSubscription = async (
  req: Request,
  res: Response
): Promise<Response> => {

  let key_STRIPE_PRIVATE = null;

  try {
    // Obtener Stripe key desde la Company del SuperAdmin
    const superAdminUser = await User.findOne({ where: { super: true } });
    if (superAdminUser) {
      const superAdminCompany = await Company.findByPk(superAdminUser.companyId);
      key_STRIPE_PRIVATE = superAdminCompany?.stripeSecretKey;
    }

    if (!key_STRIPE_PRIVATE) {
      throw new AppError("Clave privada de Stripe no configurada en la Company del SuperAdmin.", 500);
    }

  } catch (error) {
    console.error("Error al recuperar la configuración de Stripe:", error);
    throw error;
  }

  const { companyId } = req.user;

  const schema = Yup.object().shape({
    price: Yup.string().required(),
    users: Yup.string().required(),
    connections: Yup.string().required()
  });

  if (!(await schema.isValid(req.body))) {
    throw new AppError("Datos incorrectos - ¡Póngase en contacto con el servicio de asistencia!", 400);
  }

  const {
    firstName,
    price,
    users,
    connections,
    address2,
    city,
    state,
    zipcode,
    country,
    plan,
    invoiceId,
    isRecurrent
  } = req.body;


  const parsedPlan = JSON.parse(plan);
  const selectedPlanId = Number(parsedPlan.planId || parsedPlan.id);
  const dbPlan = await Plan.findByPk(selectedPlanId);
  const invoice = await Invoices.findByPk(invoiceId);

  if (!dbPlan) {
    throw new AppError("Plan no encontrado", 404);
  }

  if (!invoice) {
    throw new AppError("Factura no encontrada", 404);
  }

  if (invoice.companyId !== companyId) {
    throw new AppError("No tienes permiso para pagar esta factura", 403);
  }

  const shouldCreateRecurringCheckout = Boolean(dbPlan.allowRecurringPayments);

  if (key_STRIPE_PRIVATE) {
    // Lógica para crear la sesión de Stripe dependiendo de si es un pago recurrente o único

    const priceId = dbPlan.stripePriceId; // ID del precio recurrente del plan
    const stripe = new Stripe(key_STRIPE_PRIVATE, {
      apiVersion: '2025-05-28.basil' as any, // Versión compatible con tipos
    });

    const priceAmount = parseFloat(dbPlan.amount) || parseFloat(price) || 0;



    let sessionStripe;

    if (shouldCreateRecurringCheckout) {
      if (!priceId) {
        throw new AppError("Este plan tiene pagos recurrentes activos, pero no tiene stripePriceId configurado.", 400);
      }

      // Si es pago recurrente, usamos 'subscription'
      sessionStripe = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',  // Pago recurrente
        success_url: `${process.env.STRIPE_OK_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.STRIPE_CANCEL_URL,
        client_reference_id: invoiceId.toString(), // Asegúrate de convertirlo a string
        metadata: {
          type: "plan",
          internal_invoice_id: invoiceId.toString(),
          companyId: companyId.toString(),
          planId: dbPlan.id.toString(),
          recurring: "true"
        },
        subscription_data: {
          metadata: {
            type: "plan",
            internal_invoice_id: invoiceId.toString(), // Doble referencia por seguridad
            companyId: companyId.toString(),
            planId: dbPlan.id.toString(),
            recurring: "true"
          }
        }
      });
    } else {
      // Si es pago único, usamos 'payment'
      sessionStripe = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `#Fatura:${invoiceId}`,
              },
              unit_amount: Math.round(priceAmount * 100),  // Convertimos a centavos
            },
            quantity: 1,
          },
        ],
        mode: 'payment',  // Pago único
        success_url: `${process.env.STRIPE_OK_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: process.env.STRIPE_CANCEL_URL,
        client_reference_id: invoiceId.toString(),
        metadata: {
          type: "plan",
          internal_invoice_id: invoiceId.toString(),
          companyId: companyId.toString(),
          planId: dbPlan.id.toString(),
          recurring: "false"
        },
      });
    }


    // Actualizamos la factura en la base de datos con el stripe_id
    await invoice.update({
      planId: dbPlan.id,
      detail: dbPlan.name,
      recurrence: dbPlan.recurrence,
      value: Number(dbPlan.amount),
      users: dbPlan.users,
      connections: dbPlan.connections,
      queues: dbPlan.queues,
      useWhatsapp: dbPlan.useWhatsapp,
      useFacebook: dbPlan.useFacebook,
      useInstagram: dbPlan.useInstagram,
      useCampaigns: dbPlan.useCampaigns,
      useSchedules: dbPlan.useSchedules,
      useInternalChat: dbPlan.useInternalChat,
      useExternalApi: dbPlan.useExternalApi,
      stripe_id: sessionStripe.id,
      paymentMethod: "stripe",
    });

    // Generamos la URL de Stripe para redirigir al cliente al checkout
    // const stripeURL = sessionStripe.url;

    return res.json({
      stripeURL: sessionStripe.url,  // Asegúrate de que este valor esté presente
      valorext: price,               // Cualquier otro dato que desees incluir
    });
  }

  // return res.json({
  //   ...pix,
  //   valorext,
  //   qrcode,
  //   stripeURL,
  //   //  mercadopagoURL,
  //   // asaasURL,
  // });

  // if (key_GERENCIANET_PIX_KEY) {

  //   const body = {
  //     calendario: {
  //       expiracao: 3600
  //     },
  //     valor: {
  //       original: price.toLocaleString("pt-br", { minimumFractionDigits: 2 }).replace(",", ".")
  //     },
  //     chave: key_GERENCIANET_PIX_KEY,
  //     solicitacaoPagador: `#Fatura:${invoiceId}`
  //   };

  //   try {

  //     pix = await gerencianet.pixCreateImmediateCharge(null, body);

  //     qrcode = await gerencianet.pixGenerateQRCode({
  //       id: pix.loc.id
  //     });



  //   } catch (error) {
  //     //console.log(error);
  //     //throw new AppError("Validation fails", 400);
  //   }

  // }

  // const updateCompany = await Company.findOne();

  // if (!updateCompany) {
  //   throw new AppError("Company not found", 404);
  // }




};

export const createPaypalPlanPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { invoiceId, planId } = req.body;

    if (!invoiceId || !planId) {
      throw new AppError("invoiceId y planId son requeridos", 400);
    }

    const invoice = await Invoices.findByPk(invoiceId);
    const plan = await Plan.findByPk(planId);

    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    if (!plan) {
      throw new AppError("Plan no encontrado", 404);
    }

    if (invoice.companyId !== companyId) {
      throw new AppError("No tienes permiso para pagar esta factura", 403);
    }

    const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

    if (plan.allowRecurringPayments) {
      if (!plan.paypalPlanId) {
        throw new AppError("Este plan tiene pagos recurrentes activos, pero no tiene paypalPlanId configurado.", 400);
      }

      const accessToken = await getPaypalAccessToken();
      if (!accessToken) {
        throw new AppError("PayPal no está configurado correctamente", 500);
      }

      const response = await axios.post(
        `${getPaypalBaseUrl()}/v1/billing/subscriptions`,
        {
          plan_id: plan.paypalPlanId,
          custom_id: JSON.stringify({
            type: "plan_subscription",
            invoiceId: invoice.id,
            companyId,
            planId: plan.id
          }),
          application_context: {
            brand_name: "ChatEAM",
            user_action: "SUBSCRIBE_NOW",
            return_url: `${frontendUrl}/billing?paypalPlan=subscription`,
            cancel_url: `${frontendUrl}/billing?paypalPlan=cancel`
          }
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          }
        }
      );

      const approvalUrl = response.data.links?.find((link: any) => link.rel === "approve")?.href;

      await invoice.update({
        status: "pending",
        paymentMethod: "paypal",
        paypalOrderId: response.data.id,
        subscriptionId: response.data.id,
        planId: plan.id,
        detail: plan.name,
        recurrence: plan.recurrence,
        value: Number(plan.amount),
        users: plan.users,
        connections: plan.connections,
        queues: plan.queues
      } as any);

      return res.json({
        success: true,
        recurring: true,
        subscriptionId: response.data.id,
        approvalUrl
      });
    }

    const ppClient = await getPayPalClient();
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: "CAPTURE",
      purchase_units: [{
        reference_id: `invoice_${invoice.id}`,
        description: `Plan ${plan.name} - Factura #${invoice.id}`,
        amount: {
          currency_code: "USD",
          value: Number(plan.amount).toFixed(2)
        },
        custom_id: JSON.stringify({
          type: "plan_payment",
          invoiceId: invoice.id,
          planId: plan.id,
          months: 1,
          companyId
        })
      }],
      application_context: {
        brand_name: "ChatEAM",
        landing_page: "BILLING",
        user_action: "PAY_NOW",
        return_url: `${frontendUrl}/billing?paypalPlan=success&invoiceId=${invoice.id}`,
        cancel_url: `${frontendUrl}/billing?paypalPlan=cancel`
      }
    });

    const order = await ppClient.execute(request);
    const approvalUrl = order.result.links?.find((link: any) => link.rel === "approve")?.href;

    await invoice.update({
      status: "pending",
      paymentMethod: "paypal",
      paypalOrderId: order.result.id,
      planId: plan.id,
      detail: plan.name,
      recurrence: plan.recurrence,
      value: Number(plan.amount),
      users: plan.users,
      connections: plan.connections,
      queues: plan.queues
    } as any);

    return res.json({
      success: true,
      recurring: false,
      orderID: order.result.id,
      approvalUrl
    });
  } catch (error: any) {
    console.error("❌ Error creando pago PayPal de plan:", error.message);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message || "Error al crear pago PayPal" });
  }
};

export const capturePaypalPlanPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const { orderID, invoiceId } = req.body;

    if (!orderID || !invoiceId) {
      throw new AppError("orderID e invoiceId son requeridos", 400);
    }

    const invoice = await Invoices.findByPk(invoiceId);
    if (!invoice) {
      throw new AppError("Factura no encontrada", 404);
    }

    if (invoice.companyId !== companyId) {
      throw new AppError("No tienes permiso para capturar esta orden", 403);
    }

    if (invoice.status === "paid") {
      return res.json({
        success: true,
        status: "ALREADY_PAID",
        invoiceId: invoice.id,
        companyId
      });
    }

    const ppClient = await getPayPalClient();
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});

    const response = await ppClient.execute(request);
    const captureData = response.result;

    if (captureData.status !== "COMPLETED") {
      throw new AppError(`El pago PayPal no se completó. Estado: ${captureData.status}`, 400);
    }

    const purchaseUnit = captureData.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];
    const captureID = capture?.id || orderID;
    const customData = purchaseUnit?.custom_id ? JSON.parse(purchaseUnit.custom_id) : {};
    const paidPlanId = Number(customData.planId || invoice.planId);

    const result = await processPaidPlanPayment({
      invoice,
      companyId,
      planId: paidPlanId,
      paymentMethod: "paypal",
      paymentIntent: captureID,
      paypalOrderId: orderID
    });

    return res.json({
      success: true,
      status: "COMPLETED",
      captureID,
      invoiceId: result.invoice.id,
      companyId
    });
  } catch (error: any) {
    console.error("❌ Error capturando pago PayPal de plan:", error.message);
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ success: false, message: error.message });
    }
    return res.status(500).json({ success: false, message: error.message || "Error al capturar pago PayPal" });
  }
};

export const createWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const schema = Yup.object().shape({
    chave: Yup.string().required(),
    url: Yup.string().required()
  });


  try {
    await schema.validate(req.body, { abortEarly: false });
  } catch (err) {
    if (err instanceof Yup.ValidationError) {
      const errors = err.errors.join('\n');
      throw new AppError(`Validation error(s):\n${errors}`, 400);
    } else {
      throw err;
    }
  }

  const { chave, url } = req.body;

  const body = {
    webhookUrl: url
  };

  const params = {
    chave
  };

  try {
    const gerencianet = new Gerencianet(options);
    const create = await gerencianet.pixConfigWebhook(params, body);
    return res.json(create);
  } catch (error) {
  }
};

export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { type } = req.params;
  const { evento } = req.body;


  if (evento === "teste_webhook") {
    return res.json({ ok: true });
  }
  if (req.body.pix) {
    const gerencianet = new Gerencianet(options);
    req.body.pix.forEach(async (pix: any) => {
     try {
      const detahe = await gerencianet.pixDetailCharge({
        txid: pix.txid
      });

      if (detahe.status === "CONCLUIDA") {
        const { solicitacaoPagador } = detahe;
        const invoiceID = solicitacaoPagador.replace("#Fatura:", "");
        const invoices = await Invoices.findByPk(invoiceID);
        if (!invoices) return;
        const companyId = invoices.companyId;
        const company = await Company.findByPk(companyId);
        if (!company) return;

        const expiresAt = new Date(company.dueDate);
        expiresAt.setDate(expiresAt.getDate() + 30);
        const date = expiresAt.toISOString().split("T")[0];

        if (company) {
          await company.update({
            dueDate: date
          });
          const invoi = await invoices.update({
            status: 'paid'
          });
          await company.reload();
          const io = getIO();
          const companyUpdate = await Company.findOne({
            where: {
              id: companyId
            }
          });

          try {

            const companyId = company.id
            const whatsapps = await ListWhatsAppsService({ companyId: companyId });
            if (whatsapps.length > 0) {
              whatsapps.forEach(whatsapp => {
                StartWhatsAppSession(whatsapp, companyId);
              });
            }
          } catch (e) {
            Sentry.captureException(e);
          }

          io.emit(`company-${companyId}-payment`, {
            action: detahe.status,
            company: companyUpdate
          });
        }

      }
     } catch (e: any) {
      console.error(`[pix webhook] ${e?.message || e}`);
     }
    });

  }

  return res.json({ ok: true });
};

export const cancelsubscription = async (req, res) => {
  try {
    // 1. Recibe el subscriptionId desde el body
    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({ success: false, message: "subscriptionId es requerido" });
    }

    // 2. Obtener Stripe key desde la Company del SuperAdmin
    const superAdminUser = await User.findOne({ where: { super: true } });
    let key_STRIPE_PRIVATE = null;
    if (superAdminUser) {
      const superAdminCompany = await Company.findByPk(superAdminUser.companyId);
      key_STRIPE_PRIVATE = superAdminCompany?.stripeSecretKey;
    }

    if (!key_STRIPE_PRIVATE) {
      return res.status(500).json({ success: false, message: "Stripe key not found in SuperAdmin Company" });
    }

    const stripe = new Stripe(key_STRIPE_PRIVATE, { apiVersion: '2025-05-28.basil' as any, });

    // 3. Cancela la suscripción en Stripe
    const updated = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: true }
    );


    // 4. Opcional: aquí puedes actualizar tu base de datos (status en tus facturas...)

    return res.json({
      success: true,
      message: "Suscripción cancelada correctamente",
      stripe: updated,
    });
  } catch (err) {
    console.error("❌ Error al cancelar suscripción Stripe:", err);
    return res.status(500).json({
      success: false,
      message: "Error al cancelar la suscripción",
      error: err.message,
    });
  }
};
// export const paymentSuccess = async (req: Request, res: Response): Promise<void> => {
//   try {
//     //    try {
//     // Recuperar el parámetro `session_id` de la query
//     const sessionId = req.query.session_id as string;

//     if (!sessionId) {
//       res.status(400).json({
//         success: false,
//         message: "Missing session_id in the query parameters.",
//       });
//       return;
//     }


//     //console.log("session_id received:", sessionId);

//     // Crear los datos para el webhook
//     const webhookData = {
//       type: "checkout.session.completed",
//       data: {
//         object: {
//           id: sessionId, // Usar el session_id recibido
//         },
//       },
//     };

//     try {
//       await axios.post(
//         `https://appro.chateam.ws/subscription/stripewebhook`,
//         webhookData
//       );
//       //console.log('Webhook response:', req.query);
//       const successUrl = `${process.env.STRIPE_OK_URL}?success=true&message=Payment%20processed%20successfully`;
//       res.redirect(successUrl);
//     } catch (error: any) {
//         message: error.message,
//         response: error.response ? error.response.data : null,
//         status: error.response ? error.response.status : null,
//       });
//     }

//     //res.redirect(cancelUrl);

//     // // Enviar respuesta al frontend
//     // return res.json({
//     //   success: true,
//     //   message: "Payment processed successfully"
//     // });
//     const successUrl = `${process.env.STRIPE_OK_URL}?success=true&message=Payment%20processed%20successfully`;
//     res.redirect(successUrl);
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "Error processing payment"
//     });
//   }
// };


export const stripewebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  let event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = req.headers['stripe-signature'] as string | undefined;

    if (webhookSecret) {
      // Validar firma HMAC de Stripe (requiere raw body)
      const superAdminUser = await User.findOne({ where: { super: true } });
      const superAdminCompany = superAdminUser ? await Company.findByPk(superAdminUser.companyId) : null;
      const stripeKey = superAdminCompany?.stripeSecretKey;

      if (stripeKey) {
        const stripe = new Stripe(stripeKey, { apiVersion: '2025-05-28.basil' as any });
        if (sig) {
          // Usar req.body cuando express.raw procesó /subscription/stripewebhook.
          // Fallback a rawBody capturado por bodyParser.verify para compatibilidad.
          const rawBody = Buffer.isBuffer(req.body) ? req.body : (req as any).rawBody;
          if (!rawBody) {
            console.error("❌ [Stripe] rawBody no disponible — bodyParser verify no capturó el body");
            return res.status(500).json({ success: false, message: "Raw body no disponible para validación HMAC" });
          }

          // Soporta múltiples signing secrets separados por coma (varios endpoints / rotación).
          const secrets = webhookSecret.split(',').map(s => s.trim()).filter(Boolean);
          console.log(
            `🔐 [Stripe] Validando webhook: path=${req.originalUrl}, ` +
            `rawBytes=${rawBody.length}, sig=${sig.slice(0, 18)}..., ` +
            `secrets=${secrets.map(s => s.slice(0, 10) + '…').join(',')}, ` +
            `keyMode=${stripeKey.startsWith("sk_test_") ? "test" : stripeKey.startsWith("sk_live_") ? "live" : "unknown"}`
          );
          let lastErr: any = null;
          for (const secret of secrets) {
            try {
              event = stripe.webhooks.constructEvent(rawBody, sig, secret);
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (!event) {
            // Diagnóstico: parsear SIN verificar solo para ver qué evento es (no se procesa).
            let peek: any = null;
            try { peek = JSON.parse(rawBody.toString('utf8')); } catch { /* ignore */ }
            console.error(
              `❌ [Stripe] Ningún secret validó la firma. ` +
              `evento.type=${peek?.type || '?'}, id=${peek?.id || '?'}, ` +
              `livemode=${peek?.livemode}, account=${peek?.account || '-'}, ` +
              `sig=${sig.slice(0, 30)}, secretsProbados=${secrets.length}`
            );
            throw lastErr || new Error('Firma de webhook no válida');
          }
        } else {
          // [Fase A S-4] fail-closed: sin stripe-signature NO se procesa (evita webhooks forjados → plan/créditos gratis).
          console.error("❌ [Stripe] Webhook sin stripe-signature header — rechazado (400)");
          return res.status(400).json({ success: false, message: "Falta stripe-signature" });
        }
      } else {
        // [Fase A S-4] fail-closed: sin stripeSecretKey no se puede validar la firma → rechazar.
        console.error("❌ [Stripe] Sin stripeSecretKey configurada — webhook rechazado (400)");
        return res.status(400).json({ success: false, message: "Stripe no configurado para validación" });
      }
    } else {
      // [Fase A S-4] fail-closed: sin STRIPE_WEBHOOK_SECRET no hay validación HMAC posible → rechazar.
      console.error("❌ [Stripe] STRIPE_WEBHOOK_SECRET no configurado — webhook rechazado (400)");
      return res.status(400).json({ success: false, message: "Webhook secret no configurado" });
    }
  } catch (err: any) {
    console.error(
      "❌ Webhook Stripe inválido o firma no válida:",
      err.message,
      "| path:",
      req.originalUrl,
      "| hasRawBody:",
      Boolean((req as any).rawBody || Buffer.isBuffer(req.body)),
      "| hasSignature:",
      Boolean(req.headers['stripe-signature']),
      "| webhookSecretPrefix:",
      process.env.STRIPE_WEBHOOK_SECRET?.slice(0, 10)
    );
    return res.status(400).json({
      success: false,
      message: "Webhook inválido o firma no válida"
    });
  }

  // ✅ RESPUESTA INMEDIATA A STRIPE
  res.status(200).send("OK");

  // ⚙️ PROCESAMIENTO EN SEGUNDO PLANO
  (async () => {
    try {
      // Guarda: si el evento no tiene estructura válida, no truena el proceso.
      if (!event || !event.type || !event.data || !event.data.object) {
        console.error(
          "⚠️ [Stripe] Evento inválido o sin estructura — se omite. typeof event:",
          typeof event,
          "| keys:",
          event ? Object.keys(event).slice(0, 5) : "null"
        );
        return;
      }

      const eventType = event.type;
      const dataObject = event.data.object;

      console.log(`📦 [Stripe] Evento recibido: ${eventType} | id=${dataObject?.id} | metadata.type=${dataObject?.metadata?.type || '-'}`);

      switch (eventType) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(dataObject);
          break;

        // `invoice.paid` e `invoice.payment_succeeded` son eventos distintos en Stripe
        // pero ambos significan "la factura/renovación se cobró con éxito". Se manejan
        // igual para que las RENOVACIONES de suscripción extiendan los días aunque el
        // endpoint solo tenga suscrito uno de los dos.
        case "invoice.paid":
        case "invoice.payment_succeeded":
          await handleInvoicePaid(dataObject);
          break;

        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(dataObject);
          break;

        default:
          console.warn("⚠️ Evento no manejado:", eventType);
          break;
      }

    } catch (error: any) {
      console.error("❌ Error procesando webhook en segundo plano:", error.message);
    }
  })();

  // 👆 Importante: esta función no espera el resultado
};

async function handleCheckoutCompleted(dataObject: any) {
  const stripeId = dataObject.id;

  // ========== NUEVO: Verificar si es compra de AI Subplan ==========
  if (dataObject.metadata?.type === 'ai_subplan') {
    try {
      const { processSubplanPurchase } = require('./AISubplanPurchaseController');
      const companyId = Number(dataObject.metadata.companyId);
      const subplanId = Number(dataObject.metadata.subplanId);
      const tokens = Number(dataObject.metadata.tokens);

      await processSubplanPurchase(companyId, subplanId, tokens, stripeId);
      console.log(`✅ AI Subplan purchase completed: company=${companyId}, subplan=${subplanId}, tokens=${tokens}`);
      return; // No procesar como invoice normal
    } catch (error: any) {
      console.error(`❌ Error processing AI Subplan purchase:`, error.message);
      Sentry.captureException(error);
      return;
    }
  }
  // =================================================================

  const internalInvoiceId = dataObject.metadata?.internal_invoice_id || dataObject.client_reference_id;
  let invoice = await Invoices.findOne({ where: { stripe_id: stripeId } });

  if (!invoice && internalInvoiceId) {
    invoice = await Invoices.findByPk(internalInvoiceId);
  }

  if (!invoice) {
    console.warn("⚠️ Factura no encontrada para checkout.session.completed:", stripeId);
    return;
  }

  // Reclamo ATÓMICO. El `if (status === "paid") return` de antes era read-then-write:
  // dos reintentos concurrentes de Stripe leían ambos "no pagada" y ambos
  // procesaban → créditos y extensión de suscripción por duplicado.
  if (!(await claimInvoiceForPayment(invoice.id))) {
    console.log(`✅ Factura ${invoice.id} ya procesada para checkout ${stripeId}`);
    return;
  }

  await processPaidPlanPayment({
    invoice,
    companyId: invoice.companyId,
    planId: invoice.planId,
    paymentMethod: "stripe",
    paymentIntent: dataObject.payment_intent || dataObject.invoice || stripeId,
    stripeId,
    subscriptionId: dataObject.subscription || invoice.subscriptionId,
    customerId: dataObject.customer || invoice.customId,
    linkInvoice: dataObject.invoice_pdf
  });

}



async function handleInvoicePaid(dataObject: any) {
  const stripeInvoiceId = dataObject.id;
  const subscriptionId = dataObject.subscription || dataObject.parent?.subscription_details?.subscription;
  const customerId = dataObject.customer;
  const billingReason = dataObject.billing_reason;
  const paymentIntent = dataObject.payment_intent || stripeInvoiceId;
  const internalInvoiceId =
    dataObject.metadata?.internal_invoice_id ||
    dataObject.parent?.subscription_details?.metadata?.internal_invoice_id ||
    dataObject.lines?.data?.[0]?.metadata?.internal_invoice_id;

  const alreadyCreatedInvoice = await Invoices.findOne({
    where: { stripe_id: stripeInvoiceId }
  });

  if (alreadyCreatedInvoice?.status === "paid") {
    console.log(`✅ Stripe invoice ${stripeInvoiceId} ya fue procesada`);
    return;
  }

  let invoice: Invoices | null = null;

  if (subscriptionId && customerId) {
    invoice = await Invoices.findOne({
      where: { subscriptionId, customId: customerId }
    });
  }

  if (!invoice && internalInvoiceId) {
    invoice = await Invoices.findOne({
      where: { id: internalInvoiceId }
    });
  }

  if (!invoice) {
    console.warn("⚠️ Factura no encontrada en invoice.paid:", stripeInvoiceId);
    return;
  }

  const isInitialSubscriptionInvoice = billingReason === "subscription_create";

  if (isInitialSubscriptionInvoice && invoice.status === "paid") {
    await invoice.update({
      subscriptionId: subscriptionId || invoice.subscriptionId,
      customId: customerId || invoice.customId,
      payment_intent: paymentIntent,
      linkInvoice: dataObject.invoice_pdf || invoice.linkInvoice
    } as any);
    console.log(`✅ Factura inicial de suscripción ya pagada: ${invoice.id}`);
    return;
  }

  // Reclamo ATÓMICO — solo en el camino de la factura INICIAL.
  //
  // Ahí `createNewInvoice` es false: se ACTUALIZA la factura encontrada, así que
  // bloquear esa fila y marcarla pagada es exactamente el reclamo correcto.
  //
  // ⚠️ En la RENOVACIÓN (`createNewInvoice: true`) NO aplica: la factura
  // encontrada es la del ciclo anterior y sirve de plantilla — bloquearla no
  // impediría que dos webhooks concurrentes CREEN dos facturas nuevas para el
  // mismo `stripeInvoiceId`. Ahí el guard sigue siendo el read-then-write de
  // `alreadyCreatedInvoice` de más arriba, y la race sigue abierta. Cerrarla
  // necesita otra herramienta (índice UNIQUE sobre `stripe_id`, o un
  // findOrCreate atómico), no un lock de fila. Queda anotado en el plan como
  // pendiente, NO se finge arreglado.
  if (isInitialSubscriptionInvoice) {
    if (!(await claimInvoiceForPayment(invoice.id))) {
      console.log(`✅ Factura ${invoice.id} ya reclamada para ${stripeInvoiceId}`);
      return;
    }
  }

  await processPaidPlanPayment({
    invoice,
    companyId: invoice.companyId,
    planId: invoice.planId,
    paymentMethod: "stripe",
    paymentIntent,
    stripeId: isInitialSubscriptionInvoice ? invoice.stripe_id : stripeInvoiceId,
    subscriptionId: subscriptionId || invoice.subscriptionId,
    customerId: customerId || invoice.customId,
    linkInvoice: dataObject.invoice_pdf,
    createNewInvoice: !isInitialSubscriptionInvoice
  });

}


async function handleInvoicePaymentFailed(dataObject: any) {
  const stripeInvoiceId = dataObject.id;
  const subscriptionId = dataObject.subscription;
  const customerId = dataObject.customer;

  let invoice = await Invoices.findOne({
    where: { stripe_id: stripeInvoiceId }
  });

  if (!invoice && subscriptionId && customerId) {
    invoice = await Invoices.findOne({
      where: { subscriptionId, customId: customerId }
    });
  }

  if (!invoice) {
    console.warn("⚠️ Factura no encontrada en invoice.payment_failed:", stripeInvoiceId);
    return;
  }

  const {
    planId, detail, recurrence, companyId,
    value, users, connections, queues
  } = invoice;

  const newInvoiceData = {
    companyId,
    planId,
    recurrence,
    detail,
    value,
    users,
    status: "open",
    connections,
    queues,
    useWhatsapp: invoice.useWhatsapp,
    useFacebook: invoice.useFacebook,
    useInstagram: invoice.useInstagram,
    useCampaigns: invoice.useCampaigns,
    useSchedules: invoice.useSchedules,
    useInternalChat: invoice.useInternalChat,
    useExternalApi: invoice.useExternalApi,
    linkInvoice: dataObject.invoice_pdf,
    subscriptionId,
    customerId,
    dueDate: new Date().toISOString()
  };

  await CreateInvoiceService(newInvoiceData);

}










/**
 * ==========================================
 * APPLE IN-APP PURCHASE - VERIFICACIÓN
 * ==========================================
 * Endpoint para verificar una compra de Apple desde la app móvil
 */

export const verifyApplePurchase = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      receipt_data,
      transaction_id,
      product_id,
      platform,
      user_id,
      company_id,
      api_plan_id,
      bundle_id
    } = req.body;

    console.log('🍎 [APPLE VERIFY] Verificando compra:', {
      transaction_id,
      product_id,
      company_id,
      api_plan_id,
      bundle_id
    });

    // Validar campos requeridos
    if (!transaction_id || !product_id || !company_id || !api_plan_id || !bundle_id) {
      return res.status(400).json({
        success: false,
        message: 'Faltan campos requeridos'
      });
    }

    // Buscar el plan
    const plan = await Plan.findByPk(api_plan_id);
    if (!plan) {
      console.error(`❌ Plan no encontrado para planId: ${api_plan_id}`);
      return res.status(404).json({
        success: false,
        message: 'Plan no encontrado'
      });
    }

    // Buscar la empresa
    const company = await Company.findByPk(company_id);
    if (!company) {
      console.error(`❌ Empresa no encontrada para companyId: ${company_id}`);
      return res.status(404).json({
        success: false,
        message: 'Empresa no encontrada'
      });
    }

    // Verificar si ya existe una compra con este transaction_id
    let applePurchase = await ApplePurchase.findOne({
      where: { transactionId: transaction_id }
    });

    if (applePurchase) {
      console.log('⚠️ [APPLE VERIFY] Compra ya existe, actualizando...');

      // Actualizar la compra existente
      await applePurchase.update({
        status: 'verified',
        verifiedAt: new Date(),
        receiptData: receipt_data || applePurchase.receiptData
      });
    } else {
      console.log('✅ [APPLE VERIFY] Creando nueva compra...');

      // Crear nuevo registro de compra
      applePurchase = await ApplePurchase.create({
        companyId: company_id,
        planId: api_plan_id,
        userId: user_id,
        transactionId: transaction_id,
        originalTransactionId: transaction_id, // Por ahora usamos el mismo
        productId: product_id,
        bundleId: bundle_id,
        receiptData: receipt_data,
        platform: platform || 'ios',
        status: 'verified',
        purchaseDate: new Date(),
        verifiedAt: new Date()
      });
    }

    // Obtener la recurrencia del plan
    const recurrence = plan.recurrence; // 'MENSAL' o 'ANUAL'

    console.log('📅 [APPLE VERIFY] Actualizando fecha de vencimiento...', {
      companyId: company_id,
      planId: api_plan_id,
      recurrence
    });

    // Actualizar la fecha de vencimiento de la empresa
    await updateDueDateByCompanyId(company_id, api_plan_id, `${plan.name} - Apple`, recurrence);

    // Provisionar créditos IA para el nuevo ciclo (Apple)
    try {
      await ProvisionCreditsService({ companyId: company_id, planId: api_plan_id, mode: "renew" });
      console.log(`✅ Créditos IA provisionados (Apple): company=${company_id}, plan=${api_plan_id}`);
    } catch (e: any) {
      console.error(`❌ Error provisionando créditos IA (Apple):`, e.message);
      Sentry.captureException(e);
    }

    // Reiniciar sesiones de WhatsApp
    try {
      const whatsapps = await ListWhatsAppsService({ companyId: company_id });
      for (const wa of whatsapps) {
        await StartWhatsAppSession(wa, company_id);
      }
      console.log('✅ [APPLE VERIFY] Sesiones de WhatsApp reiniciadas');
    } catch (e) {
      console.error('❌ Error iniciando sesiones de WhatsApp:', e);
      Sentry.captureException(e);
    }

    // Emitir evento de socket
    const io = getIO();
    io.emit(`company-${company_id}-payment`, {
      action: 'apple_payment_verified',
      company: await Company.findByPk(company_id)
    });

    console.log(`✅ [APPLE VERIFY] Compra verificada exitosamente para company ${company_id}`);

    return res.status(200).json({
      success: true,
      message: 'Compra verificada exitosamente',
      data: {
        purchaseId: applePurchase.id,
        companyId: company_id,
        planId: api_plan_id,
        recurrence: recurrence,
        status: 'verified'
      }
    });

  } catch (error: any) {
    console.error('❌ Error verificando compra de Apple:', error.message);
    Sentry.captureException(error);

    return res.status(500).json({
      success: false,
      message: 'Error al verificar la compra',
      error: error.message
    });
  }
};

/**
 * ==========================================
 * APPLE IN-APP PURCHASE WEBHOOK
 * ==========================================
 * Procesa las notificaciones de App Store Server-to-Server
 * Documentación: https://developer.apple.com/documentation/appstoreservernotifications
 */


/**
 * Decodifica el JWT de Apple (sin verificar firma por ahora)
 * En producción, deberías verificar la firma con las claves públicas de Apple
 */
function decodeAppleJWT(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('JWT inválido');
    }
    const payload = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(payload);
  } catch (error) {
    console.error('❌ Error decodificando JWT de Apple:', error);
    return null;
  }
}

/**
 * Maneja suscripción exitosa o renovación
 */
async function handleAppleSubscriptionSuccess(transactionData: any, renewalData: any) {
  try {
    console.log('✅ [APPLE] Procesando suscripción exitosa');

    const originalTransactionId = transactionData.originalTransactionId;
    const transactionId = transactionData.transactionId;
    const productId = transactionData.productId;
    const purchaseDate = new Date(transactionData.purchaseDate);
    const expiresDate = new Date(transactionData.expiresDate);

    // Buscar la factura por originalTransactionId (este ID es único por usuario)
    const invoice = await Invoices.findOne({
      where: {
        appleTransactionId: originalTransactionId
      }
    });

    if (!invoice) {
      console.warn('⚠️ No se encontró factura para transactionId:', originalTransactionId);
      // Opcional: Crear una nueva factura si no existe
      return;
    }

    const { companyId, planId } = invoice;

    // Buscar el plan
    const plan = await Plan.findByPk(planId);
    if (!plan) {
      console.error(`❌ Plan no encontrado para planId: ${planId}`);
      return;
    }

    // Actualizar la factura
    await invoice.update({
      status: 'paid',
      appleTransactionId: originalTransactionId,
      appleLatestTransactionId: transactionId,
      appleProductId: productId,
      applePurchaseDate: purchaseDate,
      appleExpiresDate: expiresDate,
      dueDate: expiresDate.toISOString()
    });

    // Actualizar la fecha de vencimiento de la compañía
    const company = await Company.findByPk(companyId);
    if (company) {
      await company.update({
        dueDate: expiresDate.toISOString().split('T')[0]
      });

      // Reiniciar sesiones de WhatsApp
      try {
        const whatsapps = await ListWhatsAppsService({ companyId });
        for (const wa of whatsapps) {
          await StartWhatsAppSession(wa, companyId);
        }
      } catch (e) {
        console.error('❌ Error iniciando sesiones de WhatsApp:', e);
        Sentry.captureException(e);
      }

      // Emitir evento de socket
      const io = getIO();
      io.emit(`company-${companyId}-payment`, {
        action: 'apple_payment_success',
        company: await Company.findByPk(companyId)
      });
    }

    console.log(`✅ [APPLE] Suscripción procesada exitosamente para company ${companyId}`);

  } catch (error: any) {
    console.error('❌ Error en handleAppleSubscriptionSuccess:', error.message);
    Sentry.captureException(error);
  }
}

/**
 * Maneja suscripción expirada o fallo de renovación
 */
async function handleAppleSubscriptionExpired(transactionData: any, renewalData: any) {
  try {
    console.log('⚠️ [APPLE] Procesando suscripción expirada/fallo renovación');

    const originalTransactionId = transactionData.originalTransactionId;

    const invoice = await Invoices.findOne({
      where: { appleTransactionId: originalTransactionId }
    });

    if (!invoice) {
      console.warn('⚠️ No se encontró factura para transactionId:', originalTransactionId);
      return;
    }

    // Crear nueva factura pendiente
    const newInvoice = await Invoices.create({
      companyId: invoice.companyId,
      planId: invoice.planId,
      status: 'open',
      detail: invoice.detail,
      value: invoice.value,
      users: invoice.users,
      connections: invoice.connections,
      queues: invoice.queues,
      useWhatsapp: invoice.useWhatsapp,
      useFacebook: invoice.useFacebook,
      useInstagram: invoice.useInstagram,
      useCampaigns: invoice.useCampaigns,
      useSchedules: invoice.useSchedules,
      useInternalChat: invoice.useInternalChat,
      useExternalApi: invoice.useExternalApi,
      recurrence: invoice.recurrence,
      dueDate: new Date().toISOString()
    });

    console.log(`✅ [APPLE] Nueva factura creada ${newInvoice.id} por expiración`);

  } catch (error: any) {
    console.error('❌ Error en handleAppleSubscriptionExpired:', error.message);
    Sentry.captureException(error);
  }
}

/**
 * Maneja cambio de estado de renovación
 */
async function handleAppleRenewalStatusChange(transactionData: any, renewalData: any) {
  try {
    console.log('🔄 [APPLE] Procesando cambio de estado de renovación');

    const autoRenewStatus = renewalData?.autoRenewStatus;
    console.log('Auto-renew status:', autoRenewStatus);

    // Aquí puedes actualizar el estado en tu base de datos si lo necesitas

  } catch (error: any) {
    console.error('❌ Error en handleAppleRenewalStatusChange:', error.message);
  }
}

/**
 * Maneja reembolso de Apple
 */
async function handleAppleRefund(transactionData: any) {
  try {
    console.log('💰 [APPLE] Procesando reembolso');

    const originalTransactionId = transactionData.originalTransactionId;

    const invoice = await Invoices.findOne({
      where: { appleTransactionId: originalTransactionId }
    });

    if (!invoice) {
      console.warn('⚠️ No se encontró factura para transactionId:', originalTransactionId);
      return;
    }

    await invoice.update({ status: 'refunded' });

    // Ajustar fecha de vencimiento de la empresa
    const company = await Company.findByPk(invoice.companyId);
    if (company) {
      const plan = await Plan.findByPk(invoice.planId);
      if (plan) {
        const currentDueDate = new Date(company.dueDate);
        const daysToSubtract = plan.recurrence === 'MENSAL' ? 30 : 365;
        currentDueDate.setDate(currentDueDate.getDate() - daysToSubtract);
        await company.update({
          dueDate: currentDueDate.toISOString().split('T')[0]
        });
      }
    }

    console.log(`✅ [APPLE] Reembolso procesado para invoice ${invoice.id}`);

  } catch (error: any) {
    console.error('❌ Error en handleAppleRefund:', error.message);
    Sentry.captureException(error);
  }
}

/**
 * Maneja revocación de compra
 */
async function handleAppleRevoke(transactionData: any) {
  try {
    console.log('🚫 [APPLE] Procesando revocación');

    const originalTransactionId = transactionData.originalTransactionId;

    const invoice = await Invoices.findOne({
      where: { appleTransactionId: originalTransactionId }
    });

    if (!invoice) {
      console.warn('⚠️ No se encontró factura para transactionId:', originalTransactionId);
      return;
    }

    await invoice.update({ status: 'revoked' });

    console.log(`✅ [APPLE] Revocación procesada para invoice ${invoice.id}`);

  } catch (error: any) {
    console.error('❌ Error en handleAppleRevoke:', error.message);
    Sentry.captureException(error);
  }
}

export const refundPayment = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { invoiceId } = req.body;

    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "invoiceId es requerido"
      });
    }

    // 1. Buscar la factura
    const invoice = await Invoices.findByPk(invoiceId) as Invoices | null;
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Factura no encontrada"
      });
    }

    // 2. Verificar que la factura esté pagada
    if (invoice.status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "La factura no está pagada, no se puede reembolsar"
      });
    }

    // 3. Actualizar el status de la factura a "refunded"
    await invoice.update({
      status: "refunded"
    });

    // 4. Ajustar la fecha de vencimiento de la empresa (restar días del plan)
    const company = await Company.findByPk(invoice.companyId);
    if (company) {
      const currentDueDate = new Date(company.dueDate);

      // Buscar el plan para saber cuántos días restar
      const plan = await Plan.findByPk(invoice.planId);
      if (plan) {
        const daysToSubtract = plan.recurrence === "MENSAL" ? 30 :
          plan.recurrence === "ANUAL" ? 365 : 30;

        currentDueDate.setDate(currentDueDate.getDate() - daysToSubtract);
        await company.update({
          dueDate: currentDueDate.toISOString().split("T")[0]
        });

        console.log(`✅ Reembolso administrativo procesado para factura ${invoiceId}`);
        console.log(`📅 Nueva fecha de vencimiento: ${currentDueDate.toISOString().split("T")[0]}`);
      }
    }

    // 5. Crear nueva factura (copia de la reembolsada) con vencimiento en 1 mes
    const newDueDate = new Date();
    newDueDate.setMonth(newDueDate.getMonth() + 1); // +1 mes desde ahora

    const newInvoice = await Invoices.create({
      companyId: invoice.companyId,
      planId: invoice.planId,
      dueDate: newDueDate.toISOString().split("T")[0],
      detail: invoice.detail,
      status: "open", // Nueva factura pendiente de pago
      value: invoice.value,
      users: invoice.users,
      connections: invoice.connections,
      queues: invoice.queues,
      useWhatsapp: invoice.useWhatsapp,
      useFacebook: invoice.useFacebook,
      useInstagram: invoice.useInstagram,
      useCampaigns: invoice.useCampaigns,
      useSchedules: invoice.useSchedules,
      useInternalChat: invoice.useInternalChat,
      useExternalApi: invoice.useExternalApi,
      recurrence: invoice.recurrence,
      // Campos relacionados con pago se dejan en null/vacíos
      stripe_id: null,
      payment_intent: null,
      subscriptionId: null,
      customId: null,
      linkInvoice: null
    });

    console.log(`✅ Nueva factura creada ID=${newInvoice.id} con vencimiento en 1 mes: ${newDueDate.toISOString().split("T")[0]}`);

    // 6. Recargar la invoice completa para obtener todos los datos actualizados
    await invoice.reload();

    // 7. Emitir eventos por socket para actualizar en tiempo real
    const io = getIO();

    // Actualizar la factura reembolsada
    io.to(`company-${invoice.companyId}-notification`).emit("invoice", {
      action: "update",
      invoice: invoice.toJSON()
    });

    // Notificar sobre la nueva factura
    io.to(`company-${invoice.companyId}-notification`).emit("invoice", {
      action: "create",
      invoice: newInvoice.toJSON()
    });

    return res.json({
      success: true,
      message: "Reembolso procesado correctamente. Nueva factura generada.",
      invoice: {
        id: invoice.id,
        status: invoice.status,
        companyId: invoice.companyId,
        newDueDate: company?.dueDate
      },
      newInvoice: {
        id: newInvoice.id,
        status: newInvoice.status,
        dueDate: newInvoice.dueDate,
        value: newInvoice.value
      }
    });

  } catch (error: any) {
    console.error("❌ Error procesando reembolso:", error);
    return res.status(500).json({
      success: false,
      message: "Error al procesar el reembolso",
      error: error.message
    });
  }
};

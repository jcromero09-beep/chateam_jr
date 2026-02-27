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
var axios = require('axios');
import Plan from "../models/Plan.js";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService.js";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession.js";
import * as Sentry from "@sentry/node";
import { updateDueDateByCompanyId } from "../services/CompanyService/dateCompany.js";
import CreateInvoiceService from "../services/InvoicesService/CreateInvoiceService.js";
import ApplePurchase from "../models/ApplePurchase.js";
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
    //console.log("Erro linha 32")
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
  //console.log('parsedPlan', parsedPlan)
  //console.log('isRecurrent', isRecurrent)
  if (key_STRIPE_PRIVATE) {
    // Lógica para crear la sesión de Stripe dependiendo de si es un pago recurrente o único

    const priceId = parsedPlan.stripePriceId; // ID del precio del plan
    const stripe = new Stripe(key_STRIPE_PRIVATE, {
      apiVersion: '2025-05-28.basil' as any, // Versión compatible con tipos
    });

    const priceAmount = parseFloat(price) || 0;



    let sessionStripe;

    if (isRecurrent) {
      //console.log("suscripcion stripe", isRecurrent)
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
        subscription_data: {
          metadata: {
            internal_invoice_id: invoiceId.toString() // Doble referencia por seguridad
          }
        }
      });
      //console.log(`Sesión de Stripe creada para factura ${invoiceId}: ${sessionStripe.id}`);
    } else {
      //console.log("payment stripe", isRecurrent)
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
      });
    }

    //console.log('sessionStripe', sessionStripe);

    // Actualizamos la factura en la base de datos con el stripe_id
    const invoicesX = await Invoices.findByPk(invoiceId);
    const invoiX = await invoicesX.update({
      planId: parsedPlan.planId,
      detail: parsedPlan.title,
      recurrence: parsedPlan.description?.[3],
      stripe_id: sessionStripe.id,
    });

    // Generamos la URL de Stripe para redirigir al cliente al checkout
    // const stripeURL = sessionStripe.url;

    //console.log('stripeURL', sessionStripe.url);
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

export const createWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const schema = Yup.object().shape({
    chave: Yup.string().required(),
    url: Yup.string().required()
  });

  //console.log(req.body);

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
    //console.log(error);
  }
};

export const webhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { type } = req.params;
  const { evento } = req.body;

  ////console.log(req.body);
  ////console.log(req.params);

  if (evento === "teste_webhook") {
    return res.json({ ok: true });
  }
  if (req.body.pix) {
    const gerencianet = new Gerencianet(options);
    req.body.pix.forEach(async (pix: any) => {
      const detahe = await gerencianet.pixDetailCharge({
        txid: pix.txid
      });

      if (detahe.status === "CONCLUIDA") {
        const { solicitacaoPagador } = detahe;
        const invoiceID = solicitacaoPagador.replace("#Fatura:", "");
        const invoices = await Invoices.findByPk(invoiceID);
        const companyId = invoices.companyId;
        const company = await Company.findByPk(companyId);

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
//       console.error('Error in axios post:', {
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
//     console.error(error);
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
    event = req.body; // Si no estás validando la firma, esto está bien
    //console.log('event',event)
  } catch (err: any) {
    console.error("❌ Webhook malformado:", err.message);
    return res.status(400).json({
      success: false,
      message: "Webhook inválido o malformado"
    });
  }

  // ✅ RESPUESTA INMEDIATA A STRIPE
  res.status(200).send("OK");

  // ⚙️ PROCESAMIENTO EN SEGUNDO PLANO
  (async () => {
    try {
      const eventType = event.type;
      const dataObject = event.data.object;

      //console.log("📦 Stripe Event:", eventType, dataObject);

      switch (eventType) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(dataObject);
          break;

        case "invoice.paid":
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

  const invoice = await Invoices.findOne({ where: { stripe_id: stripeId } });

  if (!invoice) {
    console.warn("⚠️ Factura no encontrada para checkout.session.completed:", stripeId);
    return;
  }

  const { planId, detail, recurrence, companyId } = invoice;
  //console.log('planId', planId,'detail',detail, 'recurrence', recurrence,'companyId',companyId )
  // 1. Buscar el plan actual por planId
  const plan = await Plan.findByPk(planId);
  if (!plan) {
    console.error(`❌ Plan no encontrado para planId: ${planId}`);
    return;
  }

  // 2. Preparar los nuevos datos de la factura usando el plan actual
  const newInvoiceData = {
    companyId,
    recurrence: plan.recurrence,
    planId,
    detail: plan.name,          // O plan.title si usas ese campo
    value: plan.amount,                           // Usa el precio actual del plan
    users: plan.users,
    status: "paid",
    connections: plan.connections,
    queues: plan.queues,
    useWhatsapp: plan.useWhatsapp,
    useFacebook: plan.useFacebook,
    useInstagram: plan.useInstagram,
    useCampaigns: plan.useCampaigns,
    useSchedules: plan.useSchedules,
    useInternalChat: plan.useInternalChat,
    useExternalApi: plan.useExternalApi,
    linkInvoice: dataObject.invoice_pdf,
    subscriptionId: invoice.subscriptionId,
    customId: invoice.customId,
    payment_intent: dataObject.payment_intent as string,
    dueDate: new Date().toISOString()
  };

  // 3. Actualiza la factura existente con los nuevos datos
  await invoice.update(newInvoiceData as any);
  await updateDueDateByCompanyId(companyId, planId, detail || plan.name, recurrence);


  try {
    const whatsapps = await ListWhatsAppsService({ companyId });
    for (const wa of whatsapps) {
      await StartWhatsAppSession(wa, companyId);
    }
  } catch (e) {
    console.error("❌ Error iniciando sesiones de WhatsApp:", e);
    Sentry.captureException(e);
  }

  //console.log("✅ handleCheckoutCompleted finalizado correctamente.");
}



async function handleInvoicePaid(dataObject: any) {
  const stripeInvoiceId = dataObject.id;
  const subscriptionId = dataObject.parent?.subscription_details?.subscription;
  const customerId = dataObject.customer;
  const internalInvoiceId =
    dataObject.parent?.subscription_details?.metadata?.internal_invoice_id ||
    dataObject.lines?.data?.[0]?.metadata?.internal_invoice_id;

  let invoice = null;

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

  const {
    planId, detail, recurrence, companyId,
    value, users, connections, queues
  } = invoice;
  //console.log('planId', planId,'detail',detail, 'recurrence', recurrence,'companyId',companyId )
  const newInvoiceData = {
    companyId,
    recurrence,
    planId,
    detail,
    value,
    users,
    status: "paid",
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
    customId: customerId,
    payment_intent: dataObject.payment_intent as string,
    dueDate: new Date().toISOString()
  };


  await updateDueDateByCompanyId(companyId, planId, detail, recurrence);
  //console.log('newInvoiceData', newInvoiceData)
  await CreateInvoiceService(newInvoiceData);

  await Invoices.update(
    { status: "paid" },
    { where: { companyId } }
  );

  try {
    const whatsapps = await ListWhatsAppsService({ companyId });
    for (const wa of whatsapps) {
      await StartWhatsAppSession(wa, companyId);
    }
  } catch (e) {
    console.error("❌ Error iniciando sesiones de WhatsApp:", e);
    Sentry.captureException(e);
  }

  //console.log("✅ handleInvoicePaid finalizado correctamente.");
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

  //console.log("✅ handleInvoicePaymentFailed finalizado correctamente.");
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
    let invoice = await Invoices.findOne({
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
import axios from 'axios';
import Company from '../../models/Company';
import User from '../../models/User';
import { logPaymentError, logPaymentSuccess, logPaymentWarning, logPaymentInfo } from '../../utils/paymentLogger';

// PayPal API URLs
const PAYPAL_SANDBOX_URL = 'https://api-m.sandbox.paypal.com';
const PAYPAL_PRODUCTION_URL = 'https://api-m.paypal.com';

/**
 * Mapeo de recurrencia del sistema a intervalos de PayPal
 */
const RECURRENCE_MAP: Record<string, { interval_unit: string; interval_count: number }> = {
    'DIARIO': { interval_unit: 'DAY', interval_count: 1 },
    'SEMANAL': { interval_unit: 'WEEK', interval_count: 1 },
    'MENSAL': { interval_unit: 'MONTH', interval_count: 1 },
    'BIMENSAL': { interval_unit: 'MONTH', interval_count: 2 },
    'TRIMESTRAL': { interval_unit: 'MONTH', interval_count: 3 },
    'SEMESTRAL': { interval_unit: 'MONTH', interval_count: 6 },
    'ANUAL': { interval_unit: 'YEAR', interval_count: 1 },
};

interface PlanData {
    id?: number;
    name: string;
    amount: string;
    recurrence?: string;
    description?: string;
}

interface PaypalKeys {
    clientId: string;
    secretKey: string;
}

/**
 * Determina si usar sandbox o producción
 */
function getPaypalBaseUrl(): string {
    const useSandbox = process.env.PAYPAL_SANDBOX === 'true';
    return useSandbox ? PAYPAL_SANDBOX_URL : PAYPAL_PRODUCTION_URL;
}

/**
 * Obtiene las API keys de PayPal desde la Company del SuperAdmin
 */
export async function getPaypalKeysFromSuperAdmin(): Promise<PaypalKeys | null> {
    try {
        // Buscar usuario superadmin
        const superAdminUser = await User.findOne({
            where: { super: true }
        });

        if (!superAdminUser) {
            logPaymentWarning('paypal', 'getKeys', 'No se encontró usuario SuperAdmin');
            return null;
        }

        // Buscar la company del superadmin
        const company = await Company.findByPk(superAdminUser.companyId);

        if (!company) {
            logPaymentWarning('paypal', 'getKeys', 'No se encontró Company del SuperAdmin');
            return null;
        }

        const clientId = company.paypalClientId;
        const secretKey = company.paypalSecretKey;

        if (!clientId || !secretKey) {
            logPaymentWarning('paypal', 'getKeys', 'PayPal keys no configuradas en Company');
            return null;
        }

        return { clientId, secretKey };
    } catch (error) {
        logPaymentError('paypal', 'getKeys', error);
        return null;
    }
}

/**
 * Obtiene un access token de PayPal
 */
export async function getPaypalAccessToken(): Promise<string | null> {
    try {
        const keys = await getPaypalKeysFromSuperAdmin();
        if (!keys) return null;

        const baseUrl = getPaypalBaseUrl();
        const auth = Buffer.from(`${keys.clientId}:${keys.secretKey}`).toString('base64');

        const response = await axios.post(
            `${baseUrl}/v1/oauth2/token`,
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        return response.data.access_token;
    } catch (error) {
        logPaymentError('paypal', 'getAccessToken', error);
        return null;
    }
}

/**
 * Crea un producto en PayPal
 */
export async function createPaypalProduct(planData: PlanData): Promise<string | null> {
    try {
        const accessToken = await getPaypalAccessToken();
        if (!accessToken) {
            logPaymentError('paypal', 'createProduct', new Error('No se pudo obtener access token'), planData.id);
            return null;
        }

        const baseUrl = getPaypalBaseUrl();

        logPaymentInfo('paypal', 'createProduct', `Creando producto: ${planData.name}`, planData.id);

        const response = await axios.post(
            `${baseUrl}/v1/catalogs/products`,
            {
                name: planData.name,
                description: planData.description || `Plan ${planData.name}`,
                type: 'SERVICE',
                category: 'SOFTWARE',
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        const productId = response.data.id;
        logPaymentSuccess('paypal', 'createProduct', { productId, name: planData.name }, planData.id);
        return productId;

    } catch (error: any) {
        logPaymentError('paypal', 'createProduct', error, planData.id);
        return null;
    }
}

/**
 * Crea un plan de suscripción en PayPal
 */
export async function createPaypalPlan(
    productId: string,
    planData: PlanData
): Promise<string | null> {
    try {
        const accessToken = await getPaypalAccessToken();
        if (!accessToken) {
            logPaymentError('paypal', 'createPlan', new Error('No se pudo obtener access token'), planData.id);
            return null;
        }

        const baseUrl = getPaypalBaseUrl();

        // Obtener configuración de recurrencia
        const recurrenceConfig = RECURRENCE_MAP[planData.recurrence?.toUpperCase() || 'MENSAL'] || RECURRENCE_MAP['MENSAL'];

        // Convertir amount a formato con 2 decimales
        const amount = parseFloat(planData.amount).toFixed(2);

        logPaymentInfo('paypal', 'createPlan', `Creando plan: ${amount} USD, ${recurrenceConfig.interval_unit}/${recurrenceConfig.interval_count}`, planData.id);

        const response = await axios.post(
            `${baseUrl}/v1/billing/plans`,
            {
                product_id: productId,
                name: `${planData.name} - ${planData.recurrence || 'Mensual'}`,
                description: planData.description || `Suscripción ${planData.name}`,
                status: 'ACTIVE',
                billing_cycles: [
                    {
                        frequency: {
                            interval_unit: recurrenceConfig.interval_unit,
                            interval_count: recurrenceConfig.interval_count
                        },
                        tenure_type: 'REGULAR',
                        sequence: 1,
                        total_cycles: 0, // 0 = infinito
                        pricing_scheme: {
                            fixed_price: {
                                value: amount,
                                currency_code: 'USD'
                            }
                        }
                    }
                ],
                payment_preferences: {
                    auto_bill_outstanding: true,
                    setup_fee: {
                        value: '0',
                        currency_code: 'USD'
                    },
                    setup_fee_failure_action: 'CONTINUE',
                    payment_failure_threshold: 3
                }
            },
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            }
        );

        const planId = response.data.id;
        logPaymentSuccess('paypal', 'createPlan', { planId, productId, amount }, planData.id);
        return planId;

    } catch (error: any) {
        logPaymentError('paypal', 'createPlan', error, planData.id);
        return null;
    }
}

/**
 * Actualiza un producto en PayPal
 */
export async function updatePaypalProduct(
    productId: string,
    planData: PlanData
): Promise<boolean> {
    try {
        const accessToken = await getPaypalAccessToken();
        if (!accessToken) {
            logPaymentError('paypal', 'updateProduct', new Error('No se pudo obtener access token'), planData.id);
            return false;
        }

        const baseUrl = getPaypalBaseUrl();

        logPaymentInfo('paypal', 'updateProduct', `Actualizando producto: ${productId}`, planData.id);

        await axios.patch(
            `${baseUrl}/v1/catalogs/products/${productId}`,
            [
                {
                    op: 'replace',
                    path: '/description',
                    value: planData.description || `Plan ${planData.name}`
                }
            ],
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logPaymentSuccess('paypal', 'updateProduct', { productId }, planData.id);
        return true;

    } catch (error: any) {
        logPaymentError('paypal', 'updateProduct', error, planData.id);
        return false;
    }
}

/**
 * Desactiva un plan en PayPal
 */
export async function deactivatePaypalPlan(planId: string, localPlanId?: number): Promise<boolean> {
    try {
        const accessToken = await getPaypalAccessToken();
        if (!accessToken) {
            logPaymentError('paypal', 'deactivatePlan', new Error('No se pudo obtener access token'), localPlanId);
            return false;
        }

        const baseUrl = getPaypalBaseUrl();

        logPaymentInfo('paypal', 'deactivatePlan', `Desactivando plan: ${planId}`, localPlanId);

        await axios.post(
            `${baseUrl}/v1/billing/plans/${planId}/deactivate`,
            {},
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logPaymentSuccess('paypal', 'deactivatePlan', { planId }, localPlanId);
        return true;

    } catch (error: any) {
        logPaymentError('paypal', 'deactivatePlan', error, localPlanId);
        return false;
    }
}

/**
 * Crea producto y plan en PayPal de una sola vez
 * Retorna { productId, planId } o null si falla
 */
export async function createPaypalProductAndPlan(planData: PlanData): Promise<{ productId: string; planId: string } | null> {
    // Crear producto
    const productId = await createPaypalProduct(planData);
    if (!productId) {
        return null;
    }

    // Crear plan
    const planId = await createPaypalPlan(productId, planData);
    if (!planId) {
        // No podemos eliminar el producto de PayPal fácilmente, solo loggeamos
        logPaymentWarning('paypal', 'createProductAndPlan', `Producto creado (${productId}) pero falló la creación del plan`, planData.id);
        return null;
    }

    return { productId, planId };
}

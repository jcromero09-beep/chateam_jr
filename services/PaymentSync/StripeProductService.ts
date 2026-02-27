import Stripe from 'stripe';
import Company from '../../models/Company';
import User from '../../models/User';
import { logPaymentError, logPaymentSuccess, logPaymentWarning, logPaymentInfo } from '../../utils/paymentLogger';

// Stripe API version
const STRIPE_API_VERSION = '2023-10-16';

/**
 * Mapeo de recurrencia del sistema a intervalos de Stripe
 */
const RECURRENCE_MAP: Record<string, { interval: Stripe.PriceCreateParams.Recurring.Interval; interval_count: number }> = {
    'DIARIO': { interval: 'day', interval_count: 1 },
    'SEMANAL': { interval: 'week', interval_count: 1 },
    'MENSAL': { interval: 'month', interval_count: 1 },
    'BIMENSAL': { interval: 'month', interval_count: 2 },
    'TRIMESTRAL': { interval: 'month', interval_count: 3 },
    'SEMESTRAL': { interval: 'month', interval_count: 6 },
    'ANUAL': { interval: 'year', interval_count: 1 },
};

interface PlanData {
    id?: number;
    name: string;
    amount: string;
    recurrence?: string;
    description?: string;
}

interface StripeKeys {
    publicKey: string;
    secretKey: string;
}

/**
 * Obtiene las API keys de Stripe desde la Company del SuperAdmin
 */
export async function getStripeKeysFromSuperAdmin(): Promise<StripeKeys | null> {
    try {
        // Buscar usuario superadmin
        const superAdminUser = await User.findOne({
            where: { super: true }
        });

        if (!superAdminUser) {
            logPaymentWarning('stripe', 'getKeys', 'No se encontró usuario SuperAdmin');
            return null;
        }

        // Buscar la company del superadmin
        const company = await Company.findByPk(superAdminUser.companyId);

        if (!company) {
            logPaymentWarning('stripe', 'getKeys', 'No se encontró Company del SuperAdmin');
            return null;
        }

        const publicKey = company.stripePublicKey;
        const secretKey = company.stripeSecretKey;

        if (!secretKey) {
            logPaymentWarning('stripe', 'getKeys', 'Stripe Secret Key no configurada en Company');
            return null;
        }

        return { publicKey, secretKey };
    } catch (error) {
        logPaymentError('stripe', 'getKeys', error);
        return null;
    }
}

/**
 * Obtiene instancia de Stripe con las keys del SuperAdmin
 */
export async function getStripeInstance(): Promise<Stripe | null> {
    const keys = await getStripeKeysFromSuperAdmin();
    if (!keys) return null;

    return new Stripe(keys.secretKey, {
        apiVersion: STRIPE_API_VERSION as any,
    });
}

/**
 * Crea un producto en Stripe
 */
export async function createStripeProduct(planData: PlanData): Promise<string | null> {
    try {
        const stripe = await getStripeInstance();
        if (!stripe) {
            logPaymentError('stripe', 'createProduct', new Error('No se pudo obtener instancia de Stripe'), planData.id);
            return null;
        }

        logPaymentInfo('stripe', 'createProduct', `Creando producto: ${planData.name}`, planData.id);

        const product = await stripe.products.create({
            name: planData.name,
            description: planData.description || `Plan ${planData.name}`,
            metadata: {
                planId: String(planData.id || ''),
                source: 'chateam'
            }
        });

        logPaymentSuccess('stripe', 'createProduct', { productId: product.id, name: product.name }, planData.id);
        return product.id;

    } catch (error) {
        logPaymentError('stripe', 'createProduct', error, planData.id);
        return null;
    }
}

/**
 * Crea un precio recurrente en Stripe
 */
export async function createStripePrice(
    productId: string,
    planData: PlanData
): Promise<string | null> {
    try {
        const stripe = await getStripeInstance();
        if (!stripe) {
            logPaymentError('stripe', 'createPrice', new Error('No se pudo obtener instancia de Stripe'), planData.id);
            return null;
        }

        // Convertir amount a centavos (Stripe trabaja en centavos)
        const amountInCents = Math.round(parseFloat(planData.amount) * 100);

        if (isNaN(amountInCents) || amountInCents <= 0) {
            logPaymentError('stripe', 'createPrice', new Error(`Monto inválido: ${planData.amount}`), planData.id);
            return null;
        }

        // Obtener configuración de recurrencia
        const recurrenceConfig = RECURRENCE_MAP[planData.recurrence?.toUpperCase() || 'MENSAL'] || RECURRENCE_MAP['MENSAL'];

        logPaymentInfo('stripe', 'createPrice', `Creando precio: ${amountInCents} centavos, ${recurrenceConfig.interval}/${recurrenceConfig.interval_count}`, planData.id);

        const price = await stripe.prices.create({
            product: productId,
            unit_amount: amountInCents,
            currency: 'usd',
            recurring: {
                interval: recurrenceConfig.interval,
                interval_count: recurrenceConfig.interval_count,
            },
            metadata: {
                planId: String(planData.id || ''),
                planName: planData.name,
                source: 'chateam'
            }
        });

        logPaymentSuccess('stripe', 'createPrice', { priceId: price.id, amount: amountInCents }, planData.id);
        return price.id;

    } catch (error) {
        logPaymentError('stripe', 'createPrice', error, planData.id);
        return null;
    }
}

/**
 * Actualiza un producto en Stripe
 */
export async function updateStripeProduct(
    productId: string,
    planData: PlanData
): Promise<boolean> {
    try {
        const stripe = await getStripeInstance();
        if (!stripe) {
            logPaymentError('stripe', 'updateProduct', new Error('No se pudo obtener instancia de Stripe'), planData.id);
            return false;
        }

        logPaymentInfo('stripe', 'updateProduct', `Actualizando producto: ${productId}`, planData.id);

        await stripe.products.update(productId, {
            name: planData.name,
            description: planData.description || `Plan ${planData.name}`,
            metadata: {
                planId: String(planData.id || ''),
                source: 'chateam',
                updatedAt: new Date().toISOString()
            }
        });

        logPaymentSuccess('stripe', 'updateProduct', { productId }, planData.id);
        return true;

    } catch (error) {
        logPaymentError('stripe', 'updateProduct', error, planData.id);
        return false;
    }
}

/**
 * Archiva un producto en Stripe (no se puede eliminar si tiene precios activos)
 */
export async function archiveStripeProduct(productId: string, planId?: number): Promise<boolean> {
    try {
        const stripe = await getStripeInstance();
        if (!stripe) {
            logPaymentError('stripe', 'archiveProduct', new Error('No se pudo obtener instancia de Stripe'), planId);
            return false;
        }

        logPaymentInfo('stripe', 'archiveProduct', `Archivando producto: ${productId}`, planId);

        await stripe.products.update(productId, {
            active: false
        });

        logPaymentSuccess('stripe', 'archiveProduct', { productId }, planId);
        return true;

    } catch (error) {
        logPaymentError('stripe', 'archiveProduct', error, planId);
        return false;
    }
}

/**
 * Archiva un precio en Stripe
 */
export async function archiveStripePrice(priceId: string, planId?: number): Promise<boolean> {
    try {
        const stripe = await getStripeInstance();
        if (!stripe) {
            logPaymentError('stripe', 'archivePrice', new Error('No se pudo obtener instancia de Stripe'), planId);
            return false;
        }

        logPaymentInfo('stripe', 'archivePrice', `Archivando precio: ${priceId}`, planId);

        await stripe.prices.update(priceId, {
            active: false
        });

        logPaymentSuccess('stripe', 'archivePrice', { priceId }, planId);
        return true;

    } catch (error) {
        logPaymentError('stripe', 'archivePrice', error, planId);
        return false;
    }
}

/**
 * Crea producto y precio en Stripe de una sola vez
 * Retorna { productId, priceId } o null si falla
 */
export async function createStripeProductAndPrice(planData: PlanData): Promise<{ productId: string; priceId: string } | null> {
    // Crear producto
    const productId = await createStripeProduct(planData);
    if (!productId) {
        return null;
    }

    // Crear precio
    const priceId = await createStripePrice(productId, planData);
    if (!priceId) {
        // Si falla crear precio, archivar el producto
        await archiveStripeProduct(productId, planData.id);
        return null;
    }

    return { productId, priceId };
}

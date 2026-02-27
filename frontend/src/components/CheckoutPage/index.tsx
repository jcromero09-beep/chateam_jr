import { useState } from 'react'
import {
    Box,
    Typography,
    Stack,
    Card,
    CardContent,
    Button,
    Stepper,
    Step,
    StepIndicator,
    CircularProgress,
    Divider,
} from '@mui/joy'
import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    CheckCircle as CheckCircleIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import PaymentMethodSelector from './PaymentMethodSelector'
import PlanSelector from './PlanSelector'
import UploadReceipt from './UploadReceipt'

interface Invoice {
    id: number
    detail: string
    users: number
    connections: number
    queues: number
    value: number
    dueDate: string
    status: 'paid' | 'open' | 'proceso'
    subscriptionId?: string
    linkInvoice?: string
    planId?: number
    recurrence?: string
}

interface Plan {
    planId: number
    title: string
    price: number
    users: number
    connections: number
    queues: number
    stripePriceId?: string
    description?: string[]
}

interface CheckoutPageProps {
    invoice: Invoice
    onClose?: () => void
    onSuccess?: () => void
}

const steps = ['Planes', 'Método de Pago', 'Confirmar']

export default function CheckoutPage({ invoice, onClose, onSuccess }: CheckoutPageProps) {
    const { user } = useAuth()
    const [activeStep, setActiveStep] = useState(0)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Plan selection state
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)

    // Payment method state
    const [paymentMethod, setPaymentMethod] = useState<'stripe' | 'paypal' | 'outline'>('stripe')
    const [selectedMonths, setSelectedMonths] = useState(1)
    const [isRecurrent, setIsRecurrent] = useState(false)

    // Final values for submission
    const [finalValues, setFinalValues] = useState<any>(null)
    const [paymentSuccess, setPaymentSuccess] = useState(false)

    const invoiceId = invoice.id

    const getPlanPrice = () => {
        if (!selectedPlan) return 0
        return selectedPlan.price
    }

    const calculateTotal = () => {
        const price = getPlanPrice()
        return price * selectedMonths
    }

    // Create PayPal order
    const createPayPalOrder = async () => {
        try {
            const planId = selectedPlan?.planId
            const { data } = await api.post('/paypal/create-order', {
                invoiceId,
                planId,
                months: selectedMonths,
            })
            return data.orderID
        } catch (err) {
            toast.error('Error creando orden de PayPal')
            throw err
        }
    }

    // Capture PayPal order
    const capturePayPalOrder = async (orderID: string) => {
        try {
            const { data } = await api.post('/paypal/capture-order', {
                orderID,
                invoiceId,
            })
            toast.success('¡Pago realizado con éxito!')
            setPaymentSuccess(true)
            onSuccess?.()
            return data
        } catch (err) {
            toast.error('Error procesando pago de PayPal')
            throw err
        }
    }

    // Handle Stripe payment
    const handleStripePayment = async () => {
        setIsSubmitting(true)
        try {
            const newValues = {
                firstName: user?.name || '',
                lastName: '',
                plan: JSON.stringify(selectedPlan),
                price: selectedPlan?.price,
                users: selectedPlan?.users,
                connections: selectedPlan?.connections,
                invoiceId,
                isRecurrent,
                paymentMethod: 'stripe',
                months: selectedMonths,
            }

            const { data } = await api.post('/subscription', newValues)

            // Stripe returns a session URL to redirect to
            if (data.sessionUrl) {
                window.location.href = data.sessionUrl
            } else if (data.url) {
                window.location.href = data.url
            } else {
                toast.success('Redirigiendo a Stripe...')
                setPaymentSuccess(true)
                onSuccess?.()
            }
        } catch (err: any) {
            console.error('Stripe error:', err)
            toast.error(err?.response?.data?.error || 'Error procesando pago con Stripe')
        } finally {
            setIsSubmitting(false)
        }
    }

    // Handle form submission
    const handleSubmit = async () => {
        setIsSubmitting(true)

        if (paymentMethod === 'stripe') {
            await handleStripePayment()
        } else if (paymentMethod === 'paypal') {
            // PayPal is handled via PayPal buttons
            setFinalValues({
                plan: selectedPlan,
                invoiceId,
                months: selectedMonths,
            })
            setActiveStep(activeStep + 1)
            setIsSubmitting(false)
        } else if (paymentMethod === 'outline') {
            // For outline, go to upload step
            setFinalValues({
                plan: selectedPlan,
                invoiceId,
                months: selectedMonths,
            })
            setActiveStep(activeStep + 1)
            setIsSubmitting(false)
        }
    }

    const handleNext = () => {
        if (activeStep === 0 && !selectedPlan) {
            toast.warning('Por favor selecciona un plan')
            return
        }

        if (activeStep === 1) {
            // Submit form on step 1
            handleSubmit()
            return
        }

        setActiveStep(activeStep + 1)
    }

    const handleBack = () => {
        setActiveStep(activeStep - 1)
    }

    const handlePlanSelect = (plan: Plan) => {
        setSelectedPlan(plan)
    }

    const handlePaymentMethodChange = (method: 'stripe' | 'paypal' | 'outline') => {
        setPaymentMethod(method)
    }

    const handleMonthsChange = (months: number) => {
        setSelectedMonths(months)
    }

    const handleRecurrentChange = (isRec: boolean) => {
        setIsRecurrent(isRec)
    }

    const handleReceiptSuccess = () => {
        setPaymentSuccess(true)
        toast.success('Comprobante subido exitosamente. Esperando aprobación.')
        setTimeout(() => {
            onSuccess?.()
        }, 2000)
    }

    // Render step content
    const renderStepContent = () => {
        switch (activeStep) {
            case 0:
                return (
                    <PlanSelector
                        selectedPlan={selectedPlan}
                        onPlanSelect={handlePlanSelect}
                    />
                )
            case 1:
                return (
                    <PaymentMethodSelector
                        selectedMethod={paymentMethod}
                        onMethodChange={handlePaymentMethodChange}
                        selectedMonths={selectedMonths}
                        onMonthsChange={handleMonthsChange}
                        planPrice={getPlanPrice()}
                        isRecurrent={isRecurrent}
                        onRecurrentChange={handleRecurrentChange}
                    />
                )
            case 2:
                if (paymentMethod === 'outline') {
                    return (
                        <UploadReceipt
                            values={{
                                invoiceId,
                                plan: selectedPlan,
                                months: selectedMonths,
                            }}
                            onClose={handleBack}
                            onSuccess={handleReceiptSuccess}
                        />
                    )
                }
                // For PayPal, show PayPal button
                if (paymentMethod === 'paypal') {
                    return (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <Typography level="h4" sx={{ mb: 3 }}>
                                Total a pagar: ${calculateTotal().toFixed(2)} USD
                            </Typography>
                            <Typography level="body-md" sx={{ mb: 3 }}>
                                {selectedMonths} mes{selectedMonths > 1 ? 'es' : ''} x ${getPlanPrice().toFixed(2)}
                            </Typography>
                            <Button
                                size="lg"
                                color="success"
                                onClick={async () => {
                                    try {
                                        setIsSubmitting(true)
                                        const orderID = await createPayPalOrder()
                                        // Open PayPal popup or redirect
                                        // For now, we'll simulate the capture
                                        await capturePayPalOrder(orderID)
                                    } catch (err) {
                                        console.error('PayPal error:', err)
                                    } finally {
                                        setIsSubmitting(false)
                                    }
                                }}
                                loading={isSubmitting}
                                sx={{ minWidth: 250 }}
                            >
                                Pagar con PayPal
                            </Button>
                        </Box>
                    )
                }
                // Success state
                if (paymentSuccess) {
                    return (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <CheckCircleIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                            <Typography level="h3" sx={{ mb: 2 }}>
                                ¡Proceso completado!
                            </Typography>
                            <Typography level="body-md">
                                Tu pago está siendo procesado.
                            </Typography>
                        </Box>
                    )
                }
                return null
            default:
                return null
        }
    }

    return (
        <Box>
            <Typography level="h3" sx={{ textAlign: 'center', mb: 3 }}>
                PROCESO DE PAGO
            </Typography>

            {/* Stepper */}
            <Stepper sx={{ mb: 4 }}>
                {steps.map((step, index) => (
                    <Step
                        key={step}
                        indicator={
                            <StepIndicator
                                variant={activeStep >= index ? 'solid' : 'outlined'}
                                color={activeStep >= index ? 'primary' : 'neutral'}
                            >
                                {index + 1}
                            </StepIndicator>
                        }
                        sx={{
                            '&::after': {
                                bgcolor: activeStep > index ? 'primary.500' : 'neutral.300',
                            },
                        }}
                    >
                        <Typography
                            level="body-sm"
                            sx={{
                                fontWeight: activeStep === index ? 'bold' : 'normal',
                                color: activeStep >= index ? 'primary.main' : 'text.tertiary',
                            }}
                        >
                            {step}
                        </Typography>
                    </Step>
                ))}
            </Stepper>

            {/* Step Content */}
            <Box sx={{ minHeight: 300, mb: 3 }}>
                {renderStepContent()}
            </Box>

            <Divider sx={{ my: 2 }} />

            {/* Navigation Buttons */}
            <Stack direction="row" justifyContent="space-between">
                <Button
                    variant="outlined"
                    color="neutral"
                    startDecorator={<ArrowBackIcon />}
                    onClick={activeStep === 0 ? onClose : handleBack}
                    disabled={isSubmitting}
                >
                    {activeStep === 0 ? 'Cancelar' : 'Volver'}
                </Button>

                {activeStep < 2 && (
                    <Button
                        variant="solid"
                        color="primary"
                        endDecorator={isSubmitting ? <CircularProgress size="sm" /> : <ArrowForwardIcon />}
                        onClick={handleNext}
                        disabled={isSubmitting || (activeStep === 0 && !selectedPlan)}
                    >
                        {activeStep === 0 ? 'Siguiente' : activeStep === 1 ?
                            (paymentMethod === 'stripe' ? 'Pagar con Stripe' : 'Continuar') :
                            'Confirmar'}
                    </Button>
                )}
            </Stack>
        </Box>
    )
}

import {
    Box,
    Typography,
    Card,
    CardContent,
    Stack,
    Radio,
    RadioGroup,
    FormControl,
    FormLabel,
    Select,
    Option,
    Chip,
    Alert,
} from '@mui/joy'
import {
    CreditCard as CreditCardIcon,
    AccountBalanceWallet as PayPalIcon,
    CloudUpload as UploadIcon,
    Repeat as RepeatIcon,
    Info as InfoIcon,
} from '@mui/icons-material'

interface PaymentMethodSelectorProps {
    selectedMethod: 'stripe' | 'paypal' | 'outline'
    onMethodChange: (method: 'stripe' | 'paypal' | 'outline') => void
    selectedMonths: number
    onMonthsChange: (months: number) => void
    planPrice: number
    isRecurrent: boolean
    onRecurrentChange: (isRecurrent: boolean) => void
}

const paymentMethods = [
    {
        id: 'stripe' as const,
        title: 'Tarjeta de Crédito',
        description: 'Paga de forma segura con Stripe',
        icon: <CreditCardIcon sx={{ fontSize: 32 }} />,
        supportsRecurrent: true,
        supportsSinglePay: true,
        badges: ['Visa', 'Mastercard', 'AMEX'],
        color: '#635BFF',
    },
    {
        id: 'paypal' as const,
        title: 'PayPal',
        description: 'Pago único con tu cuenta PayPal',
        icon: <PayPalIcon sx={{ fontSize: 32 }} />,
        supportsRecurrent: false,
        supportsSinglePay: true,
        supportsMultipleMonths: true,
        badges: ['PayPal'],
        color: '#003087',
    },
    {
        id: 'outline' as const,
        title: 'Comprobante Manual',
        description: 'Sube tu comprobante de pago',
        icon: <UploadIcon sx={{ fontSize: 32 }} />,
        supportsRecurrent: false,
        supportsSinglePay: true,
        badges: ['Transferencia', 'Depósito'],
        color: '#FF9800',
    },
]

const monthOptions = [
    { value: 1, label: '1 mes (Mensual)', discount: 0 },
    { value: 2, label: '2 meses (Bimestral)', discount: 0 },
    { value: 3, label: '3 meses (Trimestral)', discount: 5 },
    { value: 6, label: '6 meses (Semestral)', discount: 10 },
    { value: 12, label: '12 meses (Anual)', discount: 15 },
]

export default function PaymentMethodSelector({
    selectedMethod,
    onMethodChange,
    selectedMonths,
    onMonthsChange,
    planPrice,
    isRecurrent,
    onRecurrentChange,
}: PaymentMethodSelectorProps) {

    const calculateTotal = () => {
        if (!planPrice) return 0
        const price = parseFloat(planPrice.toString())
        const months = selectedMonths || 1
        const monthOption = monthOptions.find((m) => m.value === months)
        const discount = monthOption?.discount || 0
        const subtotal = price * months
        const discountAmount = subtotal * (discount / 100)
        return subtotal - discountAmount
    }

    const getDiscount = () => {
        const monthOption = monthOptions.find((m) => m.value === selectedMonths)
        return monthOption?.discount || 0
    }

    return (
        <Box>
            <Typography level="h4" sx={{ mb: 3 }}>
                Selecciona tu método de pago
            </Typography>

            {/* Payment Method Cards */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 3 }}>
                {paymentMethods.map((method) => (
                    <Card
                        key={method.id}
                        variant={selectedMethod === method.id ? 'soft' : 'outlined'}
                        color={selectedMethod === method.id ? 'primary' : 'neutral'}
                        sx={{
                            flex: 1,
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            borderWidth: selectedMethod === method.id ? 2 : 1,
                            '&:hover': {
                                borderColor: 'primary.main',
                                transform: 'translateY(-2px)',
                            },
                        }}
                        onClick={() => onMethodChange(method.id)}
                    >
                        <CardContent sx={{ textAlign: 'center' }}>
                            {/* Radio */}
                            <Radio
                                checked={selectedMethod === method.id}
                                onChange={() => onMethodChange(method.id)}
                                color="primary"
                                sx={{ position: 'absolute', top: 8, right: 8 }}
                            />

                            {/* Icon */}
                            <Box
                                sx={{
                                    display: 'inline-flex',
                                    p: 1.5,
                                    borderRadius: 'md',
                                    bgcolor: `${method.color}20`,
                                    color: method.color,
                                    mb: 2,
                                }}
                            >
                                {method.icon}
                            </Box>

                            {/* Title & Description */}
                            <Typography level="title-md" sx={{ fontWeight: 600 }}>
                                {method.title}
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 1 }}>
                                {method.description}
                            </Typography>

                            {/* Badges */}
                            <Stack direction="row" spacing={0.5} justifyContent="center" flexWrap="wrap" useFlexGap>
                                {method.badges.map((badge) => (
                                    <Chip key={badge} size="sm" variant="outlined">
                                        {badge}
                                    </Chip>
                                ))}
                            </Stack>

                            {/* Feature chips */}
                            {method.supportsRecurrent && (
                                <Chip
                                    size="sm"
                                    startDecorator={<RepeatIcon sx={{ fontSize: 14 }} />}
                                    sx={{
                                        mt: 1,
                                        bgcolor: '#E8F5E9',
                                        color: '#2E7D32',
                                    }}
                                >
                                    Suscripción disponible
                                </Chip>
                            )}

                            {method.supportsMultipleMonths && (
                                <Chip
                                    size="sm"
                                    sx={{
                                        mt: 1,
                                        bgcolor: '#E3F2FD',
                                        color: '#1565C0',
                                    }}
                                >
                                    Pago por múltiples meses
                                </Chip>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </Stack>

            {/* Stripe Options */}
            {selectedMethod === 'stripe' && (
                <Card variant="soft" color="primary" sx={{ mb: 3 }}>
                    <CardContent>
                        <FormControl>
                            <FormLabel>Tipo de pago</FormLabel>
                            <RadioGroup
                                orientation="horizontal"
                                value={isRecurrent ? 'recurring' : 'single'}
                                onChange={(e) => onRecurrentChange(e.target.value === 'recurring')}
                            >
                                <Radio value="single" label="Pago único" />
                                <Radio value="recurring" label="Suscripción mensual" />
                            </RadioGroup>
                        </FormControl>
                        {isRecurrent && (
                            <Alert
                                color="primary"
                                variant="soft"
                                startDecorator={<InfoIcon />}
                                sx={{ mt: 2 }}
                            >
                                Se realizará un cargo automático cada mes hasta que canceles la suscripción.
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* PayPal Options */}
            {selectedMethod === 'paypal' && (
                <Card variant="soft" color="success" sx={{ mb: 3 }}>
                    <CardContent>
                        <FormControl sx={{ mb: 2 }}>
                            <FormLabel>¿Cuántos meses deseas pagar?</FormLabel>
                            <Select
                                value={selectedMonths}
                                onChange={(_, value) => onMonthsChange(value as number)}
                                sx={{ maxWidth: 300 }}
                            >
                                {monthOptions.map((option) => (
                                    <Option key={option.value} value={option.value}>
                                        {option.label}
                                        {option.discount > 0 && ` (-${option.discount}%)`}
                                    </Option>
                                ))}
                            </Select>
                        </FormControl>

                        {/* Price Preview */}
                        <Card variant="outlined">
                            <CardContent>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    Precio por mes: ${(planPrice || 0).toFixed(2)}
                                </Typography>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    Meses seleccionados: {selectedMonths}
                                </Typography>
                                {getDiscount() > 0 && (
                                    <Typography level="body-sm" sx={{ color: 'success.main' }}>
                                        Descuento aplicado: {getDiscount()}%
                                    </Typography>
                                )}
                                <Box sx={{ mt: 1 }}>
                                    <Typography level="body-sm">Total a pagar:</Typography>
                                    <Typography
                                        level="h3"
                                        sx={{ color: 'primary.main', fontWeight: 'bold' }}
                                    >
                                        ${calculateTotal().toFixed(2)} USD
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>

                        {selectedMonths >= 6 && (
                            <Alert
                                color="success"
                                variant="soft"
                                startDecorator={<InfoIcon />}
                                sx={{ mt: 2 }}
                            >
                                Ahorra tiempo pagando por adelantado varios meses.
                            </Alert>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Outline Instructions */}
            {selectedMethod === 'outline' && (
                <Card variant="soft" color="warning" sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography level="title-md" sx={{ fontWeight: 500, color: '#E65100', mb: 2 }}>
                            Instrucciones para pago manual:
                        </Typography>
                        <Stack spacing={1}>
                            <Typography level="body-sm">
                                1. Realiza tu transferencia o depósito a la cuenta indicada
                            </Typography>
                            <Typography level="body-sm">
                                2. Toma una captura o foto del comprobante
                            </Typography>
                            <Typography level="body-sm">
                                3. Sube el comprobante en el siguiente paso
                            </Typography>
                            <Typography level="body-sm">
                                4. El administrador verificará tu pago y activará tu cuenta
                            </Typography>
                        </Stack>
                        <Typography level="body-xs" sx={{ mt: 2, fontStyle: 'italic' }}>
                            * El tiempo de activación depende de la verificación del pago
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {/* Summary */}
            <Card variant="outlined">
                <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                Total a pagar
                            </Typography>
                            <Typography level="h2">
                                ${(selectedMethod === 'paypal' ? calculateTotal() : planPrice || 0).toFixed(2)} USD
                            </Typography>
                        </Box>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    )
}

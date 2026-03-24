import { useState, useEffect } from 'react'
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Stack,
    Chip,
    IconButton,
    CircularProgress,
    ToggleButtonGroup,
    ButtonGroup,
} from '@mui/joy'
import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    Check as CheckIcon,
    Email as EmailIcon,
    WorkspacePremium as SubscriptionIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../../services/api'

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

interface EmailPlan {
    id: number
    name: string
    price: string
    emailCreditsPerCycle: number
    maxEmailSendsPerDay: number
    maxTemplates: number
    recurrence: string
    stripePriceId?: string
}

interface PlanSelectorProps {
    selectedPlan: Plan | null
    onPlanSelect: (plan: Plan) => void
}

export default function PlanSelector({ selectedPlan, onPlanSelect }: PlanSelectorProps) {
    const [plans, setPlans] = useState<Plan[]>([])
    const [emailPlans, setEmailPlans] = useState<EmailPlan[]>([])
    const [currentPlanIndex, setCurrentPlanIndex] = useState(0)
    const [currentEmailPlanIndex, setCurrentEmailPlanIndex] = useState(0)
    const [loading, setLoading] = useState(true)
    const [planType, setPlanType] = useState<'subscription' | 'email'>('subscription')

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                setLoading(true)

                // Fetch subscription plans
                const { data: subscriptionData } = await api.get('/plans/all')
                const plansArray = Array.isArray(subscriptionData) ? subscriptionData : (subscriptionData.plans || [])

                const formattedPlans = plansArray
                    .filter((plan: any) => plan.id !== 1)
                    .map((plan: any) => ({
                        planId: plan.id,
                        title: plan.name,
                        price: Number(plan.amount),
                        users: plan.users,
                        connections: plan.connections,
                        queues: plan.queues,
                        stripePriceId: plan.stripePriceId,
                        description: [
                            `${plan.users} Usuarios`,
                            `${plan.connections} Conexiones`,
                            `${plan.queues} Colas`,
                            plan.recurrence || 'Mensual',
                        ],
                    }))

                // Fetch email plans
                try {
                    const { data: emailData } = await api.get('/email-plans')
                    setEmailPlans(Array.isArray(emailData.data) ? emailData.data : [])
                } catch (emailErr) {
                    console.error('Error fetching email plans:', emailErr)
                    setEmailPlans([])
                }

                setPlans(formattedPlans)
            } catch (err) {
                console.error('Error fetching plans:', err)
                toast.error('Error al cargar los planes')
            } finally {
                setLoading(false)
            }
        }

        fetchPlans()
    }, [])

    const handlePlanChange = (direction: 'next' | 'prev') => {
        if (planType === 'subscription') {
            if (direction === 'next') {
                setCurrentPlanIndex((prev) => (prev + 1) % plans.length)
            } else {
                setCurrentPlanIndex((prev) => (prev - 1 + plans.length) % plans.length)
            }
        } else {
            if (direction === 'next') {
                setCurrentEmailPlanIndex((prev) => (prev + 1) % emailPlans.length)
            } else {
                setCurrentEmailPlanIndex((prev) => (prev - 1 + emailPlans.length) % emailPlans.length)
            }
        }
    }

    const handleSelectPlan = () => {
        if (planType === 'subscription') {
            const plan = plans[currentPlanIndex]
            if (plan) {
                onPlanSelect(plan)
            }
        } else {
            // For email plans, we need to convert to a compatible format
            // The checkout will handle this differently
            const emailPlan = emailPlans[currentEmailPlanIndex]
            if (emailPlan) {
                // Convert email plan to subscription plan format
                const convertedPlan: Plan = {
                    planId: emailPlan.id,
                    title: emailPlan.name,
                    price: Number(emailPlan.price),
                    users: 0,
                    connections: 0,
                    queues: 0,
                    stripePriceId: emailPlan.stripePriceId,
                    description: [
                        `${emailPlan.emailCreditsPerCycle} Créditos/mes`,
                        `${emailPlan.maxEmailSendsPerDay} Envíos/día`,
                        `${emailPlan.maxTemplates} Plantillas`,
                        emailPlan.recurrence || 'Mensual',
                    ],
                }
                onPlanSelect(convertedPlan)
            }
        }
    }

    const handlePlanTypeChange = (value: string) => {
        setPlanType(value as 'subscription' | 'email')
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <CircularProgress />
            </Box>
        )
    }

    const currentPlan = planType === 'subscription' ? plans[currentPlanIndex] : null
    const currentEmailPlan = planType === 'email' ? emailPlans[currentEmailPlanIndex] : null
    const hasPlans = planType === 'subscription' ? plans.length > 0 : emailPlans.length > 0

    const isSelected = selectedPlan &&
        (planType === 'subscription'
            ? selectedPlan.planId === currentPlan?.planId
            : selectedPlan.planId === currentEmailPlan?.id)

    if (!hasPlans) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-lg">
                    {planType === 'subscription'
                        ? 'No hay planes de suscripción disponibles'
                        : 'No hay planes de email disponibles'
                    }
                </Typography>
            </Box>
        )
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Plan Type Selector */}
            <ToggleButtonGroup
                value={planType}
                onChange={(_, value) => value && handlePlanTypeChange(value)}
                sx={{ mb: 3, width: '100%', maxWidth: 400 }}
            >
                <Button value="subscription">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <SubscriptionIcon />
                        <Typography level="body-md">Suscripción</Typography>
                    </Stack>
                </Button>
                <Button value="email">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <EmailIcon />
                        <Typography level="body-md">Plan de Email</Typography>
                    </Stack>
                </Button>
            </ToggleButtonGroup>

            {planType === 'subscription' && plans.length > 0 && (
                <Card
                    variant={isSelected ? 'soft' : 'outlined'}
                    color={isSelected ? 'primary' : 'neutral'}
                    sx={{
                        minWidth: 350,
                        maxWidth: 400,
                        transition: 'all 0.3s ease',
                        boxShadow: isSelected ? 'lg' : 'sm',
                        borderWidth: isSelected ? 2 : 1,
                    }}
                >
                    <CardContent>
                        {/* Plan Header */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography level="h3">{currentPlan?.title}</Typography>
                            {isSelected && (
                                <Chip color="primary" startDecorator={<CheckIcon />}>
                                    Seleccionado
                                </Chip>
                            )}
                        </Stack>

                        {/* Price */}
                        <Box sx={{ textAlign: 'center', mb: 3 }}>
                            <Typography
                                level="h1"
                                sx={{
                                    fontSize: '3rem',
                                    fontWeight: 'bold',
                                    color: 'primary.main',
                                }}
                            >
                                ${currentPlan?.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </Typography>
                            <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                                /mes
                            </Typography>
                        </Box>

                        {/* Features */}
                        <Stack spacing={1.5} sx={{ mb: 3 }}>
                            {currentPlan?.description?.map((feature, index) => (
                                <Stack key={index} direction="row" spacing={1} alignItems="center">
                                    <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                                    <Typography level="body-md">{feature}</Typography>
                                </Stack>
                            ))}
                        </Stack>

                        {/* Select Button */}
                        <Button
                            fullWidth
                            variant={isSelected ? 'solid' : 'outlined'}
                            color="primary"
                            size="lg"
                            onClick={handleSelectPlan}
                            startDecorator={isSelected ? <CheckIcon /> : null}
                        >
                            {isSelected ? 'Plan Seleccionado' : 'Seleccionar Plan'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {planType === 'email' && emailPlans.length > 0 && (
                <Card
                    variant={isSelected ? 'soft' : 'outlined'}
                    color={isSelected ? 'primary' : 'neutral'}
                    sx={{
                        minWidth: 350,
                        maxWidth: 400,
                        transition: 'all 0.3s ease',
                        boxShadow: isSelected ? 'lg' : 'sm',
                        borderWidth: isSelected ? 2 : 1,
                    }}
                >
                    <CardContent>
                        {/* Plan Header */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <EmailIcon color="primary" />
                                <Typography level="h3">{currentEmailPlan?.name}</Typography>
                            </Stack>
                            {isSelected && (
                                <Chip color="primary" startDecorator={<CheckIcon />}>
                                    Seleccionado
                                </Chip>
                            )}
                        </Stack>

                        {/* Price */}
                        <Box sx={{ textAlign: 'center', mb: 3 }}>
                            <Typography
                                level="h1"
                                sx={{
                                    fontSize: '3rem',
                                    fontWeight: 'bold',
                                    color: 'primary.main',
                                }}
                            >
                                ${Number(currentEmailPlan?.price || 0).toFixed(2)}
                            </Typography>
                            <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                                /{currentEmailPlan?.recurrence?.toLowerCase() || 'mes'}
                            </Typography>
                        </Box>

                        {/* Features */}
                        <Stack spacing={1.5} sx={{ mb: 3 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                                <Typography level="body-md">
                                    <strong>{currentEmailPlan?.emailCreditsPerCycle}</strong> créditos/mes
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                                <Typography level="body-md">
                                    <strong>{currentEmailPlan?.maxEmailSendsPerDay}</strong> envíos/día
                                </Typography>
                            </Stack>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CheckIcon sx={{ fontSize: 18, color: 'success.main' }} />
                                <Typography level="body-md">
                                    <strong>{currentEmailPlan?.maxTemplates}</strong> plantillas
                                </Typography>
                            </Stack>
                        </Stack>

                        {/* Select Button */}
                        <Button
                            fullWidth
                            variant={isSelected ? 'solid' : 'outlined'}
                            color="primary"
                            size="lg"
                            onClick={handleSelectPlan}
                            startDecorator={isSelected ? <CheckIcon /> : null}
                        >
                            {isSelected ? 'Plan Seleccionado' : 'Seleccionar Plan'}
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Navigation */}
            {hasPlans && (
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 3 }}>
                    <IconButton
                        variant="outlined"
                        color="neutral"
                        onClick={() => handlePlanChange('prev')}
                        disabled={(planType === 'subscription' ? plans.length : emailPlans.length) <= 1}
                    >
                        <ArrowBackIcon />
                    </IconButton>

                    <Typography level="body-sm">
                        {planType === 'subscription'
                            ? `${currentPlanIndex + 1} / ${plans.length}`
                            : `${currentEmailPlanIndex + 1} / ${emailPlans.length}`
                        }
                    </Typography>

                    <IconButton
                        variant="outlined"
                        color="neutral"
                        onClick={() => handlePlanChange('next')}
                        disabled={(planType === 'subscription' ? plans.length : emailPlans.length) <= 1}
                    >
                        <ArrowForwardIcon />
                    </IconButton>
                </Stack>
            )}

            {selectedPlan && (
                <Typography
                    level="title-md"
                    sx={{ mt: 2, color: 'primary.main', fontWeight: 'bold' }}
                >
                    Plan actual: {selectedPlan.title}
                </Typography>
            )}
        </Box>
    )
}

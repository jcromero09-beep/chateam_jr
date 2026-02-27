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
} from '@mui/joy'
import {
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,

    Check as CheckIcon,
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

interface PlanSelectorProps {
    selectedPlan: Plan | null
    onPlanSelect: (plan: Plan) => void
}

export default function PlanSelector({ selectedPlan, onPlanSelect }: PlanSelectorProps) {
    const [plans, setPlans] = useState<Plan[]>([])
    const [currentPlanIndex, setCurrentPlanIndex] = useState(0)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                setLoading(true)
                const { data } = await api.get('/plans/all')

                // Handle both array and object response formats
                const plansArray = Array.isArray(data) ? data : (data.plans || [])

                // Filter out Demo plan (id = 1) and format plans
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
        if (direction === 'next') {
            setCurrentPlanIndex((prev) => (prev + 1) % plans.length)
        } else {
            setCurrentPlanIndex((prev) => (prev - 1 + plans.length) % plans.length)
        }
    }

    const handleSelectPlan = () => {
        const plan = plans[currentPlanIndex]
        onPlanSelect(plan)
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
                <CircularProgress />
            </Box>
        )
    }

    if (plans.length === 0) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography level="body-lg">No hay planes disponibles</Typography>
            </Box>
        )
    }

    const currentPlan = plans[currentPlanIndex]
    const isSelected = selectedPlan?.planId === currentPlan.planId

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
                        <Typography level="h3">{currentPlan.title}</Typography>
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
                            ${currentPlan.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </Typography>
                        <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                            /mes
                        </Typography>
                    </Box>

                    {/* Features */}
                    <Stack spacing={1.5} sx={{ mb: 3 }}>
                        {currentPlan.description?.map((feature, index) => (
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

            {/* Navigation */}
            {plans.length > 1 && (
                <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 3 }}>
                    <IconButton
                        variant="outlined"
                        color="neutral"
                        onClick={() => handlePlanChange('prev')}
                        disabled={plans.length <= 1}
                    >
                        <ArrowBackIcon />
                    </IconButton>

                    <Typography level="body-sm">
                        {currentPlanIndex + 1} / {plans.length}
                    </Typography>

                    <IconButton
                        variant="outlined"
                        color="neutral"
                        onClick={() => handlePlanChange('next')}
                        disabled={plans.length <= 1}
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

import { useState, useRef } from 'react'
import {
    Box,
    Typography,
    Card,
    CardContent,
    Button,
    Stack,
    FormControl,
    FormLabel,

    Textarea,
    Alert,
    CircularProgress,
} from '@mui/joy'
import {
    CloudUpload as UploadIcon,

    Delete as DeleteIcon,
    CheckCircle as CheckIcon,
    InsertDriveFile as FileIcon,
} from '@mui/icons-material'
import { toast } from 'react-toastify'
import api from '../../services/api'

interface Plan {
    planId: number
    title: string
    price: number
    users?: number
    connections?: number
    queues?: number
    description?: string[]
}

interface UploadReceiptProps {
    values: {
        invoiceId: number
        plan: Plan | null
        months?: number
    }
    onClose?: () => void
    onSuccess?: () => void
}

export default function UploadReceipt({ values, onClose, onSuccess }: UploadReceiptProps) {
    const [file, setFile] = useState<File | null>(null)
    const [descripcion, setDescripcion] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadSuccess, setUploadSuccess] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/pdf',
    ]

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = event.target.files?.[0]

        if (selectedFile && allowedTypes.includes(selectedFile.type)) {
            setFile(selectedFile)
        } else {
            toast.error('Formato de archivo no válido. Use: JPG, PNG, GIF o PDF')
            setFile(null)
        }
    }

    const handleRemoveFile = () => {
        setFile(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const handleSubmit = async () => {
        if (!file) {
            toast.error('Por favor selecciona un archivo')
            return
        }

        if (!descripcion.trim()) {
            toast.error('Por favor ingresa una descripción')
            return
        }

        setIsSubmitting(true)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('descripcion', descripcion)
            formData.append('invoiceId', values.invoiceId?.toString() || '')

            if (values.plan) {
                formData.append('totalPrice', values.plan.price?.toString() || '')
                formData.append('planId', values.plan.planId?.toString() || '')
                formData.append('planName', values.plan.title || '')
                formData.append('duration', values.months?.toString() || '1')
            }

            // Log form data for debugging
            console.log('Uploading receipt with data:')
            for (const [key, value] of formData.entries()) {
                console.log(`${key}:`, value)
            }

            await api.post('/recepts', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            })

            toast.success('Comprobante subido exitosamente')
            setUploadSuccess(true)

            // Call onSuccess callback
            if (onSuccess) {
                setTimeout(() => {
                    onSuccess()
                }, 2000)
            }
        } catch (error: any) {
            console.error('Error al subir el archivo:', error)
            toast.error(error?.response?.data?.error || 'Error al subir el archivo')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (uploadSuccess) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
                <Typography level="h3" sx={{ mb: 2 }}>
                    ¡Comprobante subido exitosamente!
                </Typography>
                <Typography level="body-md" sx={{ color: 'text.tertiary' }}>
                    Tu comprobante está siendo revisado. Te notificaremos cuando sea aprobado.
                </Typography>
                <Alert color="warning" variant="soft" sx={{ mt: 3 }}>
                    El tiempo de verificación puede ser de hasta 24 horas hábiles.
                </Alert>
            </Box>
        )
    }

    return (
        <Box>
            <Typography level="h4" sx={{ mb: 3, textAlign: 'center' }}>
                Subir Comprobante de Pago
            </Typography>

            {/* Plan Summary */}
            {values.plan && (
                <Card variant="outlined" sx={{ mb: 3 }}>
                    <CardContent>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography level="title-md">{values.plan.title}</Typography>
                                <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                    Plan seleccionado
                                </Typography>
                            </Box>
                            <Typography level="h3" sx={{ color: 'primary.main' }}>
                                ${values.plan.price?.toFixed(2)}
                            </Typography>
                        </Stack>
                    </CardContent>
                </Card>
            )}

            {/* Instructions */}
            <Alert color="primary" variant="soft" sx={{ mb: 3 }}>
                <Stack spacing={1}>
                    <Typography level="title-sm">Instrucciones:</Typography>
                    <Typography level="body-sm">
                        • Asegúrate de que el comprobante sea legible
                    </Typography>
                    <Typography level="body-sm">
                        • El monto debe coincidir con el valor del plan
                    </Typography>
                    <Typography level="body-sm">
                        • Formatos aceptados: JPG, PNG, GIF, PDF
                    </Typography>
                </Stack>
            </Alert>

            <Stack spacing={3}>
                {/* Description Field */}
                <FormControl required>
                    <FormLabel>Descripción</FormLabel>
                    <Textarea
                        placeholder="Ej: Transferencia bancaria, número de operación, etc."
                        value={descripcion}
                        onChange={(e) => setDescripcion(e.target.value)}
                        minRows={2}
                    />
                </FormControl>

                {/* File Upload */}
                <FormControl required>
                    <FormLabel>Archivo del comprobante</FormLabel>
                    <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileSelect}
                        accept=".jpg,.jpeg,.png,.gif,.pdf"
                    />

                    {!file ? (
                        <Card
                            variant="outlined"
                            sx={{
                                textAlign: 'center',
                                py: 4,
                                cursor: 'pointer',
                                borderStyle: 'dashed',
                                '&:hover': {
                                    borderColor: 'primary.main',
                                    bgcolor: 'primary.softBg',
                                },
                            }}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <UploadIcon sx={{ fontSize: 48, color: 'text.tertiary', mb: 1 }} />
                            <Typography level="body-md">
                                Haz clic para seleccionar un archivo
                            </Typography>
                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                JPG, PNG, GIF o PDF (máx. 10MB)
                            </Typography>
                        </Card>
                    ) : (
                        <Card variant="soft">
                            <CardContent>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Stack direction="row" spacing={2} alignItems="center">
                                        <FileIcon sx={{ fontSize: 32, color: 'primary.main' }} />
                                        <Box>
                                            <Typography level="body-md">{file.name}</Typography>
                                            <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
                                                {(file.size / 1024).toFixed(1)} KB
                                            </Typography>
                                        </Box>
                                    </Stack>
                                    <Button
                                        variant="plain"
                                        color="danger"
                                        startDecorator={<DeleteIcon />}
                                        onClick={handleRemoveFile}
                                    >
                                        Eliminar
                                    </Button>
                                </Stack>
                            </CardContent>
                        </Card>
                    )}
                </FormControl>

                {/* Submit Button */}
                <Button
                    size="lg"
                    color="primary"
                    startDecorator={isSubmitting ? <CircularProgress size="sm" /> : <UploadIcon />}
                    onClick={handleSubmit}
                    disabled={!file || !descripcion.trim() || isSubmitting}
                    fullWidth
                >
                    {isSubmitting ? 'Subiendo...' : 'Subir Comprobante'}
                </Button>

                {/* Cancel Button */}
                {onClose && (
                    <Button
                        variant="outlined"
                        color="neutral"
                        onClick={onClose}
                        disabled={isSubmitting}
                        fullWidth
                    >
                        Cancelar
                    </Button>
                )}
            </Stack>
        </Box>
    )
}

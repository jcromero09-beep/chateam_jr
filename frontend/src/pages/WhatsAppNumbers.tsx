import { useState } from 'react'
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  Sheet,
  Chip,
  IconButton,
  Modal,
  ModalDialog,
  Input,
  FormControl,
  FormLabel,
  Grid,
} from '@mui/joy'
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Phone as PhoneIcon,
} from '@mui/icons-material'

interface PhoneNumber {
  id: number
  phoneNumber: string
  displayName: string
  wabaId: string
  phoneNumberId: string
  status: 'active' | 'pending' | 'inactive' | 'error'
  verifiedName: string
  quality: number
  tier: string
  messagingLimit: string
  createdAt: string
}

export default function WhatsAppNumbers() {
  const [numbers] = useState<PhoneNumber[]>([
    {
      id: 1,
      phoneNumber: '+1 555-0123',
      displayName: 'Soporte Principal',
      wabaId: 'WABA_12345678',
      phoneNumberId: 'PHONE_87654321',
      status: 'active',
      verifiedName: 'JR Chateam Support',
      quality: 95,
      tier: 'standard',
      messagingLimit: '1000/day',
      createdAt: '2025-01-15',
    },
    {
      id: 2,
      phoneNumber: '+1 555-0456',
      displayName: 'Ventas México',
      wabaId: 'WABA_23456789',
      phoneNumberId: 'PHONE_98765432',
      status: 'active',
      verifiedName: 'JR Chateam Sales MX',
      quality: 88,
      tier: 'standard',
      messagingLimit: '1000/day',
      createdAt: '2025-02-20',
    },
    {
      id: 3,
      phoneNumber: '+1 555-0789',
      displayName: 'Marketing LATAM',
      wabaId: 'WABA_34567890',
      phoneNumberId: 'PHONE_09876543',
      status: 'error',
      verifiedName: 'JR Chateam Marketing',
      quality: 0,
      tier: 'standard',
      messagingLimit: '0/day',
      createdAt: '2025-03-10',
    },
  ])

  const [openModal, setOpenModal] = useState(false)
  const [editingNumber, setEditingNumber] = useState<PhoneNumber | null>(null)

  const handleAdd = () => {
    setEditingNumber(null)
    setOpenModal(true)
  }

  const handleEdit = (number: PhoneNumber) => {
    setEditingNumber(number)
    setOpenModal(true)
  }

  const handleDelete = (id: number) => {
    console.log('Eliminar número:', id)
  }

  const getStatusColor = (status: PhoneNumber['status']) => {
    switch (status) {
      case 'active':
        return 'success'
      case 'pending':
        return 'warning'
      case 'inactive':
        return 'neutral'
      case 'error':
        return 'danger'
      default:
        return 'neutral'
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography level="h2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            <PhoneIcon sx={{ fontSize: 32 }} />
            Gestión de Números WhatsApp
          </Typography>
          <Typography level="body-sm" sx={{ color: 'text.tertiary' }}>
            Administra tus números de teléfono de WhatsApp Business API
          </Typography>
        </Box>
        <Button startDecorator={<AddIcon />} onClick={handleAdd}>
          Agregar Número
        </Button>
      </Box>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Total de Números
              </Typography>
              <Typography level="h3">{numbers.length}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Números Activos
              </Typography>
              <Typography level="h3" sx={{ color: 'success.500' }}>
                {numbers.filter((n) => n.status === 'active').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Con Errores
              </Typography>
              <Typography level="h3" sx={{ color: 'danger.500' }}>
                {numbers.filter((n) => n.status === 'error').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Typography level="body-sm" sx={{ color: 'text.tertiary', mb: 0.5 }}>
                Calidad Promedio
              </Typography>
              <Typography level="h3" sx={{ color: 'primary.500' }}>
                {Math.round(
                  numbers.reduce((acc, n) => acc + n.quality, 0) / numbers.length
                )}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Sheet sx={{ overflow: 'auto' }}>
            <Table>
              <thead>
                <tr>
                  <th style={{ width: 180 }}>Número</th>
                  <th style={{ width: 150 }}>Nombre Verificado</th>
                  <th style={{ width: 120 }}>Estado</th>
                  <th style={{ width: 150 }}>WABA ID</th>
                  <th style={{ width: 100 }}>Calidad</th>
                  <th style={{ width: 120 }}>Límite Diario</th>
                  <th style={{ width: 120 }}>Fecha Creación</th>
                  <th style={{ width: 120, textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {numbers.map((number) => (
                  <tr key={number.id}>
                    <td>
                      <Box>
                        <Typography level="body-sm" fontWeight="lg">
                          {number.phoneNumber}
                        </Typography>
                        <Typography level="body-xs" sx={{ color: 'text.tertiary' }}>
                          {number.displayName}
                        </Typography>
                      </Box>
                    </td>
                    <td>
                      <Typography level="body-sm">{number.verifiedName}</Typography>
                    </td>
                    <td>
                      <Chip
                        size="sm"
                        color={getStatusColor(number.status)}
                        startDecorator={
                          number.status === 'active' ? <CheckCircleIcon /> : <ErrorIcon />
                        }
                      >
                        {number.status.charAt(0).toUpperCase() + number.status.slice(1)}
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-xs" fontFamily="monospace">
                        {number.wabaId}
                      </Typography>
                    </td>
                    <td>
                      <Chip size="sm" color={number.quality >= 80 ? 'success' : 'warning'}>
                        {number.quality}%
                      </Chip>
                    </td>
                    <td>
                      <Typography level="body-sm">{number.messagingLimit}</Typography>
                    </td>
                    <td>
                      <Typography level="body-xs">{number.createdAt}</Typography>
                    </td>
                    <td>
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <IconButton
                          size="sm"
                          variant="plain"
                          onClick={() => handleEdit(number)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton size="sm" variant="plain" color="neutral">
                          <QrCodeIcon />
                        </IconButton>
                        <IconButton
                          size="sm"
                          variant="plain"
                          color="danger"
                          onClick={() => handleDelete(number.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Sheet>
        </CardContent>
      </Card>

      {/* Modal Crear/Editar */}
      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <ModalDialog sx={{ minWidth: 500 }}>
          <Typography level="h4" sx={{ mb: 2 }}>
            {editingNumber ? 'Editar Número' : 'Agregar Número'}
          </Typography>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Número de Teléfono</FormLabel>
            <Input
              placeholder="+1 555-0000"
              defaultValue={editingNumber?.phoneNumber}
            />
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Nombre para Mostrar</FormLabel>
            <Input
              placeholder="Ej: Soporte Principal"
              defaultValue={editingNumber?.displayName}
            />
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>WABA ID</FormLabel>
            <Input
              placeholder="WABA_XXXXXXXX"
              defaultValue={editingNumber?.wabaId}
            />
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Phone Number ID</FormLabel>
            <Input
              placeholder="PHONE_XXXXXXXX"
              defaultValue={editingNumber?.phoneNumberId}
            />
          </FormControl>

          <FormControl sx={{ mb: 2 }}>
            <FormLabel>Nombre Verificado (Meta)</FormLabel>
            <Input
              placeholder="Tu Empresa S.A."
              defaultValue={editingNumber?.verifiedName}
            />
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" color="neutral" onClick={() => setOpenModal(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setOpenModal(false)}>
              {editingNumber ? 'Actualizar' : 'Crear'}
            </Button>
          </Box>
        </ModalDialog>
      </Modal>
    </Box>
  )
}

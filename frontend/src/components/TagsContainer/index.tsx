import { useState, useEffect, useRef } from 'react'
import {
  Box,
  Chip,
  Autocomplete,
  AutocompleteOption,
  ListItemContent,
  Typography,
  createFilterOptions,
} from '@mui/joy'
import api from '../../services/api'
import { toast } from 'react-toastify'

interface Tag {
  id: number
  name: string
  color: string
  kanban?: number
}

interface Contact {
  id: number
  name: string
  tags?: Tag[]
}

interface TagsContainerProps {
  contact: Contact
  /** Si true, el control queda en solo lectura (modo no-edición del drawer). */
  disabled?: boolean
  /** Notifica al padre las etiquetas sincronizadas para reflejarlas en tiempo real. */
  onTagsChange?: (tags: Tag[]) => void
}

const filter = createFilterOptions<Tag | string>()

function getRandomHexColor(): string {
  const red = Math.floor(Math.random() * 256)
  const green = Math.floor(Math.random() * 256)
  const blue = Math.floor(Math.random() * 256)
  return `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
}

export function TagsContainer({ contact, disabled = false, onTagsChange }: TagsContainerProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [selecteds, setSelecteds] = useState<Tag[]>([])
  const isMounted = useRef(true)

  useEffect(() => {
    return () => {
      isMounted.current = false
    }
  }, [])

  // Cargar el catálogo de etiquetas disponibles una sola vez (no depende del contacto).
  useEffect(() => {
    loadTags()
  }, [])

  // Sincronizar las etiquetas seleccionadas SOLO cuando cambia el contacto (por id).
  // Antes dependía del objeto `contact` completo y se re-ejecutaba en cada patch/merge
  // del ticket, pisando las etiquetas recién agregadas (bug: solo se veía la última /
  // no se reflejaban en tiempo real).
  useEffect(() => {
    setSelecteds(Array.isArray(contact.tags) ? contact.tags : [])
  }, [contact.id])

  const createTag = async (data: { name: string; kanban: number; color: string }) => {
    try {
      const response = await api.post('/tags', data)
      return response.data
    } catch (err) {
      console.error('Error creating tag:', err)
      toast.error('Error al crear etiqueta')
    }
  }

  const loadTags = async () => {
    try {
      const response = await api.get('/tags/list', { params: { kanban: 0 } })
      setTags(response.data || [])
    } catch (err) {
      console.error('Error loading tags:', err)
    }
  }

  const syncTags = async (data: { contactId: number; tags: Tag[] }) => {
    try {
      const response = await api.post('/tags/sync', data)
      return response.data
    } catch (err) {
      console.error('Error syncing tags:', err)
      toast.error('Error al sincronizar etiquetas')
    }
  }

  const handleChange = async (
    _event: React.SyntheticEvent,
    newValue: (Tag | string)[]
  ) => {
    const optionsChanged: Tag[] = []

    for (const item of newValue) {
      if (typeof item === 'string') {
        // Create new tag
        if (item.length < 3) {
          toast.error('La etiqueta es muy corta (mínimo 3 caracteres)')
          return
        }
        const newTag = await createTag({
          name: item,
          kanban: 0,
          color: getRandomHexColor(),
        })
        if (newTag) {
          optionsChanged.push(newTag)
        }
      } else {
        optionsChanged.push(item)
      }
    }

    await loadTags()
    setSelecteds(optionsChanged)
    await syncTags({ contactId: contact.id, tags: optionsChanged })
    // Reflejar en el padre (header/lista/drawer) al instante, sin esperar recarga.
    onTagsChange?.(optionsChanged)
  }

  return (
    <Box sx={{ width: '100%' }}>
      <Autocomplete
        multiple
        freeSolo
        size="sm"
        disabled={disabled}
        options={tags}
        value={selecteds}
        onChange={handleChange}
        getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
        isOptionEqualToValue={(option, value) =>
          typeof option !== 'string' && typeof value !== 'string' && option.id === value.id
        }
        filterOptions={(options, params) => {
          const filtered = filter(options, params as any)
          const { inputValue } = params
          // Suggest creating a new tag
          const isExisting = options.some(
            (option) => typeof option !== 'string' && option.name.toLowerCase() === inputValue.toLowerCase()
          )
          if (inputValue !== '' && !isExisting) {
            filtered.push(inputValue)
          }
          return filtered as Tag[]
        }}
        renderTags={(value, getTagProps) =>
          value.map((option, index) => {
            const tag = typeof option === 'string' ? { name: option, color: '#666' } : option
            const { key, ...tagProps } = getTagProps({ index })
            return (
              <Chip
                key={key}
                size="sm"
                sx={{
                  bgcolor: tag.color || '#eee',
                  color: 'white',
                  fontWeight: 'bold',
                  fontSize: '0.75rem',
                }}
                {...tagProps}
              >
                {tag.name}
              </Chip>
            )
          })
        }
        renderOption={(props, option) => {
          const { key, ...optionProps } = props as any
          if (typeof option === 'string') {
            return (
              <AutocompleteOption key={key} {...optionProps}>
                <ListItemContent>
                  <Typography level="body-sm">Crear "{option}"</Typography>
                </ListItemContent>
              </AutocompleteOption>
            )
          }
          return (
            <AutocompleteOption key={key} {...optionProps}>
              <Chip
                size="sm"
                sx={{
                  bgcolor: option.color,
                  color: 'white',
                  mr: 1,
                }}
              >
                {option.name}
              </Chip>
            </AutocompleteOption>
          )
        }}
        placeholder="Etiquetas..."
      />
    </Box>
  )
}

export default TagsContainer

import { Box } from '@mui/joy'
import ModelCard from './ModelCard'
import type { FalCatalogEntry } from '../../services/ugcModelSelectorService'

interface ModelGalleryGridProps {
  models: FalCatalogEntry[]
  selectedKey: string | null
  onSelect: (model: FalCatalogEntry) => void
}

/**
 * Grid responsivo: 4 col desktop, 3 col laptop, 2 col tablet, 1 col mobile.
 */
function ModelGalleryGrid({
  models,
  selectedKey,
  onSelect
}: ModelGalleryGridProps) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: '1fr',
          sm: 'repeat(2, 1fr)',
          md: 'repeat(3, 1fr)',
          lg: 'repeat(4, 1fr)'
        }
      }}
    >
      {models.map(model => (
        <ModelCard
          key={model.key}
          model={model}
          selected={selectedKey === model.key}
          onClick={() => onSelect(model)}
        />
      ))}
    </Box>
  )
}

export default ModelGalleryGrid

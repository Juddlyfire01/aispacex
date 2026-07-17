import { useState } from 'react'
import { ImageView } from './image-view'
import { ImageTools, type ImageToolsSeed } from './image-tools'
import { SubTabs } from '../ui/sub-tabs'
import { blobToDataUrl } from '../../lib/media-blob'
import { toast } from '../../stores/toast-store'
import type { GalleryItemView } from '../../hooks/use-media-gallery'
import type { ImageToolAction } from '../media/media-gallery'

type ImageTab = 'generate' | 'tools'

const TABS = [
  { id: 'generate' as const, label: 'Generate' },
  { id: 'tools' as const, label: 'Tools' },
]

export function ImagePage() {
  const [tab, setTab] = useState<ImageTab>('generate')
  const [toolsSeed, setToolsSeed] = useState<ImageToolsSeed | null>(null)

  const handleOpenInTools = (item: GalleryItemView, tool: ImageToolAction) => {
    void (async () => {
      try {
        const dataUrl = await blobToDataUrl(item.blob)
        setToolsSeed({
          tool,
          dataUrl,
          name: item.prompt.trim().slice(0, 48) || 'gallery',
        })
        setTab('tools')
      } catch (err) {
        toast.fromError(err, 'Could not open in tools')
      }
    })()
  }

  return (
    <div className="flex flex-col h-full">
      <SubTabs tabs={TABS} value={tab} onChange={setTab} className="px-4" />
      <div className="flex-1 min-h-0">
        {tab === 'generate' ? (
          <ImageView onOpenInTools={handleOpenInTools} />
        ) : (
          <ImageTools seed={toolsSeed} onSeedConsumed={() => setToolsSeed(null)} />
        )}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { ImageView } from './image-view'
import { ImageTools } from './image-tools'
import { SubTabs } from '../ui/sub-tabs'

type ImageTab = 'generate' | 'tools'

const TABS = [
  { id: 'generate' as const, label: 'Generate' },
  { id: 'tools' as const, label: 'Edit / Upscale / BG Remove' },
]

export function ImagePage() {
  const [tab, setTab] = useState<ImageTab>('generate')

  return (
    <div className="flex flex-col h-full">
      <SubTabs tabs={TABS} value={tab} onChange={setTab} className="px-4" />
      <div className="flex-1 min-h-0">
        {tab === 'generate' ? <ImageView /> : <ImageTools />}
      </div>
    </div>
  )
}

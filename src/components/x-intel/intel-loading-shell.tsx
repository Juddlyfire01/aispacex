import { useXIntelStore, type IntelTopTab } from '../../stores/x-intel-store'
import { SubTabs } from '../ui/sub-tabs'
import { ViewLoadingFallback, VIEW_LOADING_LABEL } from '../ui/spinner'

/** Same top tabs as IntelView — kept here so the route Suspense shell can match layout
 *  without importing the heavy intel-view module. */
const TOP_TABS: { id: IntelTopTab; label: string }[] = [
  { id: 'me', label: 'You' },
  { id: 'targets', label: 'Others' },
  { id: 'post', label: 'Post' },
]

/**
 * Full Intel loading shell: top tabs + centered spinner.
 * Use for the route Suspense fallback AND nested pane Suspense so the spinner
 * never jumps when the tab bar appears or the label would otherwise change.
 */
export function IntelLoadingShell({
  label = VIEW_LOADING_LABEL.intel,
}: {
  label?: string
}) {
  const activeTopTab = useXIntelStore((s) => s.activeTopTab)

  return (
    <div className="flex flex-col h-full min-h-0">
      <SubTabs
        tabs={TOP_TABS}
        value={activeTopTab}
        onChange={() => {}}
        className="px-4 pointer-events-none"
      />
      <div className="flex-1 min-h-0">
        <ViewLoadingFallback label={label} />
      </div>
    </div>
  )
}

import type { VeniceModel } from '../../types/venice'
import { useXIntelStore } from '../../stores/x-intel-store'
import { useXSelfStore } from '../../stores/x-self-store'
import { pickSynthesisModel, shouldUpgradeSynthesisModel } from './synthesis-model'

/** Apply the chosen synthesis model to every target and self account. */
export function syncSynthesisModelGlobally(model: string): void {
  useXIntelStore.getState().setGlobalSynthesisModel(model)
  useXSelfStore.getState().setGlobalSynthesisModel(model)
}

/** Upgrade legacy / stale defaults once the live text model catalog is available. */
export function resolveDefaultSynthesisModel(models: VeniceModel[]): void {
  const picked = pickSynthesisModel(models)
  const intel = useXIntelStore.getState()
  const self = useXSelfStore.getState()

  const intelDefault = intel.defaultSynthesisSettings.model
  if (shouldUpgradeSynthesisModel(intelDefault, models)) {
    intel.upgradeSynthesisModelDefaults(picked, models)
  }

  const selfDefault = self.defaultSynthesisSettings.model
  if (shouldUpgradeSynthesisModel(selfDefault, models)) {
    self.upgradeSynthesisModelDefaults(picked, models)
  }
}

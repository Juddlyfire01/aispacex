/** True when a tip string should render a Tooltip wrapper. */
export function hasTooltipTip(tip?: string): boolean {
  return Boolean(tip?.trim())
}

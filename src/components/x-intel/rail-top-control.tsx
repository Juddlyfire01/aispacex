/** Primary CTA for Self rail top action — same fill tokens as PrimaryButton. */
const RAIL_TOP_BUTTON =
  'w-full min-h-9 flex items-center justify-center rounded-md px-2 py-1.5 text-[11px] font-medium leading-none text-center bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] hover:opacity-90 transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2'

type RailTopConnectButtonProps = {
  onClick: () => void
}

export function RailTopConnectButton({ onClick }: RailTopConnectButtonProps) {
  return (
    <button type="button" onClick={onClick} className={RAIL_TOP_BUTTON}>
      +Connect Account
    </button>
  )
}

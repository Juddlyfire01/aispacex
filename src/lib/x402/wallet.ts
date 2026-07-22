// Minimal EIP-1193 wallet layer for x402 paid mode. No web3 SDK dependency —
// we talk to the browser-injected provider (window.ethereum) directly. This
// covers connect, chain check/switch to Base, and SIWE-style message signing
// used to authenticate balance / transaction reads for the user's own wallet.

import { X402_CHAIN_HEX, X402_CHAIN_ID } from './config'

/** Minimal shape of an EIP-1193 provider. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>
  on?(event: string, handler: (...args: unknown[]) => void): void
  removeListener?(event: string, handler: (...args: unknown[]) => void): void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export class WalletError extends Error {
  code?: number
  constructor(message: string, code?: number) {
    super(message)
    this.name = 'WalletError'
    this.code = code
  }
}

/** The injected provider, or null when no wallet is available. */
export function getProvider(): Eip1193Provider | null {
  return typeof window !== 'undefined' && window.ethereum ? window.ethereum : null
}

/** True when a browser wallet is installed. */
export function hasWallet(): boolean {
  return getProvider() != null
}

/**
 * Request accounts (prompts the wallet). Returns the primary address, lowercased.
 *
 * When `forcePicker` is true we first call `wallet_requestPermissions` for
 * `eth_accounts`, which forces the wallet's account selector to open even if the
 * site is already authorized — this is what lets a user switch to a different
 * account/wallet instead of being silently reconnected to the previous one.
 * Wallets that don't implement it (throw -32601 / 4200) fall back to the plain
 * `eth_requestAccounts` prompt.
 */
export async function connectWallet(opts: { forcePicker?: boolean } = {}): Promise<string> {
  const provider = getProvider()
  if (!provider) throw new WalletError('No Ethereum wallet found. Install a Base-compatible wallet.')

  if (opts.forcePicker) {
    try {
      await provider.request({
        method: 'wallet_requestPermissions',
        params: [{ eth_accounts: {} }],
      })
    } catch (err) {
      const code = (err as { code?: number })?.code
      // 4001 = user rejected the picker → surface as a clean cancel.
      if (code === 4001) throw new WalletError('Connection cancelled.', 4001)
      // -32601 (method not found) / 4200 (unsupported) → fall through to the
      // standard request below.
    }
  }

  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
  const addr = accounts?.[0]
  if (!addr) throw new WalletError('Wallet returned no account.')
  return addr.toLowerCase()
}

/**
 * Revoke the site's `eth_accounts` permission so the wallet fully forgets this
 * connection. After this, the next connect re-prompts (and, with forcePicker,
 * shows the account selector). Not all wallets implement
 * `wallet_revokePermissions` — failures are swallowed since the local state is
 * cleared regardless.
 */
export async function revokeWalletPermissions(): Promise<void> {
  const provider = getProvider()
  if (!provider) return
  try {
    await provider.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    })
  } catch {
    // Unsupported (e.g. -32601) or already revoked — nothing more to do.
  }
}

/** Currently authorized address without prompting, or null. */
export async function getConnectedAddress(): Promise<string | null> {
  const provider = getProvider()
  if (!provider) return null
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[]
    return accounts?.[0]?.toLowerCase() ?? null
  } catch {
    return null
  }
}

/** Current chain id as a number, or null. */
export async function getChainId(): Promise<number | null> {
  const provider = getProvider()
  if (!provider) return null
  try {
    const hex = (await provider.request({ method: 'eth_chainId' })) as string
    return parseInt(hex, 16)
  } catch {
    return null
  }
}

/** Ensure the wallet is on Base; attempt a switch if not. Throws on failure. */
export async function ensureBaseChain(): Promise<void> {
  const provider = getProvider()
  if (!provider) throw new WalletError('No Ethereum wallet found.')
  const current = await getChainId()
  if (current === X402_CHAIN_ID) return
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: X402_CHAIN_HEX }],
    })
  } catch (err) {
    const code = (err as { code?: number })?.code
    // 4902 = chain not added to the wallet yet.
    if (code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: X402_CHAIN_HEX,
            chainName: 'Base',
            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
            rpcUrls: ['https://mainnet.base.org'],
            blockExplorerUrls: ['https://basescan.org'],
          },
        ],
      })
    } else {
      throw new WalletError('Please switch your wallet to the Base network.', code)
    }
  }
}

/**
 * Sign an arbitrary UTF-8 message via personal_sign. Used to prove wallet
 * ownership for balance / transaction reads (SIWE-style). Returns the 0x sig.
 */
export async function signMessage(address: string, message: string): Promise<string> {
  const provider = getProvider()
  if (!provider) throw new WalletError('No Ethereum wallet found.')
  // personal_sign expects (message, address); many wallets accept a UTF-8 string.
  const sig = (await provider.request({
    method: 'personal_sign',
    params: [message, address],
  })) as string
  if (!sig) throw new WalletError('Wallet did not return a signature.')
  return sig
}

/**
 * Build a SIWE-style statement the user signs to authenticate reads of their
 * own wallet balance / ledger. This is app-local auth (not a Venice challenge).
 */
export function buildSiweStatement(address: string, nonce: string): string {
  const domain = typeof window !== 'undefined' ? window.location.host : 'aispacex'
  const issuedAt = new Date().toISOString()
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Authenticate to view and spend your Xintel credit balance.',
    '',
    `URI: ${typeof window !== 'undefined' ? window.location.origin : ''}`,
    'Version: 1',
    `Chain ID: ${X402_CHAIN_ID}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

/** Random nonce for the SIWE statement. */
export function randomNonce(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  } catch {
    return Math.random().toString(36).slice(2, 18)
  }
}

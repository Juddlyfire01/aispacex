// Client-side USDC (Base) ERC-20 transfer for x402 top-ups.
// Uses the injected wallet (eth_sendTransaction) so the user sees a real
// on-chain payment to the collection wallet — no facilitator required.

import { encodeFunctionData, parseAbi } from 'viem'
import {
  USDC_BASE_ADDRESS,
  X402_RECEIVER_WALLET,
  usdToUsdcBaseUnits,
} from './config'
import { ensureBaseChain, getProvider, WalletError } from './wallet'

const transferAbi = parseAbi(['function transfer(address to, uint256 amount) returns (bool)'])

export interface UsdcTransferResult {
  txHash: `0x${string}`
  amountUsd: number
  to: string
}

/**
 * Send `amountUsd` of native USDC on Base from `fromAddress` to the configured
 * collection wallet. Ensures Base chain first. Returns the tx hash.
 */
export async function transferUsdcToReceiver(
  fromAddress: string,
  amountUsd: number,
): Promise<UsdcTransferResult> {
  const provider = getProvider()
  if (!provider) throw new WalletError('No Ethereum wallet found.')
  const to = X402_RECEIVER_WALLET
  if (!to || !/^0x[0-9a-fA-F]{40}$/.test(to)) {
    throw new WalletError('Collection wallet is not configured.')
  }
  if (!(amountUsd > 0)) throw new WalletError('Invalid top-up amount.')

  await ensureBaseChain()

  const amount = BigInt(usdToUsdcBaseUnits(amountUsd))
  const data = encodeFunctionData({
    abi: transferAbi,
    functionName: 'transfer',
    args: [to as `0x${string}`, amount],
  })

  let txHash: string
  try {
    txHash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [
        {
          from: fromAddress,
          to: USDC_BASE_ADDRESS,
          data,
        },
      ],
    })) as string
  } catch (err) {
    const code = (err as { code?: number })?.code
    if (code === 4001) throw new WalletError('Payment cancelled.', 4001)
    throw new WalletError(err instanceof Error ? err.message : 'Transfer failed', code)
  }

  if (!txHash || !txHash.startsWith('0x')) {
    throw new WalletError('Wallet did not return a transaction hash.')
  }

  return { txHash: txHash as `0x${string}`, amountUsd, to }
}

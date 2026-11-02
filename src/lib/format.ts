import {
  BaseError,
  ContractFunctionRevertedError,
  HttpRequestError,
  LimitExceededRpcError,
  UserRejectedRequestError,
  hexToString,
  stringToHex,
} from 'viem'
import { formatUsdc } from '@/onchain-money'
import type { Hex } from 'viem'

export const shortAddress = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`

export const ORDER_REF_PATTERN = /^[A-Za-z0-9._-]{1,32}$/

export const isValidOrderRef = (ref: string) => ORDER_REF_PATTERN.test(ref)

export function orderRefToBytes32(ref: string): Hex {
  return stringToHex(ref, { size: 32 })
}

export function bytes32ToOrderRef(value: Hex): string {
  try {
    const text = hexToString(value, { size: 32 })
    return text.replace(/\0+$/g, '') || value
  } catch {
    return value
  }
}

export function randomOrderRef(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  const tail = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase()
  return `ORD-${tail}`
}

export function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return BigInt(`0x${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`)
}

export const formatDate = (seconds: number | bigint) =>
  new Date(Number(seconds) * 1000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

export const formatDateTime = (seconds: number | bigint) =>
  new Date(Number(seconds) * 1000).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export function timeLeft(expiry: number | bigint, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const diff = Number(expiry) - nowSeconds
  if (diff <= 0) return 'Expired'
  const days = Math.floor(diff / 86400)
  if (days >= 1) return `${days} day${days === 1 ? '' : 's'} left`
  const hours = Math.floor(diff / 3600)
  if (hours >= 1) return `${hours} hour${hours === 1 ? '' : 's'} left`
  return `${Math.max(1, Math.floor(diff / 60))} min left`
}

const ERROR_COPY: Record<string, string> = {
  AllowanceNotFound: 'This allowance does not exist.',
  NotFunder: 'Only the funder of this allowance can do that.',
  AllowancePaused: 'This allowance is paused.',
  AllowanceClosed: 'This allowance is closed.',
  NotPaused: 'This allowance is not paused.',
  AllowanceExpired: 'This allowance has expired.',
  SignatureExpired: 'The authorization expired. Scan the QR code again.',
  InvalidRecipient: 'Enter a valid recipient address.',
  InvalidAmount: 'Enter an amount greater than zero.',
  InvalidPerPurchaseLimit: 'The per purchase limit must be above zero and no more than the budget.',
  InvalidExpiry: 'Pick an expiry date in the future.',
  InvalidPurposeLength: 'The purpose must be between 1 and 64 characters.',
  InvalidCategoryLength: 'The category can be at most 32 characters.',
  InvalidMerchantCount: 'Add between 1 and 50 merchants.',
  InvalidMerchant: 'One of the merchant addresses is not valid.',
  MerchantAlreadyApproved: 'That merchant is already approved (or listed twice).',
  MerchantNotApproved: 'This merchant is not approved for this allowance.',
  MaxMerchantsReached: 'This allowance already has the maximum of 50 merchants.',
  InvalidOrderRef: 'The order reference is not valid.',
  ExceedsPerPurchaseLimit: 'This amount is above the per purchase limit.',
  InsufficientBalance: 'Not enough budget left in this allowance.',
  NonceAlreadyUsed: 'This authorization was already used.',
  OrderAlreadyPaid: 'This order was already paid from this allowance.',
  InvalidSignature: 'The signature does not match the allowance recipient.',
  NotExpired: 'This allowance has not expired yet.',
  NothingToReclaim: 'There is nothing left to reclaim.',
}

export const RATE_LIMIT_MESSAGE = 'The network is busy right now. Please try again in a few seconds.'

const RATE_LIMIT_PATTERN = /rate limit|exceeds defined limit|too many requests|limit exceeded|\b429\b/i

/** True for RPC throttling errors from the public endpoint or the user's wallet provider. */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof BaseError) {
    if (error.walk((e) => e instanceof LimitExceededRpcError)) return true
    const http = error.walk((e) => e instanceof HttpRequestError)
    if (http instanceof HttpRequestError && http.status === 429) return true
    if (RATE_LIMIT_PATTERN.test(`${error.shortMessage} ${error.details ?? ''} ${error.message}`)) return true
  }
  if (error instanceof Error) return RATE_LIMIT_PATTERN.test(error.message)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return RATE_LIMIT_PATTERN.test(String((error).message))
  }
  return false
}

export function parseTxError(error: unknown): string | null {
  if (isRateLimitError(error)) return RATE_LIMIT_MESSAGE
  if (!(error instanceof BaseError)) return 'Something went wrong. Please try again.'
  if (error.walk((e) => e instanceof UserRejectedRequestError)) return null
  const reverted = error.walk((e) => e instanceof ContractFunctionRevertedError)
  if (reverted instanceof ContractFunctionRevertedError && reverted.data?.errorName) {
    return ERROR_COPY[reverted.data.errorName] ?? `Transaction failed: ${reverted.data.errorName}`
  }
  const msg = error.shortMessage.toLowerCase()
  if (msg.includes('user rejected') || msg.includes('user denied')) return null
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient USDC for this transaction and its gas.'
  }
  return error.shortMessage
}

/** Formats a raw USDC amount (6 decimals) as "1,234.50". */
export function usdc(raw: bigint): string {
  const [whole, frac = ''] = formatUsdc(raw).split('.')
  const grouped = BigInt(whole).toLocaleString('en-US')
  return `${grouped}.${frac.padEnd(2, '0')}`
}

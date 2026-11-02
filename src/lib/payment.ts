import { isAddress } from 'viem'
import type { Address, Hex } from 'viem'
import { CHAIN_ID, VAULT_ADDRESS } from './chains'
import { isValidOrderRef } from './format'

/** What the merchant's QR code carries. */
export interface PaymentRequest {
  merchant: Address
  amount: bigint
  ref: string
  chainId: number
}

export function buildPaymentQuery(req: PaymentRequest): string {
  const params = new URLSearchParams({
    m: req.merchant,
    amt: req.amount.toString(),
    ref: req.ref,
    cid: String(req.chainId),
  })
  return `?${params.toString()}`
}

/** Accepts a full URL, a path with a query, or a bare query string. */
export function parsePaymentRequest(text: string): PaymentRequest | null {
  const trimmed = text.trim().replace(/&amp;/g, '&')
  const queryStart = trimmed.indexOf('?')
  // Also accept a bare "m=…&amt=…&ref=…" string, and ignore any #fragment.
  const raw = queryStart >= 0 ? trimmed.slice(queryStart + 1) : /(^|&)m=/.test(trimmed) ? trimmed : null
  if (raw === null) return null
  const params = new URLSearchParams(raw.split('#')[0])
  const merchant = params.get('m')
  const amt = params.get('amt')
  const ref = params.get('ref')
  const cid = Number(params.get('cid') ?? CHAIN_ID)
  if (!merchant || !isAddress(merchant) || !amt || !/^\d+$/.test(amt) || !ref || !isValidOrderRef(ref)) return null
  const amount = BigInt(amt)
  if (amount <= 0n) return null
  return { merchant, amount, ref, chainId: cid }
}

export const spendTypes = {
  Spend: [
    { name: 'allowanceId', type: 'uint256' },
    { name: 'merchant', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'orderRef', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export function spendDomain(chainId: number) {
  if (!VAULT_ADDRESS) throw new Error('Vault is not deployed on this network')
  return { name: 'AllotVault', version: '1', chainId, verifyingContract: VAULT_ADDRESS } as const
}

/** A recipient-signed payment that anyone can submit onchain. */
export interface SignedAuthorization {
  allowanceId: bigint
  merchant: Address
  amount: bigint
  orderRef: Hex
  nonce: bigint
  deadline: bigint
  signature: Hex
  chainId: number
}

const AUTH_PREFIX = 'allot-auth:'

const toBase64Url = (text: string) =>
  btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

const fromBase64Url = (text: string) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  return atob(padded)
}

export function encodeAuthorization(auth: SignedAuthorization): string {
  const json = JSON.stringify({
    i: auth.allowanceId.toString(),
    m: auth.merchant,
    a: auth.amount.toString(),
    o: auth.orderRef,
    n: auth.nonce.toString(),
    d: auth.deadline.toString(),
    s: auth.signature,
    c: auth.chainId,
  })
  return AUTH_PREFIX + toBase64Url(json)
}

export function decodeAuthorization(text: string): SignedAuthorization | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith(AUTH_PREFIX)) return null
  try {
    const raw = JSON.parse(fromBase64Url(trimmed.slice(AUTH_PREFIX.length))) as Record<string, string | number>
    const merchant = String(raw.m)
    const orderRef = String(raw.o)
    const signature = String(raw.s)
    if (!isAddress(merchant) || !/^0x[0-9a-fA-F]{64}$/.test(orderRef) || !/^0x[0-9a-fA-F]+$/.test(signature)) return null
    return {
      allowanceId: BigInt(raw.i),
      merchant,
      amount: BigInt(raw.a),
      orderRef: orderRef as Hex,
      nonce: BigInt(raw.n),
      deadline: BigInt(raw.d),
      signature: signature as Hex,
      chainId: Number(raw.c),
    }
  } catch {
    return null
  }
}

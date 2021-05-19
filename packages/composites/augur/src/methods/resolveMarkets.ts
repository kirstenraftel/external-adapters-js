import { Requester, Validator } from '@chainlink/ea-bootstrap'
import { ExecuteWithConfig } from '@chainlink/types'
import { Config } from '../config'
import { ABI, bytesMappingToHexStr } from './index'
import { ethers } from 'ethers'
import { theRundown, sportsdataio } from '../dataProviders'
import { sportDataProviderMapping } from './index'

const resolveParams = {
  sport: true,
  contractAddress: true
}

export interface PackedEvent {
  eventId: ethers.BigNumber
  packed: string
}

export const execute: ExecuteWithConfig<Config> = async (input, config) => {
  const validator = new Validator(input, resolveParams)
  if (validator.error) throw validator.error

  const sport = validator.validated.data.sport
  const contractAddress = validator.validated.data.contractAddress

  const contract = new ethers.Contract(contractAddress, ABI, config.wallet)

  let packed: PackedEvent[] = []
  if (sportDataProviderMapping['theRundown'].includes(sport.toUpperCase())) {
    packed = (await theRundown.resolve(input)).result
  } else if (sportDataProviderMapping['sportsdataio'].includes(sport.toUpperCase())) {
    packed = (await sportsdataio.resolve(input)).result
  } else {
    throw Error(`Unknown data provider for sport ${sport}`)
  }

  let nonce = await config.wallet.getTransactionCount()
  for (const packedEvent of packed) {
    try {
      const isResolved = await contract.isEventResolved(packedEvent.eventId)
      if (isResolved) continue
    } catch (e) {
      // Skip if contract call fails, this is likely a
      // market that wasn't created
      continue
    }

    await contract.trustedResolveMarkets(packedEvent.packed, { nonce: nonce++ })
  }

  return Requester.success(input.id, {})
}

export const packResolution = (
  eventId: ethers.BigNumber,
  eventStatus: number,
  homeScore: number,
  awayScore: number
): string => {
  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['uint128', 'uint8', 'uint16', 'uint16'],
    [eventId, eventStatus, Math.round(homeScore*10), Math.round(awayScore*10)]
  )

  const mapping = [16, 1, 2, 2]
  return bytesMappingToHexStr(mapping, encoded)
}

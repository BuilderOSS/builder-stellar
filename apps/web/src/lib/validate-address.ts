import { StrKey } from '@stellar/stellar-sdk';

export type AddressValidationResult = {
  isValid: boolean;
  error?: string;
  type?: 'account' | 'contract';
};

/**
 * Validates a Stellar address (account or contract)
 * @param address - The address to validate (G... for accounts, C... for contracts)
 * @returns Validation result with error message if invalid
 */
export function validateStellarAddress(address: string): AddressValidationResult {
  if (!address || typeof address !== 'string') {
    return {
      isValid: false,
      error: 'Address is required'
    };
  }

  const trimmed = address.trim();

  if (trimmed.length === 0) {
    return {
      isValid: false,
      error: 'Address cannot be empty'
    };
  }

  // Check if it's a valid account address (G...)
  if (trimmed.startsWith('G')) {
    try {
      if (StrKey.isValidEd25519PublicKey(trimmed)) {
        return {
          isValid: true,
          type: 'account'
        };
      }
      return {
        isValid: false,
        error: 'Invalid account address format'
      };
    } catch {
      return {
        isValid: false,
        error: 'Invalid account address'
      };
    }
  }

  // Check if it's a valid contract address (C...)
  if (trimmed.startsWith('C')) {
    try {
      if (StrKey.isValidContract(trimmed)) {
        return {
          isValid: true,
          type: 'contract'
        };
      }
      return {
        isValid: false,
        error: 'Invalid contract address format'
      };
    } catch {
      return {
        isValid: false,
        error: 'Invalid contract address'
      };
    }
  }

  return {
    isValid: false,
    error: 'Address must start with G (account) or C (contract)'
  };
}

/**
 * Quick check if an address is valid (boolean only)
 */
export function isValidStellarAddress(address: string): boolean {
  return validateStellarAddress(address).isValid;
}

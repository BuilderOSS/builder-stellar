// lib/validate-dao-config.ts

import type { CreateDaoFormData } from './dao-creation-params';
import {
  getStellarAddressError,
  hasDuplicates,
  isValidHttpUrl,
  isValidIpfsUri,
  isValidStellarAddress,
  isValidTokenSymbol,
  isValidUrl,
  MAX_TOKEN_SYMBOL_LENGTH,
  validateArtworkProperty,
  validateDuration
} from './validation';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Comprehensive validation of DAO configuration before deployment
 */
export function validateDaoConfig(formData: CreateDaoFormData): ValidationResult {
  const errors: ValidationError[] = [];

  // === BASIC INFO VALIDATION ===

  // Token name
  if (!formData.basicInfo.tokenName || formData.basicInfo.tokenName.trim().length === 0) {
    errors.push({ field: 'tokenName', message: 'Token name is required' });
  } else if (formData.basicInfo.tokenName.length > 100) {
    errors.push({ field: 'tokenName', message: 'Token name must be 100 characters or less' });
  }

  // Token symbol
  if (!formData.basicInfo.tokenSymbol || formData.basicInfo.tokenSymbol.trim().length === 0) {
    errors.push({ field: 'tokenSymbol', message: 'Token symbol is required' });
  } else if (!isValidTokenSymbol(formData.basicInfo.tokenSymbol)) {
    errors.push({
      field: 'tokenSymbol',
      message: `Token symbol must be uppercase alphanumeric, max ${MAX_TOKEN_SYMBOL_LENGTH} characters`
    });
  }

  // Description
  if (!formData.basicInfo.description || formData.basicInfo.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required' });
  } else if (formData.basicInfo.description.length > 500) {
    errors.push({ field: 'description', message: 'Description must be 500 characters or less' });
  }

  // URLs (optional but must be valid if provided)
  if (formData.basicInfo.projectUri && !isValidHttpUrl(formData.basicInfo.projectUri)) {
    errors.push({ field: 'projectUri', message: 'Project URI must be a valid HTTP/HTTPS URL' });
  }

  if (formData.basicInfo.tokenUri && !isValidUrl(formData.basicInfo.tokenUri)) {
    errors.push({ field: 'tokenUri', message: 'Token URI must be a valid HTTP/HTTPS or IPFS URL' });
  }

  if (formData.basicInfo.contractImage && !isValidUrl(formData.basicInfo.contractImage)) {
    errors.push({ field: 'contractImage', message: 'Contract image must be a valid HTTP/HTTPS or IPFS URL' });
  }

  if (formData.basicInfo.rendererBase && !isValidHttpUrl(formData.basicInfo.rendererBase)) {
    errors.push({ field: 'rendererBase', message: 'Renderer base must be a valid HTTP/HTTPS URL' });
  }

  // === ARTWORK VALIDATION ===

  // IPFS base URI
  if (!formData.artwork.ipfs.baseUri || formData.artwork.ipfs.baseUri.trim().length === 0) {
    errors.push({ field: 'ipfsBaseUri', message: 'IPFS base URI is required' });
  } else if (!isValidIpfsUri(formData.artwork.ipfs.baseUri)) {
    errors.push({
      field: 'ipfsBaseUri',
      message: 'IPFS base URI must start with ipfs:// or be a valid IPFS gateway URL'
    });
  }

  // IPFS extension
  if (!formData.artwork.ipfs.extension || formData.artwork.ipfs.extension.trim().length === 0) {
    errors.push({ field: 'ipfsExtension', message: 'File extension is required (e.g., .png)' });
  } else if (!formData.artwork.ipfs.extension.startsWith('.')) {
    errors.push({ field: 'ipfsExtension', message: 'File extension must start with a dot (e.g., .png)' });
  }

  // Properties
  if (formData.artwork.properties.length === 0) {
    errors.push({ field: 'artworkProperties', message: 'At least one artwork property is required' });
  } else if (formData.artwork.properties.length > 16) {
    errors.push({ field: 'artworkProperties', message: 'Maximum 16 artwork properties allowed' });
  }

  // Validate each property
  formData.artwork.properties.forEach((property, index) => {
    const propertyError = validateArtworkProperty(property);
    if (propertyError) {
      errors.push({ field: `artworkProperty${index}`, message: `Property ${index + 1}: ${propertyError}` });
    }
  });

  // Check for duplicate property names
  if (hasDuplicates(formData.artwork.properties, (p) => p.name.toLowerCase())) {
    errors.push({ field: 'artworkProperties', message: 'Duplicate property names are not allowed' });
  }

  // === AUCTION VALIDATION ===

  if (formData.auction.enabled) {
    // Duration
    const durationError = validateDuration(formData.auction.duration, 300); // Min 5 minutes
    if (durationError) {
      errors.push({ field: 'auctionDuration', message: durationError });
    }

    // Reserve price
    if (!formData.auction.reservePrice || formData.auction.reservePrice.trim().length === 0) {
      errors.push({ field: 'reservePrice', message: 'Reserve price is required when auction is enabled' });
    } else {
      const reservePrice = formData.auction.reservePrice.trim();
      if (!/^\d+$/.test(reservePrice)) {
        errors.push({ field: 'reservePrice', message: 'Reserve price must be a whole number' });
      } else if (BigInt(reservePrice) <= 0n) {
        errors.push({ field: 'reservePrice', message: 'Reserve price must be greater than 0' });
      }
    }

    // Time buffer
    const timeBufferError = validateDuration(formData.auction.timeBuffer, 60); // Min 1 minute
    if (timeBufferError) {
      errors.push({ field: 'timeBuffer', message: timeBufferError });
    }

    // Payment asset
    if (!formData.auction.paymentAsset || formData.auction.paymentAsset.trim().length === 0) {
      errors.push({ field: 'paymentAsset', message: 'Payment asset address is required when auction is enabled' });
    } else if (!isValidStellarAddress(formData.auction.paymentAsset)) {
      const addressError = getStellarAddressError(formData.auction.paymentAsset);
      errors.push({ field: 'paymentAsset', message: addressError || 'Invalid payment asset address' });
    }
  }

  // === GOVERNANCE VALIDATION ===

  // Voting delay
  const votingDelayError = validateDuration(formData.governance.votingDelay, 300); // Min 5 minutes
  if (votingDelayError) {
    errors.push({ field: 'votingDelay', message: votingDelayError });
  }

  // Voting period
  const votingPeriodError = validateDuration(formData.governance.votingPeriod, 3600); // Min 1 hour
  if (votingPeriodError) {
    errors.push({ field: 'votingPeriod', message: votingPeriodError });
  }

  // Quorum basis points
  if (formData.governance.quorumBps < 0 || formData.governance.quorumBps > 10000) {
    errors.push({ field: 'quorumBps', message: 'Quorum must be between 0 and 10000 basis points' });
  }

  // Proposal threshold basis points
  if (formData.governance.proposalThresholdBps < 0 || formData.governance.proposalThresholdBps > 10000) {
    errors.push({
      field: 'proposalThresholdBps',
      message: 'Proposal threshold must be between 0 and 10000 basis points'
    });
  }

  // === FOUNDERS VALIDATION ===

  // Total allocation
  const totalAllocation = formData.founders.reduce((sum, f) => sum + f.amount, 0);
  if (totalAllocation > 10_000) {
    errors.push({
      field: 'founders',
      message: `Total founder allocation (${totalAllocation}) exceeds maximum of 10,000 tokens`
    });
  }

  // Validate each founder
  formData.founders.forEach((founder, index) => {
    // Address validation
    if (!founder.address || founder.address.trim().length === 0) {
      errors.push({ field: `founder${index}Address`, message: `Founder ${index + 1}: Address is required` });
    } else if (!isValidStellarAddress(founder.address)) {
      const addressError = getStellarAddressError(founder.address);
      errors.push({
        field: `founder${index}Address`,
        message: `Founder ${index + 1}: ${addressError || 'Invalid address'}`
      });
    }

    // Amount validation
    if (founder.amount <= 0) {
      errors.push({ field: `founder${index}Amount`, message: `Founder ${index + 1}: Amount must be greater than 0` });
    }
    if (founder.amount > 10_000) {
      errors.push({
        field: `founder${index}Amount`,
        message: `Founder ${index + 1}: Amount cannot exceed 10,000 tokens`
      });
    }
  });

  // Check for duplicate founder addresses
  if (hasDuplicates(formData.founders, (f) => f.address.toLowerCase())) {
    errors.push({ field: 'founders', message: 'Duplicate founder addresses are not allowed' });
  }

  // === LAUNCH ADMIN VALIDATION ===

  if (!formData.launchAdmin || formData.launchAdmin.trim().length === 0) {
    errors.push({ field: 'launchAdmin', message: 'Launch admin address is required' });
  } else if (!isValidStellarAddress(formData.launchAdmin)) {
    const addressError = getStellarAddressError(formData.launchAdmin);
    errors.push({ field: 'launchAdmin', message: addressError || 'Invalid launch admin address' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get validation errors for a specific field
 */
export function getFieldErrors(validationResult: ValidationResult, fieldPrefix: string): string[] {
  return validationResult.errors.filter((e) => e.field.startsWith(fieldPrefix)).map((e) => e.message);
}

/**
 * Check if a specific field has errors
 */
export function hasFieldError(validationResult: ValidationResult, field: string): boolean {
  return validationResult.errors.some((e) => e.field === field);
}

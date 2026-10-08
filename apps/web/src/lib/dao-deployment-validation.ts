import { ArtworkProperty, CreateDaoStore } from '@/stores/create-dao-store';

/**
 * Deployment preflight validation.
 * Ensures all required fields are set before wallet signing.
 */
export interface DeploymentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates that all required fields are set for deployment.
 */
export function validateDeploymentReady(state: CreateDaoStore): DeploymentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Basic Info validation
  if (!state.basicInfo.tokenName?.trim()) {
    errors.push('DAO name is required');
  }
  if (!state.basicInfo.tokenSymbol?.trim()) {
    errors.push('Token symbol is required');
  }
  if (!state.basicInfo.description?.trim()) {
    errors.push('Description is required');
  }

  // DAO Image Source validation
  if (!state.daoImageSource) {
    errors.push('DAO identity image must be selected or generated');
  }
  if (state.daoImageSource && 'gatewayUrl' in state.daoImageSource && !state.daoImageSource.gatewayUrl) {
    errors.push('DAO image gateway URL is missing');
  }

  // Contract Image validation
  if (!state.basicInfo.contractImage?.trim()) {
    errors.push('Contract image URL is missing');
  }
  if (!state.basicInfo.contractImage?.startsWith('http')) {
    errors.push('Contract image must be an HTTPS URL');
  }

  // Artwork Source validation
  if (!state.artworkSource) {
    errors.push('Artwork source must be selected (starter collection or uploaded directory)');
  }

  // IPFS validation (legacy)
  if (state.artwork) {
    if (!state.artwork.ipfs.baseUri?.trim()) {
      errors.push('IPFS base URI is required');
    }
    if (!state.artwork.ipfs.extension?.trim()) {
      errors.push('File extension is required');
    }

    // Properties validation (legacy)
    if (!state.artwork.properties || state.artwork.properties.length === 0) {
      errors.push('At least one artwork property is required');
    } else {
      // Validate each property
      for (let i = 0; i < state.artwork.properties.length; i++) {
        const property = state.artwork.properties[i];
        if (!property.name?.trim()) {
          errors.push(`Property ${i + 1}: name is required`);
        }
        if (!property.items || property.items.length === 0) {
          errors.push(`Property "${property.name}": at least one item is required`);
        }
      }

      // Check for duplicate property names
      const names = state.artwork.properties.map((p: ArtworkProperty) => p.name.toLowerCase());
      const duplicates = names.filter((name: string, index: number) => names.indexOf(name) !== index);
      if (duplicates.length > 0) {
        errors.push(`Duplicate property names: ${Array.from(new Set(duplicates)).join(', ')}`);
      }
    }
  }

  // Founders validation (optional but warn if high vote threshold with no founders)
  if (!state.founders || state.founders.length === 0) {
    warnings.push('No founders allocated. Ensure governance parameters are appropriate.');
  }

  // Launch admin validation
  if (!state.launchAdmin?.trim()) {
    errors.push('Launch admin address is required');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Validates that image sources are properly resolved.
 */
export function validateImageSources(state: CreateDaoStore): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // DAO Image Source
  const daoImageSource = state.daoImageSource;
  if (!daoImageSource) {
    errors.push('DAO image source not selected');
  } else {
    if (daoImageSource.kind === 'generated' || daoImageSource.kind === 'uploaded') {
      if (!daoImageSource.ipfsUri?.startsWith('ipfs://')) {
        errors.push('DAO image IPFS URI is invalid');
      }
      if (!daoImageSource.gatewayUrl?.startsWith('http')) {
        errors.push('DAO image gateway URL is invalid');
      }
    } else if (daoImageSource.kind === 'default' || daoImageSource.kind === 'url') {
      if (!daoImageSource.gatewayUrl?.startsWith('http')) {
        errors.push('DAO image URL is invalid');
      }
    }
  }

  // Artwork Source
  const artworkSource = state.artworkSource;
  if (!artworkSource) {
    errors.push('Artwork source not selected');
  } else {
    if (artworkSource.kind === 'uploaded') {
      if (!artworkSource.baseUri?.startsWith('ipfs://') && !artworkSource.baseUri?.startsWith('http')) {
        errors.push('Artwork base URI is invalid');
      }
      if (!artworkSource.extension || !['.png', '.webp'].includes(artworkSource.extension)) {
        errors.push('Artwork extension is invalid');
      }
      if (!artworkSource.properties || artworkSource.properties.length === 0) {
        errors.push('Artwork properties are missing');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

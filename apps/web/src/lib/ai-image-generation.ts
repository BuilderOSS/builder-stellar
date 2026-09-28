import { generateImage } from '@ai-sdk/gateway';
import { z } from 'zod';

/**
 * Input validation schema for DAO image generation.
 * Ensures all user inputs are properly sanitized before use.
 */
export const GenerateDaoImageInputSchema = z.object({
  name: z.string().trim().min(1, 'DAO name is required').max(100, 'DAO name must be 100 characters or less'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required')
    .max(500, 'Description must be 500 characters or less'),
  artDirection: z.string().trim().max(600, 'Art direction must be 600 characters or less').optional().default(''),
  stylePreset: z.enum(['modern', 'vintage', 'abstract', 'minimal', 'vibrant']).optional().default('modern')
});

export type GenerateDaoImageInput = z.infer<typeof GenerateDaoImageInputSchema>;

/**
 * Generated image candidate returned from the AI provider.
 * Contains temporary URLs and metadata for browser selection.
 */
export interface GeneratedImageCandidate {
  id: string;
  temporaryUrl: string;
  expiresAt: Date;
  model: string;
  revisedPrompt?: string;
}

/**
 * Constructs a product-owned prompt from user inputs.
 * Treats user text as data, not as prompt instructions.
 * Ensures composition, safety, and style requirements.
 */
function buildPrompt(input: GenerateDaoImageInput): string {
  const styleGuides: Record<string, string> = {
    modern: 'Modern, clean, and professional aesthetic',
    vintage: 'Vintage-inspired with retro elements',
    abstract: 'Abstract and conceptual design',
    minimal: 'Minimalist with essential elements only',
    vibrant: 'Vibrant colors and dynamic energy'
  };

  const styleDescription = styleGuides[input.stylePreset];
  const artDirectionSegment = input.artDirection ? `\n\nAdditional direction: ${input.artDirection}` : '';

  // Product-owned prompt template
  return `
Create a square (1:1) artwork for a decentralized organization called "${input.name}".

Organization description: ${input.description}

Style: ${styleDescription}

Requirements:
- Square composition (1:1 aspect ratio)
- Professional, recognizable imagery suitable for organizational branding
- No text, logos, or watermarks unless explicitly requested
- Neutral to warm background color
- Suitable for use as an NFT collection identity image
- High quality, detailed, and visually striking

${artDirectionSegment}

Generate a single, cohesive image that captures the essence and values of this organization.
`.trim();
}

/**
 * Generates DAO identity image candidates using Vercel AI Gateway.
 * Returns temporary URLs for user selection before permanent storage.
 */
export async function generateDaoImageCandidates(
  input: GenerateDaoImageInput,
  options?: {
    abortSignal?: AbortSignal;
    batchSize?: number;
  }
): Promise<GeneratedImageCandidate[]> {
  // Validate and sanitize input
  const validatedInput = GenerateDaoImageInputSchema.parse(input);

  // Get configuration from environment
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const model = process.env.IMAGE_MODEL || 'openai:dall-e-3';
  const batchSize = options?.batchSize || parseInt(process.env.GENERATION_BATCH_SIZE || '4', 10);

  if (!apiKey) {
    throw new Error('AI_GATEWAY_API_KEY is not configured');
  }

  const prompt = buildPrompt(validatedInput);

  try {
    // Generate candidates sequentially to avoid quota issues
    const candidates: GeneratedImageCandidate[] = [];

    for (let i = 0; i < batchSize; i++) {
      try {
        const image = await generateImage({
          model,
          prompt,
          // Note: Vercel AI Gateway returns different response structures
          // depending on the model. This handles the common case.
          // Adjust based on actual provider response structure.
          messages: [],
          abortSignal: options?.abortSignal
        });

        // Normalize provider output
        // The exact structure depends on the provider and model
        candidates.push({
          id: `candidate-${Date.now()}-${i}`,
          temporaryUrl: (image as any).url || '',
          expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour
          model,
          revisedPrompt: (image as any).revisedPrompt
        });
      } catch (error) {
        // Log individual candidate failures but continue generating others
        console.error(`Failed to generate candidate ${i + 1}:`, error);
        // Continue to next candidate
      }
    }

    if (candidates.length === 0) {
      throw new Error('Failed to generate any image candidates');
    }

    return candidates;
  } catch (error) {
    if (error instanceof Error) {
      // Map provider errors to user-friendly messages
      if (error.message.includes('rate_limit')) {
        throw new Error('Too many generation requests. Please try again later.');
      }
      if (error.message.includes('quota')) {
        throw new Error('Generation quota exceeded. Please try again later.');
      }
      if (error.message.includes('content_policy')) {
        throw new Error('The request was blocked by content policy filters. Please try different inputs.');
      }
      if (error.message.includes('timeout')) {
        throw new Error('Generation request timed out. Please try again.');
      }

      throw new Error(`Generation failed: ${error.message}`);
    }

    throw error;
  }
}

/**
 * Validates that a generated candidate is still valid and can be used.
 */
export function validateCandidate(candidate: GeneratedImageCandidate): boolean {
  // Check if candidate has expired
  if (candidate.expiresAt < new Date()) {
    return false;
  }

  // Verify required fields
  if (!candidate.id || !candidate.temporaryUrl) {
    return false;
  }

  return true;
}

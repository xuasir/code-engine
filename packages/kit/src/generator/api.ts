import type { ArtifactsBuilder, ArtifactsBuilderOptions, ArtifactsPresets, ScopedFilePath } from './types'
import { createArtifactsBuilder as createBuilder } from './builder'
import { presets as builtinPresets } from './ir'

export function createArtifactsBuilder<const TScope extends readonly string[] | undefined = undefined>(
  options: ArtifactsBuilderOptions<TScope>,
): ArtifactsBuilder<ScopedFilePath<TScope>> {
  return createBuilder(options)
}

export const SlotPresets: ArtifactsPresets = builtinPresets

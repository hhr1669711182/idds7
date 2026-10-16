import type { FeatureLike } from 'ol/Feature'
import type { Style, StyleFunction } from 'ol/style'

export function createSearchStyleFunction(): StyleFunction
export function createDisplayStyleFunction(): StyleFunction
export function createFlashStyleFunction(feature: FeatureLike, flash: boolean): Style

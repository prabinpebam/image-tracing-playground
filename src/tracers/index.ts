/** Registers every engine with the registry. The one place engines are wired. */

import { registerAll } from '../core/registry';
import imagetracer from './imagetracer';
import contour from './contour';
import colorRegions from './color-regions';
import centerline from './centerline';

export function registerEngines(): void {
  // Order = display order in the picker: binary, color, then experimental.
  registerAll([contour, colorRegions, imagetracer, centerline]);
}

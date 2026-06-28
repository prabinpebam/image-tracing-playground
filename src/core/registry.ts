/**
 * Engine registry. Engines register themselves here at startup; the UI and
 * pipeline only ever talk to the registry, never to engines directly.
 */

import type { TracerModule } from './types';

const engines = new Map<string, TracerModule>();

/** Register an engine. Throws on duplicate id so mistakes surface immediately. */
export function register(engine: TracerModule): void {
  if (engines.has(engine.id)) {
    throw new Error(`Tracer "${engine.id}" is already registered`);
  }
  engines.set(engine.id, engine);
}

export function registerAll(list: TracerModule[]): void {
  for (const e of list) register(e);
}

export function getEngine(id: string): TracerModule | undefined {
  return engines.get(id);
}

export function listEngines(): TracerModule[] {
  return [...engines.values()];
}

export function hasEngine(id: string): boolean {
  return engines.has(id);
}

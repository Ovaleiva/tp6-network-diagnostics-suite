import type { EntityId, OutboxAction } from '../domain/models';
import { newId } from '../ids';

// Acción nueva de la cola para una revisión de una entidad local.
export function createOutboxAction(
  kind: OutboxAction['kind'],
  entityId: EntityId,
  entityRevision: number,
  now: Date,
): OutboxAction {
  return {
    id: newId('act', now.getTime()),
    entityId,
    entityRevision,
    kind,
    state: 'pending',
    attempts: 0,
    createdAt: now.toISOString(),
  };
}

import type { OutboxAction } from '../../core/domain/models';
import { formatDate } from '../../shared/format';
import type { SyncRound, SyncTrigger } from './syncController';
import { describeSummary } from './syncEngine';

const KIND_LABELS: Record<OutboxAction['kind'], string> = {
  'diagnostic.upsert': 'Diagnóstico',
  'installation.upsert': 'Instalación',
  'report.upload': 'Reporte PDF',
};

const TRIGGER_LABELS: Record<SyncTrigger, string> = {
  apertura: 'al abrir la app',
  red: 'al volver la red',
  periodica: 'automática',
  manual: 'manual',
};

export interface ActionEntry {
  id: string;
  title: string;
  details: string[];
}

export interface QueueView {
  // 'pending' y 'sending': se envían solas en las próximas rondas.
  pending: ActionEntry[];
  // El backend tiene otra versión: el técnico decide.
  conflicts: ActionEntry[];
  // Rechazadas o agotados los reintentos: solo se reenvían a mano.
  failed: ActionEntry[];
}

export function describeAction(action: OutboxAction): ActionEntry {
  const details: string[] = [];
  if (action.state === 'sending') {
    details.push('Enviando…');
  } else if (action.state === 'pending') {
    details.push(
      action.attempts === 0
        ? 'Esperando envío.'
        : `${action.attempts} intento(s) fallido(s)` +
            (action.nextAttemptAt ? ` · próximo intento ${formatDate(action.nextAttemptAt)}` : ''),
    );
  }
  if (action.lastError) details.push(action.lastError);
  return {
    id: action.id,
    title: `${KIND_LABELS[action.kind]} · ${action.entityId} · rev. ${action.entityRevision}`,
    details,
  };
}

export function queueView(actions: OutboxAction[]): QueueView {
  const view: QueueView = { pending: [], conflicts: [], failed: [] };
  for (const action of actions) {
    const entry = describeAction(action);
    if (action.state === 'conflict') view.conflicts.push(entry);
    else if (action.state === 'failed') view.failed.push(entry);
    else view.pending.push(entry);
  }
  return view;
}

export function describeRound(round: SyncRound): string {
  const when = `Última ronda (${TRIGGER_LABELS[round.trigger]}) ${formatDate(round.finishedAt)}`;
  return round.summary
    ? `${when}: ${describeSummary(round.summary)}`
    : `${when}: no se pudo sincronizar (${round.error}).`;
}

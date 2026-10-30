import type { Diagnostic, EntityId } from '../../core/domain/models';
import { formatDate } from '../../shared/format';
import type { SnmpDiagnostic, SshDiagnostic } from '../protocols/contracts';
import { formatDuration } from '../protocols/sshDiagnostic';

export interface HistoryEntry {
  id: EntityId;
  title: string;
  subtitle: string;
  status: Diagnostic['status'];
  details: string[];
  // Salida textual completa (SSH), visible al expandir el registro.
  output?: string;
}

const STATUS_LABEL: Record<Diagnostic['status'], string> = {
  success: 'correcto',
  error: 'con error',
  timeout: 'sin respuesta',
};

export function statusLabel(status: Diagnostic['status']): string {
  return STATUS_LABEL[status] ?? status;
}

// "manual:10.0.2.2" identifica un equipo cargado a mano por su IP.
export function deviceLabel(deviceId: EntityId): string {
  return deviceId.startsWith('manual:')
    ? `${deviceId.slice('manual:'.length)} (manual)`
    : deviceId;
}

function isSnmp(diagnostic: Diagnostic): diagnostic is SnmpDiagnostic {
  return diagnostic.protocol === 'snmp' && 'snmp' in diagnostic;
}

function isSsh(diagnostic: Diagnostic): diagnostic is SshDiagnostic {
  return diagnostic.protocol === 'ssh' && 'ssh' in diagnostic;
}

// Convierte un diagnóstico guardado en el texto que muestra el historial.
export function describeDiagnostic(diagnostic: Diagnostic): HistoryEntry {
  const base = {
    id: diagnostic.id,
    status: diagnostic.status,
    subtitle: `${formatDate(diagnostic.startedAt)} · ${deviceLabel(diagnostic.deviceId)}`,
  };
  if (isSnmp(diagnostic)) {
    const { sysName, uptimeTicks, interfaceIndex, inOctets, outOctets } = diagnostic.snmp;
    return {
      ...base,
      title: `SNMP · ${sysName}`,
      details: [
        `Uptime del agente: ${formatDuration(Math.floor(uptimeTicks / 100))}`,
        `Interfaz ${interfaceIndex}: entrada ${inOctets} y salida ${outOctets} octetos acumulados`,
      ],
    };
  }
  if (isSsh(diagnostic)) {
    const { commandLine, exitStatus, uptimeSeconds, interfaces, hostKeyFingerprint, output, outputTruncated } =
      diagnostic.ssh;
    return {
      ...base,
      title: `SSH · ${commandLine}`,
      details: [
        `Código de salida: ${exitStatus}`,
        ...(uptimeSeconds !== undefined ? [`Encendido hace ${formatDuration(uptimeSeconds)}`] : []),
        ...(interfaces ?? []).map(
          item =>
            `${item.name} · ${item.state}${item.addresses.length ? ` · ${item.addresses.join(', ')}` : ''}`,
        ),
        `Huella del equipo: ${hostKeyFingerprint}`,
      ],
      output: outputTruncated ? `${output}\n[salida recortada]` : output,
    };
  }
  return {
    ...base,
    title: diagnostic.protocol.toUpperCase(),
    details: [diagnostic.summary],
  };
}

// Equipos presentes en los diagnósticos, para el filtro por equipo.
export function devicesIn(diagnostics: Diagnostic[]): EntityId[] {
  return [...new Set(diagnostics.map(item => item.deviceId))].sort();
}

export function filterByDevice(
  diagnostics: Diagnostic[],
  deviceId?: EntityId,
): Diagnostic[] {
  return deviceId
    ? diagnostics.filter(item => item.deviceId === deviceId)
    : diagnostics;
}

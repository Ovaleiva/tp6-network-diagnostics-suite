import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { TechnicalSheet } from '../src/core/domain/models';
import { IdentificationScreen } from '../src/features/identification/IdentificationScreen';
import type { IdentificationServices } from '../src/features/identification/contracts';
import {
  createSheetFetcher,
  describeLookup,
  lookupSheet,
  parseEquipmentCode,
  type FetchSheet,
  type RemoteSheetResult,
} from '../src/features/identification/technicalSheet';
import { migrate } from '../src/infrastructure/storage/schema';
import { createSqliteRepository } from '../src/infrastructure/storage/sqliteRepository';
import { hasSqlite, memoryDb } from '../test-support/memoryDb';

const { startBackend } = require('../backend/server.cjs');

const maybe = hasSqlite ? describe : describe.skip;
const NOW = new Date('2026-11-02T12:00:00.000Z');

const sheet: TechnicalSheet = {
  code: 'TP6-ONT-001',
  vendor: 'Laboratorio TP6',
  model: 'ONT GPON de ejemplo',
  instructions: 'Verificar potencia RX.',
  fetchedAt: '2026-11-01T10:00:00.000Z',
};

describe('código de equipo', () => {
  it.each([
    ['TP6-ONT-001', 'TP6-ONT-001'],
    ['  tp6-rtr-002\n', 'TP6-RTR-002'],
    ['ABC', 'ABC'],
    ['SN_1234.56', 'SN_1234.56'],
  ])('acepta %j', (raw, code) => {
    expect(parseEquipmentCode(raw)).toBe(code);
  });

  it.each(['', 'AB', '-TP6', 'https://example.com/TP6', 'TP6 ONT', 'X'.repeat(65)])(
    'rechaza %j',
    raw => {
      expect(parseEquipmentCode(raw)).toBeNull();
    },
  );
});

describe('vista de la búsqueda', () => {
  it('explica cada resultado', () => {
    expect(describeLookup({ status: 'loading', code: 'A1B' }).note).toBe('Buscando la ficha de A1B…');
    expect(describeLookup({ status: 'loading', code: sheet.code, cached: sheet })).toMatchObject({
      sheet,
      tone: 'info',
    });
    expect(describeLookup({ status: 'found', code: sheet.code, sheet }).tone).toBe('ok');
    expect(
      describeLookup({ status: 'cached', code: sheet.code, sheet, reason: 'unreachable' }).note,
    ).toMatch(/^Sin conexión con el backend\. Se muestra la copia guardada el \d{2}\/11\/2026/u);
    expect(
      describeLookup({ status: 'cached', code: sheet.code, sheet, reason: 'not-found' }).note,
    ).toMatch(/^El backend ya no tiene ficha/u);
    expect(describeLookup({ status: 'not-found', code: 'X-1' })).toEqual({
      note: 'No hay ficha técnica para el código X-1.',
      tone: 'error',
    });
    expect(
      describeLookup({ status: 'unavailable', code: 'X-1', message: 'No se pudo contactar al backend.' })
        .note,
    ).toBe(
      'No se pudo contactar al backend. La ficha de X-1 nunca se descargó en este teléfono; reintente con conexión.',
    );
  });
});

describe('consulta al backend', () => {
  it('trata una respuesta incompleta como no disponible', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 200,
      json: async () => ({ code: 'TP6-ONT-001', vendor: 'x' }),
    })) as unknown as typeof fetch;
    const fetchSheet = createSheetFetcher('http://backend', { fetchImpl });
    expect(await fetchSheet('TP6-ONT-001')).toEqual({
      kind: 'unreachable',
      message: 'El backend envió una ficha inválida.',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://backend/technical-sheets/TP6-ONT-001',
      expect.anything(),
    );
  });

  it('busca en el backend real: ficha, código desconocido y backend apagado', async () => {
    const backend = await startBackend({ port: 0 });
    const url = `http://127.0.0.1:${backend.port}`;
    try {
      const fetchSheet = createSheetFetcher(url, { now: () => NOW, timeoutMs: 3000 });
      expect(await fetchSheet('TP6-RTR-002')).toEqual({
        kind: 'found',
        sheet: {
          code: 'TP6-RTR-002',
          vendor: 'Laboratorio TP6',
          model: 'Router de borde de ejemplo',
          instructions: expect.stringContaining('SSH'),
          fetchedAt: NOW.toISOString(),
        },
      });
      expect(await fetchSheet('TP6-NO-EXISTE')).toEqual({ kind: 'not-found' });
    } finally {
      await backend.close();
    }
    const offline = createSheetFetcher(url, { timeoutMs: 3000 });
    expect((await offline('TP6-RTR-002')).kind).toBe('unreachable');
  });
});

maybe('ficha con copia local', () => {
  async function repo() {
    const db = memoryDb();
    await migrate(db);
    return createSqliteRepository(db);
  }
  const answer = (result: RemoteSheetResult): FetchSheet => async () => result;

  it('guarda la ficha del backend y la muestra sin red', async () => {
    const repository = await repo();
    const updates: string[] = [];
    const found = await lookupSheet(
      sheet.code,
      { repository, fetchSheet: answer({ kind: 'found', sheet }) },
      lookup => updates.push(lookup.status),
    );
    expect(found).toEqual({ status: 'found', code: sheet.code, sheet });
    expect(updates).toEqual(['loading', 'found']);
    expect(await repository.findTechnicalSheet(sheet.code)).toEqual(sheet);

    const offline = await lookupSheet(sheet.code, {
      repository,
      fetchSheet: answer({ kind: 'unreachable', message: 'sin red' }),
    });
    expect(offline).toEqual({ status: 'cached', code: sheet.code, sheet, reason: 'unreachable' });
  });

  it('una ficha nueva del backend reemplaza la copia', async () => {
    const repository = await repo();
    await repository.saveTechnicalSheet(sheet);
    const updated = { ...sheet, instructions: 'Nuevo procedimiento.', fetchedAt: NOW.toISOString() };
    const seen: unknown[] = [];
    await lookupSheet(
      sheet.code,
      { repository, fetchSheet: answer({ kind: 'found', sheet: updated }) },
      lookup => seen.push(lookup),
    );
    expect(seen[0]).toEqual({ status: 'loading', code: sheet.code, cached: sheet });
    expect(await repository.findTechnicalSheet(sheet.code)).toEqual(updated);
  });

  it('distingue código desconocido de ficha nunca descargada', async () => {
    const repository = await repo();
    expect(
      await lookupSheet('X-1', { repository, fetchSheet: answer({ kind: 'not-found' }) }),
    ).toEqual({ status: 'not-found', code: 'X-1' });
    expect(
      await lookupSheet('X-1', {
        repository,
        fetchSheet: answer({ kind: 'unreachable', message: 'sin red' }),
      }),
    ).toEqual({ status: 'unavailable', code: 'X-1', message: 'sin red' });
  });
});

describe('pantalla Identificar equipo', () => {
  let scannerOnCode: ((raw: string) => void) | undefined;
  function FakeScanner({ onCode }: { onCode: (raw: string) => void }) {
    scannerOnCode = onCode;
    return null;
  }

  function services(result: RemoteSheetResult, cached?: TechnicalSheet) {
    const store = new Map<string, TechnicalSheet>(cached ? [[cached.code, cached]] : []);
    const fetchSheet = jest.fn(async () => result);
    const deps: IdentificationServices = {
      repository: {
        findTechnicalSheet: jest.fn(async (code: string) => store.get(code) ?? null),
        saveTechnicalSheet: jest.fn(async (s: TechnicalSheet) => {
          store.set(s.code, s);
        }),
        getSetting: jest.fn(async () => 'http://127.0.0.1:3000'),
      },
      fetcherFor: jest.fn(() => fetchSheet),
    };
    return { deps, fetchSheet, store };
  }

  async function render(deps: IdentificationServices) {
    let screen!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = ReactTestRenderer.create(<IdentificationScreen services={deps} Scanner={FakeScanner} />);
    });
    return screen;
  }
  const text = (screen: ReactTestRenderer.ReactTestRenderer) => JSON.stringify(screen.toJSON());
  const press = (screen: ReactTestRenderer.ReactTestRenderer, label: string) =>
    act(async () => {
      await screen.root
        .find(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')
        .props.onPress();
    });

  beforeEach(() => {
    scannerOnCode = undefined;
  });

  it('lee un código, ignora las lecturas repetidas y muestra la ficha', async () => {
    const { deps, fetchSheet, store } = services({ kind: 'found', sheet });
    const screen = await render(deps);
    await press(screen, 'Escanear código');
    expect(scannerOnCode).toBeDefined();
    const onCode = scannerOnCode!;
    await act(async () => {
      onCode('https://otra-cosa.example');
    });
    expect(text(screen)).toContain('que no es un código de equipo');
    await act(async () => {
      onCode('tp6-ont-001');
      onCode('tp6-ont-001');
    });
    expect(fetchSheet).toHaveBeenCalledTimes(1);
    expect(fetchSheet).toHaveBeenCalledWith('TP6-ONT-001');
    expect(deps.fetcherFor).toHaveBeenCalledWith('http://127.0.0.1:3000');
    expect(text(screen)).toContain('ONT GPON de ejemplo');
    expect(text(screen)).toContain('Ficha actualizada desde el backend');
    expect(text(screen)).toContain('Escanear código');
    expect(store.get('TP6-ONT-001')).toEqual(sheet);
  });

  it('busca un código escrito a mano y usa la copia local sin red', async () => {
    const { deps } = services({ kind: 'unreachable', message: 'No se pudo contactar al backend.' }, sheet);
    const screen = await render(deps);
    const input = screen.root.findByProps({ accessibilityLabel: 'Código del equipo' });
    await act(async () => input.props.onChangeText(' tp6-ont-001 '));
    await press(screen, 'Buscar ficha');
    expect(text(screen)).toContain('Verificar potencia RX.');
    expect(text(screen)).toContain('Sin conexión con el backend');
  });

  it('informa un código desconocido y uno inválido', async () => {
    const { deps } = services({ kind: 'not-found' });
    const screen = await render(deps);
    const input = () => screen.root.findByProps({ accessibilityLabel: 'Código del equipo' });
    await act(async () => input().props.onChangeText('ab'));
    await press(screen, 'Buscar ficha');
    expect(text(screen)).toContain('Código inválido');
    await act(async () => input().props.onChangeText('TP6-XYZ-999'));
    await press(screen, 'Buscar ficha');
    expect(text(screen)).toContain('No hay ficha técnica para el código TP6-XYZ-999.');
  });

  it('cancelar la lectura cierra la cámara', async () => {
    const { deps } = services({ kind: 'not-found' });
    const screen = await render(deps);
    await press(screen, 'Escanear código');
    await press(screen, 'Cancelar lectura');
    expect(screen.root.findAllByType(FakeScanner)).toHaveLength(0);
  });
});

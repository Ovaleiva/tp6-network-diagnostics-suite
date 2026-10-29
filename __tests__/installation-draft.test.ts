import {
  addPhoto,
  emptyDraft,
  FIX_MAX_AGE_MS,
  MAX_PHOTOS,
  removePhoto,
  toInstallation,
  validate,
} from '../src/features/evidence/installationDraft';

const now = new Date('2026-10-29T10:00:00.000Z');
const fix = {
  latitude: -32.48,
  longitude: -58.23,
  accuracyMeters: 8,
  capturedAt: now.toISOString(),
};

function ready() {
  return { ...emptyDraft(now), siteId: 'torre-norte', notes: 'ONT instalada' };
}

describe('borrador de instalación', () => {
  it('exige sitio válido y notas', () => {
    expect(validate(emptyDraft(now))).toHaveLength(2);
    expect(validate({ ...ready(), siteId: 'con espacio' })).toHaveLength(1);
    expect(validate(ready())).toEqual([]);
  });

  it('georreferencia la foto solo con una ubicación reciente', () => {
    const withFix = { ...ready(), coordinates: fix };
    expect(addPhoto(withFix, '/tmp/a.jpg', now).photos[0].coordinates).toEqual(fix);
    const late = new Date(now.getTime() + FIX_MAX_AGE_MS + 1);
    expect(addPhoto(withFix, '/tmp/a.jpg', late).photos[0].coordinates).toBeUndefined();
  });

  it('limita la cantidad de fotos y permite quitarlas', () => {
    let draft = ready();
    for (let i = 0; i < MAX_PHOTOS; i++) draft = addPhoto(draft, `/tmp/${i}.jpg`, now);
    expect(() => addPhoto(draft, '/tmp/x.jpg', now)).toThrow();
    expect(removePhoto(draft, draft.photos[0].id).photos).toHaveLength(MAX_PHOTOS - 1);
  });

  it('cada guardado sube la revisión y genera su acción', () => {
    const first = toInstallation(ready(), now);
    expect(first.installation.revision).toBe(1);
    expect(first.action).toMatchObject({
      entityId: first.installation.id,
      entityRevision: 1,
      kind: 'installation.upsert',
      state: 'pending',
    });
    const second = toInstallation({ ...ready(), id: first.installation.id, revision: 1 }, now);
    expect(second.installation.revision).toBe(2);
  });

  it('no guarda un borrador inválido', () => {
    expect(() => toInstallation(emptyDraft(now), now)).toThrow(/sitio/);
  });
});

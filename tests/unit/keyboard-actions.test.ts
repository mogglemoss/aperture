import { describe, expect, it, vi } from 'vitest';
import { buildPaletteActions, cycleNext, type KeyboardActionContext } from '@/lib/map/keyboardActions';
import type { MapSystemNode } from '@/types';

function system(overrides: Partial<MapSystemNode> = {}): MapSystemNode {
  return {
    id: '10',
    systemId: 31000001,
    name: 'J100001',
    security: 'C2',
    alias: null,
    tag: null,
    intelNotes: null,
    status: 'unknown',
    locked: false,
    lockedByName: null,
    rallyAt: null,
    positionX: 0,
    positionY: 0,
    statics: [],
    effect: null,
    tradeHub: null,
    ...overrides,
  } as MapSystemNode;
}

function ctx(overrides: Partial<KeyboardActionContext> = {}): KeyboardActionContext {
  return {
    selectedSystem: null,
    selectedConnection: null,
    homeMapSystemId: null,
    systems: [],
    onSystemPatch: vi.fn(),
    onSystemRemove: vi.fn(),
    onConnectionPatch: vi.fn(),
    onConnectionDelete: vi.fn(),
    openAddSystem: vi.fn(),
    jumpToSystem: vi.fn(),
    ...overrides,
  };
}

describe('cycleNext', () => {
  it('advances and wraps', () => {
    expect(cycleNext(['a', 'b', 'c'] as const, 'a')).toBe('b');
    expect(cycleNext(['a', 'b', 'c'] as const, 'c')).toBe('a');
  });
});

describe('buildPaletteActions', () => {
  it('skips the current status and includes the other five', () => {
    const actions = buildPaletteActions(ctx({ selectedSystem: system({ status: 'hostile' }) }));
    const statuses = actions.filter((a) => a.id.startsWith('system-status-'));
    expect(statuses).toHaveLength(5);
    expect(statuses.some((a) => a.id === 'system-status-hostile')).toBe(false);
  });

  it('offers no remove for a locked system or the Home system', () => {
    const locked = buildPaletteActions(ctx({ selectedSystem: system({ locked: true }) }));
    expect(locked.some((a) => a.id === 'system-remove')).toBe(false);
    const home = buildPaletteActions(
      ctx({ selectedSystem: system(), homeMapSystemId: '10' }),
    );
    expect(home.some((a) => a.id === 'system-remove')).toBe(false);
    const plain = buildPaletteActions(ctx({ selectedSystem: system() }));
    expect(plain.some((a) => a.id === 'system-remove')).toBe(true);
  });

  it('dispatches the context callback verbatim', () => {
    const c = ctx({ selectedSystem: system() });
    const lock = buildPaletteActions(c).find((a) => a.id === 'system-lock')!;
    lock.perform();
    expect(c.onSystemPatch).toHaveBeenCalledWith('10', { locked: true });
  });

  it('lists every visible system in the jump group', () => {
    const c = ctx({
      systems: [system(), system({ id: '11', systemId: 31000002, name: 'J100002', alias: 'Farm' })],
    });
    const jumps = buildPaletteActions(c).filter((a) => a.group === 'Jump to system');
    expect(jumps).toHaveLength(2);
    expect(jumps[1]!.label).toBe('Farm (J100002)');
    jumps[1]!.perform();
    expect(c.jumpToSystem).toHaveBeenCalledWith(31000002);
  });
});

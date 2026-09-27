import {
  applyTypeToName,
  FRAME_TYPES,
  FRAME_TYPE_KEY,
  FRAME_TYPE_NAMESPACE,
  markFrame,
  MarkableNode,
  normalizeFrameType,
  readFrameType,
  stripTypePrefix,
} from '@/plugin/frameType';

class FakeNode implements MarkableNode {
  private data: Record<string, string> = {};

  constructor(
    public readonly id: string,
    public name: string,
    public readonly type: string = 'FRAME',
  ) {}

  getSharedPluginData(namespace: string, key: string) {
    return this.data[`${namespace}:${key}`] ?? '';
  }

  setSharedPluginData(namespace: string, key: string, value: string) {
    this.data[`${namespace}:${key}`] = value;
  }
}

describe('normalizeFrameType', () => {
  it('accepts a lowercase slug and trims it', () => {
    expect(normalizeFrameType('  Drawer ')).toEqual({ ok: true, type: 'drawer' });
  });

  it('accepts a custom type that is not in the built-in list', () => {
    expect(normalizeFrameType('side-panel')).toEqual({ ok: true, type: 'side-panel' });
  });

  it('refuses anything that would not survive as a name prefix', () => {
    expect(normalizeFrameType('half sheet').ok).toBe(false);
    expect(normalizeFrameType('modal/confirm').ok).toBe(false);
    expect(normalizeFrameType('2fa').ok).toBe(false);
    expect(normalizeFrameType('').ok).toBe(false);
  });
});

describe('applyTypeToName', () => {
  it('prefixes a plain name', () => {
    expect(applyTypeToName('Login', 'page')).toBe('page/Login');
  });

  it('replaces a prefix this plugin would have written', () => {
    expect(applyTypeToName('page/Login', 'modal')).toBe('modal/Login');
  });

  it('replaces a custom prefix it previously wrote itself', () => {
    expect(applyTypeToName('side-panel/Filters', 'drawer', 'side-panel')).toBe('drawer/Filters');
  });

  it("keeps somebody else's naming rather than claiming the slot", () => {
    // `marketing` is not a frame type and was not written here, so it stays.
    expect(applyTypeToName('marketing/Landing', 'page')).toBe('page/marketing/Landing');
  });

  it('leaves a name with no prefix pattern alone apart from prefixing', () => {
    expect(applyTypeToName('Sign in / register', 'page')).toBe('page/Sign in / register');
  });
});

describe('stripTypePrefix', () => {
  it('removes a built-in prefix', () => {
    expect(stripTypePrefix('modal/Confirm delete')).toBe('Confirm delete');
  });

  it('removes a known custom prefix', () => {
    expect(stripTypePrefix('side-panel/Filters', 'side-panel')).toBe('Filters');
  });

  it('leaves an unrelated prefix in place', () => {
    expect(stripTypePrefix('marketing/Landing')).toBe('marketing/Landing');
  });
});

describe('markFrame', () => {
  it('renames the frame and records the type where a rename cannot break it', () => {
    const node = new FakeNode('7:2', 'Login');

    const outcome = markFrame(node, 'page', new Date('2026-09-27T18:00:00Z'));

    expect(outcome).toEqual({
      ok: true,
      result: { nodeId: '7:2', type: 'page', previousName: 'Login', name: 'page/Login' },
    });
    expect(JSON.parse(node.getSharedPluginData(FRAME_TYPE_NAMESPACE, FRAME_TYPE_KEY))).toEqual({
      specVersion: '1.0.0',
      type: 'page',
      markedAt: '2026-09-27T18:00:00.000Z',
    });
  });

  it('re-marking swaps both the prefix and the record, leaving no trace of the old type', () => {
    const node = new FakeNode('7:2', 'Login');
    markFrame(node, 'page');

    markFrame(node, 'modal');

    expect(node.name).toBe('modal/Login');
    expect(readFrameType(node)?.type).toBe('modal');
  });

  it('refuses a node that cannot be a screen', () => {
    const node = new FakeNode('7:9', 'Button', 'INSTANCE');

    expect(markFrame(node, 'page')).toEqual({
      ok: false,
      error: 'a instance cannot be a screen — select a frame',
    });
  });

  it('refuses a malformed type without touching the frame', () => {
    const node = new FakeNode('7:2', 'Login');

    const outcome = markFrame(node, 'half sheet');

    expect(outcome.ok).toBe(false);
    expect(node.name).toBe('Login');
    expect(readFrameType(node)).toBeNull();
  });

  it('treats unreadable plugin data as absent rather than throwing', () => {
    const node = new FakeNode('7:2', 'page/Login');
    node.setSharedPluginData(FRAME_TYPE_NAMESPACE, FRAME_TYPE_KEY, 'not json');

    expect(readFrameType(node)).toBeNull();
    expect(markFrame(node, 'drawer').ok).toBe(true);
    expect(node.name).toBe('drawer/Login');
  });

  it('every built-in type is a legal prefix', () => {
    FRAME_TYPES.forEach((type) => {
      expect(normalizeFrameType(type)).toEqual({ ok: true, type });
    });
  });
});

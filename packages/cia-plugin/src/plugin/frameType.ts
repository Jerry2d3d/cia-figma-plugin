/**
 * Marking a frame as a page, a modal, a drawer and so on.
 *
 * A screen cannot be a component: Figma instances take no new children, so a
 * frame a person composes into can never be an instance of anything. The type
 * is therefore recorded *on* the frame, two ways at once.
 *
 * The name prefix (`modal/Confirm delete`) is what a person sees and sorts by
 * in the layers panel. The plugin data is what a reader trusts, because a
 * rename cannot silently change it and a typo cannot invent a type. They are
 * written together and read together, and a disagreement between them is
 * reportable rather than resolved by guessing.
 */

export const FRAME_TYPE_SPEC_VERSION = '1.0.0';
export const FRAME_TYPE_NAMESPACE = 'cia';
export const FRAME_TYPE_KEY = 'frameType';

/**
 * The built-in list. Everything but `page` and `sheet` names a real surface in
 * the BoilerPlate library, so a designer marking a frame `drawer` is using the
 * same word the component is called. `page` is the default screen and has no
 * component; `sheet` is a pattern the library does not have a component for
 * yet, and is included because it is a distinct surface a PM will reach for.
 */
export const FRAME_TYPES = [
  'page',
  'modal',
  'drawer',
  'sheet',
  'popup',
  'toast',
  'window',
  'menu',
] as const;

export type BuiltInFrameType = (typeof FRAME_TYPES)[number];

/** Which library components each built-in type corresponds to, for the UI. */
export const FRAME_TYPE_COMPONENTS: Record<BuiltInFrameType, string[]> = {
  page: [],
  modal: ['Modal', 'CustomizeModal', 'ConfirmDialog'],
  drawer: ['Drawer'],
  sheet: [],
  popup: ['Popup', 'ConfirmPopup'],
  toast: ['Toast'],
  window: ['Window'],
  menu: ['Menu'],
};

export interface FrameTypeData {
  specVersion: string;
  type: string;
  markedAt: string;
}

/** A type is a short lowercase slug, so it can be a name prefix without quoting. */
export function normalizeFrameType(input: string): { ok: true; type: string } | { ok: false; error: string } {
  const type = input.trim().toLowerCase();
  if (type.length === 0) {
    return { ok: false, error: 'a frame type cannot be empty' };
  }
  if (type.length > 24) {
    return { ok: false, error: `"${type}" is too long for a name prefix (24 characters maximum)` };
  }
  if (!/^[a-z][a-z0-9-]*$/.test(type)) {
    return {
      ok: false,
      error: `"${input}" must be lowercase letters, digits and hyphens, starting with a letter`,
    };
  }
  return { ok: true, type };
}

/**
 * Applies the type as a name prefix. An existing prefix is replaced only when
 * it is one this plugin would have written, either a built-in type or the type
 * already recorded on the frame. A frame a person named `marketing/Landing`
 * keeps that prefix and gets the type prepended, because throwing away
 * somebody's own naming to make room is not this tool's call to make.
 */
export function applyTypeToName(currentName: string, type: string, previousType?: string): string {
  const match = /^([a-z][a-z0-9-]*)\/(.*)$/.exec(currentName);
  if (match) {
    const [, prefix, rest] = match;
    const ours = prefix === previousType || (FRAME_TYPES as readonly string[]).includes(prefix);
    if (ours) {
      return `${type}/${rest}`;
    }
  }
  return `${type}/${currentName}`;
}

/** The plain name, with any type prefix removed. */
export function stripTypePrefix(name: string, knownType?: string): string {
  const match = /^([a-z][a-z0-9-]*)\/(.*)$/.exec(name);
  if (!match) {
    return name;
  }
  const [, prefix, rest] = match;
  return prefix === knownType || (FRAME_TYPES as readonly string[]).includes(prefix) ? rest : name;
}

/** The node kinds that can sensibly be a screen. */
export const MARKABLE_TYPES = ['FRAME', 'COMPONENT', 'SECTION'] as const;

export interface MarkableNode {
  readonly id: string;
  readonly type: string;
  name: string;
  getSharedPluginData(namespace: string, key: string): string;
  setSharedPluginData(namespace: string, key: string, value: string): void;
}

export interface MarkResult {
  nodeId: string;
  type: string;
  previousName: string;
  name: string;
}

export function readFrameType(node: MarkableNode): FrameTypeData | null {
  const raw = node.getSharedPluginData(FRAME_TYPE_NAMESPACE, FRAME_TYPE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as FrameTypeData;
    return typeof parsed.type === 'string' ? parsed : null;
  } catch {
    // Unreadable data is treated as absent rather than thrown past this
    // boundary: a person can always mark the frame again.
    return null;
  }
}

export function markFrame(
  node: MarkableNode,
  requestedType: string,
  now: Date = new Date(),
): { ok: true; result: MarkResult } | { ok: false; error: string } {
  if (!(MARKABLE_TYPES as readonly string[]).includes(node.type)) {
    return {
      ok: false,
      error: `a ${node.type.toLowerCase()} cannot be a screen — select a frame`,
    };
  }

  const normalized = normalizeFrameType(requestedType);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const previous = readFrameType(node);
  const previousName = node.name;
  node.name = applyTypeToName(previousName, normalized.type, previous?.type);

  const data: FrameTypeData = {
    specVersion: FRAME_TYPE_SPEC_VERSION,
    type: normalized.type,
    markedAt: now.toISOString(),
  };
  node.setSharedPluginData(FRAME_TYPE_NAMESPACE, FRAME_TYPE_KEY, JSON.stringify(data));

  return {
    ok: true,
    result: { nodeId: node.id, type: normalized.type, previousName, name: node.name },
  };
}

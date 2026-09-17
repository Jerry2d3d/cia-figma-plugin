import { postToPlugin } from '@/shared/messages';

describe('postToPlugin', () => {
  it('wraps the message in a pluginMessage envelope', () => {
    const postMessage = jest.fn();
    window.parent.postMessage = postMessage;

    postToPlugin({ type: 'sync-tokens', contract: { collection: 'cia' } });

    expect(postMessage).toHaveBeenCalledWith(
      { pluginMessage: { type: 'sync-tokens', contract: { collection: 'cia' } } },
      '*',
    );
  });
});

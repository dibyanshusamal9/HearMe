import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubSpeechRecognizer, microphoneErrorKey, MicRecorder } from '../src/web/micRecorder';
import { translator } from '../src';

afterEach(() => vi.unstubAllGlobals());

describe('phone microphone access', () => {
  it('identifies HTTP as the problem even when a cabin hub is connected', async () => {
    vi.stubGlobal('isSecureContext', false);
    vi.stubGlobal('navigator', {});
    const speech = new HubSpeechRecognizer(() => 'http://192.168.1.20:8080');
    const error = await speech.start('en', vi.fn()).catch(error => error);
    expect(error.reason).toBe('insecure');
    const message = translator('en')(microphoneErrorKey(error));
    expect(message).toContain('secure page');
    expect(message).not.toContain('cabin connection');
  });

  it('reports a missing hub separately from browser restrictions', async () => {
    vi.stubGlobal('isSecureContext', true);
    const speech = new HubSpeechRecognizer(() => null);
    const error = await speech.start('en', vi.fn()).catch(error => error);
    expect(error.reason).toBe('no-hub');
    expect(microphoneErrorKey(error)).toBe('speech.needsHub');
  });

  it('reports an unsupported browser without claiming the cabin is disconnected', async () => {
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {});
    const error = await new MicRecorder().start(vi.fn()).catch(error => error);
    expect(error.reason).toBe('unsupported');
    expect(translator('en')(microphoneErrorKey(error))).toContain('Chrome or Safari');
  });

  it('keeps permission denial distinct and releases the audio context', async () => {
    const close = vi.fn(async () => undefined);
    const getUserMedia = vi.fn(async () => { throw { name: 'NotAllowedError' }; });
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('AudioContext', class { close = close; });
    const error = await new MicRecorder().start(vi.fn()).catch(error => error);
    expect(microphoneErrorKey(error)).toBe('speech.micDenied');
    expect(close).toHaveBeenCalledOnce();
  });

  it('records normally on a secure phone page and stops the microphone', async () => {
    const stop = vi.fn();
    const close = vi.fn(async () => undefined);
    const stream = { getTracks: () => [{ stop }] };
    const node = () => ({ connect: vi.fn(next => next), disconnect: vi.fn() });
    const getUserMedia = vi.fn(async () => stream);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('AudioContext', class {
      state = 'running';
      sampleRate = 48000;
      destination = {};
      close = close;
      createMediaStreamSource = node;
      createBiquadFilter = () => ({ ...node(), frequency: { value: 0 } });
      createScriptProcessor = node;
      createGain = () => ({ ...node(), gain: { value: 1 } });
    });
    const speech = new HubSpeechRecognizer(() => 'https://192.168.1.20:8443');
    await expect(speech.start('hi', vi.fn())).resolves.toBeUndefined();
    expect(getUserMedia).toHaveBeenCalledOnce();
    speech.cancel();
    expect(stop).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DemoCabinLink, PassengerSession, setProcessingMode } from '@hearme/shared';
import { CaptionToast } from '../src/ife/overlays';

let session: PassengerSession; let link: DemoCabinLink;
afterEach(() => { session.dispose(); link.dispose(); setProcessingMode('offline'); });
it.each(['offline', 'online'] as const)('speaks a new seatback announcement and offers replay in %s mode', async (mode) => {
  setProcessingMode(mode); link = new DemoCabinLink('simulated'); session = new PassengerSession({ link, device: 'ife' });
  session.setProfile({ seat: '23C', lang: 'en', tags: [], shareTagsWithCrew: false });
  const speaker = { available: () => true, speak: vi.fn(), stop: vi.fn() };
  render(<CaptionToast session={session} lang="en" onOpen={vi.fn()} speaker={speaker} />);
  act(() => link.simulatedCrew?.announce('seatbelt_on'));
  await waitFor(() => expect(speaker.speak).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: 'Play announcement' }));
  expect(speaker.speak).toHaveBeenCalledTimes(2);
});

import { DemoCabinLink, PassengerSession, hasCloudConsent, setCloudConsent, setProcessingMode } from '@hearme/shared';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { IfeApp } from '../src/ife/IfeApp';

let link: DemoCabinLink;
let session: PassengerSession;

function setup(props: Partial<Parameters<typeof IfeApp>[0]> = {}) {
  link = new DemoCabinLink('simulated');
  session = new PassengerSession({ link, device: 'ife' });
  const user = userEvent.setup();
  render(<IfeApp session={session} link={link} seat="23C" {...props} />);
  return user;
}

afterEach(() => {
  session.dispose();
  link.dispose();
  setCloudConsent(false);
  setProcessingMode('offline');
});

async function start(user: ReturnType<typeof userEvent.setup>, language = 'English') {
  await user.click(screen.getByRole('button', { name: /touch to start|छुएँ|タッチ|แตะ|sentuh|chạm/i }));
  // Anchored: a pack language's button also mentions the language its untranslated
  // screens fall back to ("Bengali · some screens in English").
  await user.click(screen.getByRole('button', { name: new RegExp(`^${language}`) }));
}

describe('IFE seatback', () => {
  it('switches processing modes without replacing the original controls and revokes consent on session end', async () => {
    Element.prototype.scrollTo = () => undefined;
    setCloudConsent(false);
    const user = setup(); await start(user);
    expect(screen.getByRole('button', { name: 'Water' })).toBeInTheDocument();
    expect(screen.queryByText(/Tara/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Online mode' }));
    expect(screen.getByText('Enable Online mode')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Water' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'I agree — enable Online mode' }));
    expect(hasCloudConsent()).toBe(true);
    expect(screen.getByRole('switch', { name: 'Online mode' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('button', { name: /End session/ }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'End and clear' }));
    expect(hasCloudConsent()).toBe(false);
  });
  it('completes the PDF journey: hot water for medicine → crew reply in Hindi → thank you', async () => {
    const user = setup();
    await start(user, 'हिन्दी');
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /होम/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'गरम पानी' }));
    await user.click(screen.getByRole('button', { name: 'दवाई के लिए' }));
    await user.click(screen.getByRole('button', { name: 'क्रू को भेजें' }));
    // Delivery is confirmed by the (simulated) crew tablet, never assumed.
    expect(await screen.findByText('क्रू को मिल गया', { selector: '.ife-chip' })).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', {}, { timeout: 5000 });
    expect(within(dialog).getByText('हम इसे तुरंत ला रहे हैं।')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /धन्यवाद/ }));
    expect(session.getState().requests[0]!.status).toBe('closed');
  });

  it('shows the connection status and keeps requests pending (not sent) while offline', async () => {
    const user = setup();
    await start(user);
    act(() => link.setCondition('offline'));
    expect(screen.getAllByText('No cabin connection').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Blanket' }));
    await user.click(screen.getByRole('button', { name: 'Send to crew' }));
    expect(screen.getByText('Waiting for connection', { selector: '.ife-chip' })).toBeInTheDocument();
    expect(screen.queryByText('Crew has received it', { selector: '.ife-chip' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('main')).getByRole('button', { name: 'Show to crew' })).toBeInTheDocument();
  });

  it('keeps private requests neutral on the shared screen', async () => {
    const user = setup();
    await start(user);
    await user.click(screen.getByRole('button', { name: /Private request/ }));
    await user.click(screen.getByRole('button', { name: 'Sanitary products' }));
    await user.click(screen.getByRole('button', { name: 'Send to crew' }));
    expect(screen.getByText('A crew member has been asked to come to your seat.')).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation')).getByRole('button', { name: 'Home' }));
    expect(screen.queryByText('Sanitary products')).not.toBeInTheDocument();
  });

  it('End session clears everything and returns to the start screen', async () => {
    const user = setup();
    await start(user);
    await user.click(screen.getByRole('button', { name: 'Water' }));
    await user.click(screen.getByRole('button', { name: 'Send to crew' }));
    await user.click(screen.getByRole('button', { name: /End session/ }));
    const dlg = screen.getByRole('alertdialog');
    await user.click(within(dlg).getByRole('button', { name: 'End and clear' }));
    expect(screen.getByRole('button', { name: /touch to start|छुएँ|タッチ|แตะ|sentuh|chạm/i })).toBeInTheDocument();
    expect(session.getState()).toMatchObject({ profile: null, requests: [] });
  });

  it('asks "Are you still there?" after inactivity and then clears itself', async () => {
    const user = setup({ idleMs: 50, idleGraceSeconds: 1 });
    await start(user);
    expect(await screen.findByText('Are you still there?')).toBeInTheDocument();
    await screen.findByRole('button', { name: /touch to start|छुएँ|タッチ|แตะ|sentuh|chạm/i }, { timeout: 3000 });
    expect(session.getState().profile).toBeNull();
  });

  it('never shows a passenger name on the shared screen', async () => {
    const user = setup();
    await start(user);
    expect(session.getState().profile?.name).toBeUndefined();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello What do you need?');
  });
});

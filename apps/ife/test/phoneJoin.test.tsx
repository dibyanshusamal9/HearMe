import { DemoCabinLink, PassengerSession } from '@hearme/shared';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { passengerUrl } from '../src/common/PhoneJoin';
import { IfeApp } from '../src/ife/IfeApp';

vi.mock('../src/common/hub', () => ({
  hubBaseUrl: () => 'http://192.168.1.20:8080',
  useHubStatus: () => ({ urls: { join: 'http://192.168.1.20:8080/mobile/?seat=23C', base: 'https://192.168.1.20:8443' } }),
}));

describe('IFE phone access', () => {
  it('shows the current seat QR on welcome and home, outside the start button', () => {
    const link = new DemoCabinLink('simulated');
    const session = new PassengerSession({ link, device: 'ife' });
    const view = render(<IfeApp session={session} link={link} seat="31A" />);
    const qr = screen.getByAltText('HearMe · 31A');
    expect(new URL(qr.getAttribute('src')!).searchParams.get('data')).toBe('http://192.168.1.20:8080/mobile/?seat=31A');
    expect(qr.closest('button')).toBeNull();
    expect(screen.getByText(/No app to install/)).toBeInTheDocument();
    view.unmount();
    session.setProfile({ seat: '31A', lang: 'en', tags: [], shareTagsWithCrew: false });
    const home = render(<IfeApp session={session} link={link} seat="31A" />);
    expect(screen.getByRole('heading', { name: 'Use your phone' })).toBeInTheDocument();
    expect(screen.getByAltText('HearMe · 31A')).toBeInTheDocument();
    home.unmount();
    session.dispose();
    link.dispose();
  });

  it('uses a direct browser path, resets stale parameters, and avoids a QR without a hub', () => {
    expect(passengerUrl('http://hub:8080/trust?next=old#old', '21F')).toBe('http://hub:8080/mobile/?seat=21F');
    expect(passengerUrl(undefined, '21F')).toBeNull();
    expect(passengerUrl('javascript:alert(1)', '21F')).toBeNull();
  });
});

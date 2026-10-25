import type { PassengerProfile, ProfileTag } from '../types';

export const PROFILE_TAGS: ProfileTag[] = ['senior', 'hard_of_hearing', 'low_vision', 'wheelchair', 'medical', 'travelling_with_child'];

/** Seat like "23C": row 1–70, column letter A–K (no I, which airlines skip). */
const SEAT_RE = /^([1-9]|[1-6][0-9]|70)([A-HJK])$/;

export function normalizeSeat(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

export function isValidSeat(input: string): boolean {
  return SEAT_RE.test(normalizeSeat(input));
}

export const NAME_MAX_LENGTH = 40;

export function sanitizeName(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_LENGTH);
}

/**
 * MOCK booking adapter. The PDF says language and needs "travel with the
 * booking" (saved once at check-in). This returns the example persona from
 * the PDF instead of calling an airline system.
 */
export interface BookingAdapter {
  readonly simulated: boolean;
  lookup(): Promise<PassengerProfile>;
}

export const mockBooking: BookingAdapter = {
  simulated: true,
  lookup: () =>
    new Promise((resolve) =>
      setTimeout(
        () =>
          resolve({
            lang: 'hi',
            seat: '23C',
            name: 'शारदा',
            tags: ['senior', 'hard_of_hearing'],
            shareTagsWithCrew: true,
          }),
        700,
      ),
    ),
};

/** MOCK seat QR scanner: the QR code on the seat encodes the seat number. */
export function simulateSeatQrScan(): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve('23C'), 600));
}

import { describe, expect, it } from 'vitest';
import { defaultMatcher, splitRequests, understandRequests } from '../src';

const understand = (text: string) => understandRequests(text, (t) => defaultMatcher.match(t), defaultMatcher);
const ids = (r: { requests: { needId: string }[] }) => r.requests.map((x) => x.needId).sort();

describe('several requests in one sentence, and refusals', () => {
  it('Hindi: not cold water; hot water for medicine; and a blanket', async () => {
    const r = await understand('मुझे ठंडा पानी नहीं चाहिए, दवाई लेने के लिए गरम पानी चाहिए, और हो सके तो एक कंबल भी दे दीजिए।');
    expect(ids(r)).toEqual(['blanket', 'hot_water']);
    expect(r.requests.find((x) => x.needId === 'hot_water')?.purposeId).toBe('for_medicine');
    expect(r.refused).toContain('water');
  });

  it.each([
    ["I don't want cold water. I need hot water for my medicine and a blanket, please", ['blanket', 'hot_water'], 'water'],
    ['冷たい水はいらない。お湯と毛布をください', ['blanket', 'hot_water'], 'water'],
    ['ไม่เอาน้ำเปล่า ขอน้ำร้อน และผ้าห่มหน่อย', ['blanket', 'hot_water'], 'water'],
    ['Saya tidak mau air dingin, minta air panas dan selimut', ['blanket', 'hot_water'], undefined],
    ['Tôi không cần nước lạnh, cho tôi nước nóng và chăn', ['blanket', 'hot_water'], undefined],
    ['hot water instead of tea', ['hot_water'], 'tea'],
  ])('%s', async (text, want, notWanted) => {
    const r = await understand(text);
    expect(ids(r)).toEqual(want);
    if (notWanted) expect(r.refused).toContain(notWanted);
  });

  it('keeps a simple request as one part, and does not mistake "unwell" for a refusal', async () => {
    expect(splitRequests('मुझे दवाई के लिए गरम पानी चाहिए')).toHaveLength(1);
    expect((await understand('ไม่สบาย')).refused).toEqual([]);
    expect((await understand("I'm not feeling well")).refused).toEqual([]);
  });
});

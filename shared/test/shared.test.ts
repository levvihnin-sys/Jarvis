import { describe, expect, it } from 'vitest';
import {
  coarsenLocation,
  decryptDm,
  distanceMeters,
  encryptDm,
  fromBase64,
  generateIdentity,
  hashSsid,
  networkKeyFromIp,
  networkKeyFromUserInput,
  normalizeSsid,
  profileSchema,
  safetyCode,
  signChallenge,
  toBase64,
  toBase64Url,
  utf8Decode,
  utf8Encode,
  verifyChallenge,
  verifyKeySig,
  clientMessageSchema,
} from '../src';

describe('encoding', () => {
  it('base64 roundtrip and compatibility with Buffer', () => {
    for (let len = 0; len < 40; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 255);
      const b64 = toBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(fromBase64(b64)!)).toEqual(Array.from(bytes));
      expect(Array.from(fromBase64(toBase64Url(bytes))!)).toEqual(Array.from(bytes));
    }
    expect(fromBase64('a$b=')).toBeNull();
  });

  it('utf8 roundtrip incl. emoji and cyrillic', () => {
    const s = 'Привет 👋 мир — café ✓';
    expect(Buffer.from(utf8Encode(s)).toString('utf8')).toBe(s);
    expect(utf8Decode(Buffer.from(s, 'utf8'))).toBe(s);
  });
});

describe('network keys', () => {
  it.each([
    ['203.0.113.7', '4:203.0.113.7'],
    ['::ffff:203.0.113.7', '4:203.0.113.7'],
    ['192.168.1.23', '4l:192.168.1.0/24'],
    ['10.0.5.200', '4l:10.0.5.0/24'],
    ['2001:db8:1:2::abcd', '6:2001:db8:1:2::/64'],
    ['2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd', '6:2001:db8:1:2::/64'],
    ['fe80::1%eth0', '6:fe80:0:0:0::/64'],
    ['::1', '6:::1/128'],
    ['127.0.0.1', '4:127.0.0.1'],
  ])('%s → %s', (ip, key) => {
    expect(networkKeyFromIp(ip)).toBe(key);
  });

  it('devices on the same IPv6 /64 share a key', () => {
    expect(networkKeyFromIp('2a02:6b8:c0f:1::1')).toBe(networkKeyFromIp('2a02:6b8:c0f:1:ffff:1:2:3'));
    expect(networkKeyFromIp('2a02:6b8:c0f:1::1')).not.toBe(networkKeyFromIp('2a02:6b8:c0f:2::1'));
  });

  it('rejects garbage', () => {
    expect(networkKeyFromIp('300.1.1.1')).toBeNull();
    expect(networkKeyFromIp('hello')).toBeNull();
    expect(networkKeyFromIp('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(networkKeyFromIp('1::2::3')).toBeNull();
  });

  it('parses owner input', () => {
    expect(networkKeyFromUserInput(' 203.0.113.7 ')).toBe('4:203.0.113.7');
    expect(networkKeyFromUserInput('192.168.0.0/24')).toBe('4l:192.168.0.0/24');
    expect(networkKeyFromUserInput('2001:db8:1:2::/64')).toBe('6:2001:db8:1:2::/64');
    expect(networkKeyFromUserInput('203.0.113.0/24')).toBeNull();
  });
});

describe('ssid', () => {
  it('normalizes OS quirks', () => {
    expect(normalizeSsid('"Cafe WiFi"')).toBe('Cafe WiFi');
    expect(normalizeSsid('<unknown ssid>')).toBeNull();
    expect(normalizeSsid('')).toBeNull();
    expect(normalizeSsid(null)).toBeNull();
  });
  it('hash is stable and hex', () => {
    expect(hashSsid('Cafe WiFi')).toMatch(/^[0-9a-f]{32}$/);
    expect(hashSsid('Cafe WiFi')).toBe(hashSsid('Cafe WiFi'));
    expect(hashSsid('Cafe WiFi')).not.toBe(hashSsid('cafe wifi'));
  });
});

describe('crypto', () => {
  it('identity signatures verify and reject tampering', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    expect(verifyKeySig(a.id, a.boxPk, a.keySig)).toBe(true);
    expect(verifyKeySig(a.id, b.boxPk, a.keySig)).toBe(false);
    const sig = signChallenge(a, 'challenge-1');
    expect(verifyChallenge(a.id, 'challenge-1', sig)).toBe(true);
    expect(verifyChallenge(a.id, 'challenge-2', sig)).toBe(false);
    expect(verifyChallenge(b.id, 'challenge-1', sig)).toBe(false);
  });

  it('dm roundtrip only for the recipient', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    const eve = generateIdentity();
    const { nonce, box } = encryptDm({ kind: 'text', text: 'Привет! За соседним столиком 👋' }, b.boxPk, a);
    expect(decryptDm(box, nonce, a.boxPk, b)).toEqual({ kind: 'text', text: 'Привет! За соседним столиком 👋' });
    expect(decryptDm(box, nonce, a.boxPk, eve)).toBeNull();
    expect(decryptDm(box, nonce, eve.boxPk, b)).toBeNull();
  });

  it('safety code is symmetric', () => {
    const a = generateIdentity();
    const b = generateIdentity();
    expect(safetyCode(a.id, b.id)).toBe(safetyCode(b.id, a.id));
    expect(safetyCode(a.id, b.id)).toMatch(/^(\d{4} ){5}\d{4}$/);
  });
});

describe('geo', () => {
  it('coarsening is idempotent and within precision', () => {
    const p = { lat: 55.751244, lon: 37.618423 };
    const c = coarsenLocation(p.lat, p.lon, 'block');
    expect(coarsenLocation(c.lat, c.lon, 'block')).toEqual(c);
    expect(distanceMeters(p, c)).toBeLessThan(250);
    const area = coarsenLocation(p.lat, p.lon, 'area');
    expect(distanceMeters(p, area)).toBeLessThan(1000);
    // соседние точки внутри ячейки дают одинаковый результат
    expect(coarsenLocation(c.lat + 0.0001, c.lon + 0.0001, 'block')).toEqual(c);
  });
});

describe('schemas', () => {
  const profile = {
    nickname: 'Аня',
    avatar: { emoji: '🦊', color: '#ff8800' },
    interests: ['chat', 'coffee'],
    tags: [],
  };
  it('accepts a valid profile and rejects unknown interests', () => {
    expect(profileSchema.safeParse(profile).success).toBe(true);
    expect(profileSchema.safeParse({ ...profile, interests: ['nope'] }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, age: 16 }).success).toBe(false);
    expect(profileSchema.safeParse({ ...profile, interests: [] }).success).toBe(false);
  });
  it('validates client messages', () => {
    expect(clientMessageSchema.safeParse({ t: 'ping' }).success).toBe(true);
    expect(clientMessageSchema.safeParse({ t: 'unknown' }).success).toBe(false);
    expect(clientMessageSchema.safeParse({ t: 'location', lat: 100, lon: 0 }).success).toBe(false);
  });
});

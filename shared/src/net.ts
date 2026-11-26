// Определение «одной Wi‑Fi сети».
//
// Устройства в одной Wi‑Fi сети выходят в интернет через один и тот же роутер, поэтому
// сервер видит у них общий публичный адрес:
//   • IPv4 — один и тот же адрес (NAT роутера);
//   • IPv6 — у каждого устройства свой адрес, но общий префикс /64 сети;
//   • частные IPv4 (сервер стоит в той же локальной сети) — общая подсеть /24.
// Хэш SSID от клиента дополнительно разделяет разные сети за одним адресом
// (например, «Guest» и «Staff» в отеле).

export type NetworkKey = string;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4(ip: string): number[] | null {
  const m = IPV4_RE.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 10 ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b! >= 64 && b! <= 127) // CGNAT, встречается в локальных стендах
  );
}

/** Разворачивает IPv6 в 8 групп по 16 бит. null — если адрес некорректен. */
export function expandIpv6(ip: string): number[] | null {
  let s = ip.trim().toLowerCase();
  const zone = s.indexOf('%');
  if (zone >= 0) s = s.slice(0, zone);
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  if (!s.includes(':')) return null;

  // Встроенный IPv4 в конце (::ffff:1.2.3.4) → две 16-битные группы
  const lastColon = s.lastIndexOf(':');
  const maybeV4 = s.slice(lastColon + 1);
  if (maybeV4.includes('.')) {
    const v4 = parseIpv4(maybeV4);
    if (!v4) return null;
    const hi = ((v4[0]! << 8) | v4[1]!).toString(16);
    const lo = ((v4[2]! << 8) | v4[3]!).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const parseHalf = (h: string): number[] | null => {
    if (h === '') return [];
    const groups = h.split(':');
    const out: number[] = [];
    for (const g of groups) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseHalf(halves[0]!);
  const tail = halves.length === 2 ? parseHalf(halves[1]!) : [];
  if (!head || !tail) return null;
  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  return groups.length === 8 ? groups : null;
}

/**
 * Превращает IP клиента в ключ сети. Возвращает null, если адрес не распознан.
 *   203.0.113.7          → "4:203.0.113.7"
 *   192.168.1.23         → "4l:192.168.1.0/24"
 *   2001:db8:1:2::abcd   → "6:2001:db8:1:2::/64"
 *   ::ffff:203.0.113.7   → "4:203.0.113.7"
 */
export function networkKeyFromIp(rawIp: string): NetworkKey | null {
  const ip = rawIp.trim();
  const v4 = parseIpv4(ip);
  if (v4) {
    if (isPrivateIpv4(v4)) return `4l:${v4[0]}.${v4[1]}.${v4[2]}.0/24`;
    return `4:${v4.join('.')}`;
  }
  const g = expandIpv6(ip);
  if (!g) return null;
  // IPv4-mapped (::ffff:a.b.c.d)
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    const a = g[6]!;
    const b = g[7]!;
    return networkKeyFromIp(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
  }
  // loopback ::1
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return '6:::1/128';
  return `6:${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

/** Ключ сети, который удобно показать владельцу заведения. */
export function describeNetworkKey(key: NetworkKey): string {
  return key.replace(/^(4l?|6):/, '');
}

/** Принимает адрес или префикс в человекочитаемом виде (как вводит владелец заведения). */
export function networkKeyFromUserInput(input: string): NetworkKey | null {
  const s = input.trim();
  const m = /^(.+)\/(\d+)$/.exec(s);
  if (m) {
    const [, addr, bits] = m;
    if (bits === '24' && parseIpv4(addr!)) {
      const v4 = parseIpv4(addr!)!;
      return isPrivateIpv4(v4) ? `4l:${v4[0]}.${v4[1]}.${v4[2]}.0/24` : null;
    }
    if (bits === '64') return networkKeyFromIp(addr!);
    return null;
  }
  return networkKeyFromIp(s);
}

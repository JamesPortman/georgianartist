import { headers } from "next/headers";

/**
 * The client address Vercel reports for this request. Used as a rate-limit
 * key by the admin login (lib/rate-limit.ts) and the public forms
 * (lib/form-rate-limit.ts) — never stored raw.
 *
 * An IPv6 address is cut to its /64 network (rateLimitAddress): one home or
 * one cloud server is usually handed a whole /64, billions of addresses, so a
 * limit per full IPv6 address limited nothing (security review, October 2026).
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return rateLimitAddress(ip);
}

/** An IPv4 address as is; an IPv6 address as its /64 network ("2001:db8:0:1::/64"). */
export function rateLimitAddress(ip: string): string {
  if (!ip.includes(":")) return ip;
  const mapped = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mapped?.[1]) return mapped[1];
  const [head = "", tail] = ip.toLowerCase().split("%")[0]!.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? left : [...left, ...Array<string>(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return ip;
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

type Resolver = (hostname: string) => Promise<string[]>;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

const defaultResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

export async function assertPublicHttpUrl(value: string, resolver: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("A URL informada é inválida."); }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Somente URLs HTTP e HTTPS são permitidas.");
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname === "metadata.google.internal") throw new Error("O destino precisa ser público.");
  const addresses = isIP(hostname) ? [hostname] : await resolver(hostname);
  if (addresses.length === 0) throw new Error("Não foi possível resolver o domínio.");
  if (addresses.some(isPrivateAddress)) throw new Error("Endereços de rede privada não são permitidos.");
  return url;
}

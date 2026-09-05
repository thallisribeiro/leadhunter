import { describe, expect, test } from "vitest";
import { assertPublicHttpUrl } from "@/features/enrichment/url-safety";

describe("crawler URL safety", () => {
  test("rejects non-http protocols and local or private destinations", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(/http/i);
    await expect(assertPublicHttpUrl("http://localhost/admin")).rejects.toThrow(/público/i);
    await expect(assertPublicHttpUrl("http://internal.example", async () => ["10.2.3.4"])).rejects.toThrow(/privada/i);
    await expect(assertPublicHttpUrl("http://metadata.example", async () => ["169.254.169.254"])).rejects.toThrow(/privada/i);
  });

  test("accepts a public HTTP destination resolved by DNS", async () => {
    await expect(assertPublicHttpUrl("https://example.com/about", async () => ["93.184.216.34"])).resolves.toBeInstanceOf(URL);
  });
});

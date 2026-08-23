import { describe, it, expect, vi } from 'vitest';
import { executeHttpCall, buildUrl } from "../packages/runtime/backend-adapter.js";
import { ValidationError } from "../packages/runtime/engine.js";

describe("URL Construction", () => {
  it("appends query string correctly when base URL ALREADY has a query", async () => {
    // Mock global fetch
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("{}")
    });
    global.fetch = fetchMock as any;

    await executeHttpCall(
      "http://api.com", 
      { endpoint: { path: "/users?v=1", method: "GET" } },
      { id: "1" },
      null
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0];
    
    // Will fail if it produces http://api.com/users?v=1?id=1
    expect(calledUrl).toBe("http://api.com/users?v=1&id=1");
  });
});

describe("Path parameter traversal", () => {
  // encodeURIComponent escapes "/" and ":" but not "." -- so a "." or ".." path param
  // survives into the URL as a relative segment that fetch() resolves before sending,
  // silently retargeting the request at a different backend endpoint.
  it.each([".", ".."])("rejects the dot segment %j as a path parameter", (value) => {
    expect(() => buildUrl("http://api.com/v1", "/org/{org}/members", { org: value }))
      .toThrow(ValidationError);
  });

  it("rejects dot segments in any position, not just the first", () => {
    expect(() => buildUrl("http://api.com/v1", "/org/{org}/team/{team}", { org: "acme", team: ".." }))
      .toThrow(ValidationError);
  });

  it("leaves values that merely contain dots alone", () => {
    expect(buildUrl("http://api.com/v1", "/f/{name}", { name: "a..b" }).url)
      .toBe("http://api.com/v1/f/a..b");
    expect(buildUrl("http://api.com/v1", "/f/{name}", { name: "report.2026.pdf" }).url)
      .toBe("http://api.com/v1/f/report.2026.pdf");
  });

  it("still escapes separators so a param cannot add a segment or a host", () => {
    expect(buildUrl("http://api.com/v1", "/f/{name}", { name: "a/b" }).url)
      .toBe("http://api.com/v1/f/a%2Fb");
    expect(buildUrl("http://api.com/v1", "/f/{name}", { name: "http://evil.test" }).url)
      .toBe("http://api.com/v1/f/http%3A%2F%2Fevil.test");
  });
});

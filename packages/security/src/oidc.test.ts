import { createSign, generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { type AuthenticationError, OidcAccessTokenVerifier } from "./oidc.js";

const organization = "018f47ac-19fc-7c92-ae91-0242ac120002";
const workspace = "018f47ac-19fc-7c92-ae91-0242ac120004";
const subject = "018f47ac-19fc-7c92-ae91-0242ac120006";
const tenantClaim = "https://economyos.dev/tenant_id";
const workspaceClaim = "https://economyos.dev/workspaces";
const now = new Date("2026-01-01T00:00:00Z");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test-key", alg: "RS256", use: "sig" };

function token(
  overrides: Record<string, unknown> = {},
  headerOverrides: Record<string, unknown> = {},
  signingKey: KeyObject = privateKey,
): string {
  const headerValue = { alg: "RS256", kid: "test-key", typ: "at+jwt", ...headerOverrides };
  const header = Buffer.from(JSON.stringify(headerValue)).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://identity.economyos.test/",
      aud: "economyos-api",
      sub: "identity-provider|opaque-subject",
      iat: 1_767_225_600,
      exp: 1_767_229_200,
      scope: "openid evidence:read",
      "https://economyos.dev/subject_id": subject,
      [tenantClaim]: organization,
      [workspaceClaim]: [workspace],
      ...overrides,
    }),
  ).toString("base64url");
  const es256 = headerValue.alg === "ES256";
  const signer = createSign(es256 ? "SHA256" : "RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = signer
    .sign(es256 ? { key: signingKey, dsaEncoding: "ieee-p1363" } : signingKey)
    .toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const fakeFetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
const verifierConfig = {
  issuer: "https://identity.economyos.test/",
  audience: "economyos-api",
  subjectClaim: "https://economyos.dev/subject_id",
  tenantClaim,
  workspaceClaim,
  jwksUri: "https://identity.economyos.test/jwks.json",
};
const verifier = new OidcAccessTokenVerifier(verifierConfig, fakeFetch);

describe("OIDC access-token verifier", () => {
  it.each([
    { crit: ["tenant-policy"], "tenant-policy": "required" },
    { crit: [] },
    { crit: "tenant-policy" },
    { crit: null },
    { b64: false },
  ])("rejects unsupported critical or payload encoding headers: %j", async (header) => {
    let fetchCount = 0;
    const strictVerifier = new OidcAccessTokenVerifier(verifierConfig, async () => {
      fetchCount += 1;
      return fakeFetch();
    });
    await expect(strictVerifier.verify(token({}, header), now)).rejects.toMatchObject({
      code: "TOKEN_HEADER_EXTENSION_UNSUPPORTED",
    });
    expect(fetchCount).toBe(0);
  });

  it.each([undefined, "1"])(
    "cancels oversized JWKS streams despite content-length %s",
    async (contentLength) => {
      let cancelled = false;
      let pulled = 0;
      const body = new ReadableStream<Uint8Array>(
        {
          pull(controller) {
            pulled += 1;
            controller.enqueue(new Uint8Array(262_144));
            if (pulled === 12) controller.close();
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 },
      );
      const boundedVerifier = new OidcAccessTokenVerifier(
        verifierConfig,
        async () =>
          new Response(body, {
            headers: contentLength === undefined ? {} : { "content-length": contentLength },
          }),
      );
      await expect(boundedVerifier.verify(token(), now)).rejects.toMatchObject({
        code: "JWKS_INVALID",
      });
      expect(cancelled).toBe(true);
      expect(pulled).toBe(5);
    },
  );

  it("verifies signature, temporal claims, issuer, audience, and tenant context", async () => {
    const principal = await verifier.verify(token(), now);
    expect(principal.organizationId).toBe(organization);
    expect(principal.workspaceIds).toEqual([workspace]);
    expect(principal.scopes).toContain("evidence:read");
  });

  it("rejects expired and cross-audience tokens", async () => {
    await expect(verifier.verify(token({ exp: 1_700_000_000 }), now)).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    await expect(verifier.verify(token({ aud: "another-api" }), now)).rejects.toMatchObject({
      code: "TOKEN_AUDIENCE_INVALID",
    });
  });

  it("rejects modified signatures without disclosing details in the message", async () => {
    const segments = token().split(".");
    const signature = segments[2] ?? "";
    segments[2] = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    const altered = segments.join(".");
    await expect(verifier.verify(altered, now)).rejects.toEqual(
      expect.objectContaining<Partial<AuthenticationError>>({
        code: "TOKEN_SIGNATURE_INVALID",
        message: "Access token is invalid",
      }),
    );
  });

  it("enforces the configured maximum access-token lifetime", async () => {
    await expect(verifier.verify(token({ exp: 1_767_229_201 }), now)).rejects.toMatchObject({
      code: "TOKEN_LIFETIME_INVALID",
    });
    await expect(verifier.verify(token(), new Date(Number.NaN))).rejects.toMatchObject({
      code: "TOKEN_TIME_INVALID",
    });
  });

  it("coalesces concurrent JWKS refreshes", async () => {
    let fetchCount = 0;
    let releaseFetch: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    const concurrentVerifier = new OidcAccessTokenVerifier(verifierConfig, async () => {
      fetchCount += 1;
      await gate;
      return new Response(JSON.stringify({ keys: [jwk] }));
    });

    const checks = Array.from({ length: 12 }, () => concurrentVerifier.verify(token(), now));
    expect(fetchCount).toBe(1);
    releaseFetch?.();
    await expect(Promise.all(checks)).resolves.toHaveLength(12);
    expect(fetchCount).toBe(1);
  });

  it("throttles unknown keys, negatively caches them, and bounds that cache", async () => {
    let fetchCount = 0;
    const boundedVerifier = new OidcAccessTokenVerifier(
      { ...verifierConfig, maximumUnknownKids: 2 },
      async () => {
        fetchCount += 1;
        return new Response(JSON.stringify({ keys: [jwk] }));
      },
    );
    await boundedVerifier.verify(token(), now);

    for (const kid of ["missing-1", "missing-2", "missing-3"]) {
      await expect(boundedVerifier.verify(token({}, { kid }), now)).rejects.toMatchObject({
        code: "TOKEN_KEY_NOT_FOUND",
      });
    }
    expect(fetchCount).toBe(1);

    const afterCooldown = new Date(now.getTime() + 6_000);
    await expect(
      boundedVerifier.verify(token({}, { kid: "missing-2" }), afterCooldown),
    ).rejects.toMatchObject({ code: "TOKEN_KEY_NOT_FOUND" });
    expect(fetchCount).toBe(1);
    await expect(
      boundedVerifier.verify(token({}, { kid: "missing-1" }), afterCooldown),
    ).rejects.toMatchObject({ code: "TOKEN_KEY_NOT_FOUND" });
    expect(fetchCount).toBe(2);
  });

  it("retains still-valid verified keys across an opportunistic rotation refresh", async () => {
    const rotatedPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const rotatedJwk = {
      ...rotatedPair.publicKey.export({ format: "jwk" }),
      kid: "rotated-key",
      alg: "RS256",
      use: "sig",
    };
    let fetchCount = 0;
    const rotatingVerifier = new OidcAccessTokenVerifier(verifierConfig, async () => {
      fetchCount += 1;
      return new Response(JSON.stringify({ keys: [fetchCount === 1 ? jwk : rotatedJwk] }));
    });
    await rotatingVerifier.verify(token(), now);
    await expect(
      rotatingVerifier.verify(
        token({}, { kid: "force-rotation-refresh" }),
        new Date(now.getTime() + 6_000),
      ),
    ).rejects.toMatchObject({ code: "TOKEN_KEY_NOT_FOUND" });

    await expect(
      rotatingVerifier.verify(token(), new Date(now.getTime() + 7_000)),
    ).resolves.toMatchObject({ subjectId: subject });
    expect(fetchCount).toBe(2);
  });

  it("accepts only algorithm-compatible, verification-capable strong signing keys", async () => {
    const ecPair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const ecJwk = {
      ...ecPair.publicKey.export({ format: "jwk" }),
      kid: "ec-key",
      alg: "ES256",
      use: "sig",
      key_ops: ["verify"],
    };
    const ecVerifier = new OidcAccessTokenVerifier(
      verifierConfig,
      async () => new Response(JSON.stringify({ keys: [ecJwk] })),
    );
    await expect(
      ecVerifier.verify(token({}, { alg: "ES256", kid: "ec-key" }, ecPair.privateKey), now),
    ).resolves.toMatchObject({ organizationId: organization });

    const weakPair = generateKeyPairSync("rsa", { modulusLength: 1024 });
    const weakJwk = {
      ...weakPair.publicKey.export({ format: "jwk" }),
      kid: "weak-key",
      alg: "RS256",
      use: "sig",
      key_ops: ["verify"],
    };
    const weakVerifier = new OidcAccessTokenVerifier(
      verifierConfig,
      async () => new Response(JSON.stringify({ keys: [weakJwk] })),
    );
    await expect(
      weakVerifier.verify(token({}, { kid: "weak-key" }, weakPair.privateKey), now),
    ).rejects.toMatchObject({ code: "JWKS_INVALID" });

    const signingOnlyVerifier = new OidcAccessTokenVerifier(
      verifierConfig,
      async () => new Response(JSON.stringify({ keys: [{ ...jwk, key_ops: ["sign"] }] })),
    );
    await expect(signingOnlyVerifier.verify(token(), now)).rejects.toMatchObject({
      code: "JWKS_INVALID",
    });
  });
});

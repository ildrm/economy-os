import { createPublicKey, type KeyObject, verify as verifySignature } from "node:crypto";
import { organizationId, type Principal, subjectId, workspaceId } from "@economyos/contracts";

type JsonObject = Record<string, unknown>;
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type SupportedAlgorithm = "RS256" | "ES256";

const MAX_JWKS_BYTES = 1_048_576;
const MAX_JWKS_KEYS = 1_024;
const MAX_CACHED_KEYS = 2_048;
const VALID_KEY_OPERATIONS = new Set([
  "sign",
  "verify",
  "encrypt",
  "decrypt",
  "wrapKey",
  "unwrapKey",
  "deriveKey",
  "deriveBits",
]);

interface JwtHeader {
  readonly alg: SupportedAlgorithm;
  readonly kid: string;
  readonly typ?: string;
}

export interface OidcVerifierConfig {
  readonly issuer: string;
  readonly audience: string;
  readonly subjectClaim: string;
  readonly tenantClaim: string;
  readonly workspaceClaim?: string;
  readonly jwksUri: string;
  readonly clockToleranceSeconds?: number;
  readonly jwksTtlSeconds?: number;
  readonly maxTokenLifetimeSeconds?: number;
  readonly jwksRefreshCooldownSeconds?: number;
  readonly unknownKidTtlSeconds?: number;
  readonly maximumUnknownKids?: number;
}

type ResolvedVerifierConfig = OidcVerifierConfig &
  Required<
    Pick<
      OidcVerifierConfig,
      | "clockToleranceSeconds"
      | "jwksTtlSeconds"
      | "maxTokenLifetimeSeconds"
      | "jwksRefreshCooldownSeconds"
      | "unknownKidTtlSeconds"
      | "maximumUnknownKids"
    >
  >;

interface ValidatedJwk {
  readonly algorithm: SupportedAlgorithm;
  readonly kid: string;
  readonly key: KeyObject;
}

interface CachedKey {
  readonly expiresAt: number;
  readonly key: KeyObject;
}

export class AuthenticationError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Access token is invalid");
    this.name = "AuthenticationError";
    this.code = code;
  }
}

function decodeObject(segment: string): JsonObject {
  if (!segment || segment.length > 32_768 || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new AuthenticationError("TOKEN_MALFORMED");
  }
  try {
    const value: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as JsonObject;
  } catch {
    throw new AuthenticationError("TOKEN_MALFORMED");
  }
}

function parseHeader(value: JsonObject): JwtHeader {
  // No critical JOSE extensions are implemented. Never ignore a sender's
  // mandatory processing requirements or an alternate payload encoding.
  if (value.crit !== undefined || (value.b64 !== undefined && value.b64 !== true)) {
    throw new AuthenticationError("TOKEN_HEADER_EXTENSION_UNSUPPORTED");
  }
  if (
    (value.alg !== "RS256" && value.alg !== "ES256") ||
    typeof value.kid !== "string" ||
    value.kid.length === 0 ||
    value.kid.length > 256
  ) {
    throw new AuthenticationError("TOKEN_ALGORITHM_OR_KEY_INVALID");
  }
  if (value.typ !== undefined && value.typ !== "JWT" && value.typ !== "at+jwt") {
    throw new AuthenticationError("TOKEN_TYPE_INVALID");
  }
  return {
    alg: value.alg,
    kid: value.kid,
    ...(typeof value.typ === "string" ? { typ: value.typ } : {}),
  };
}

function cacheKey(algorithm: SupportedAlgorithm, kid: string): string {
  return `${algorithm}\u0000${kid}`;
}

function integerSetting(value: number, name: string, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} is invalid`);
  }
  return value;
}

function validateJwk(candidate: unknown): ValidatedJwk | undefined {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) {
    return undefined;
  }
  const value = candidate as JsonObject;
  if (typeof value.kid !== "string" || value.kid.length === 0 || value.kid.length > 256) {
    return undefined;
  }
  if (value.use !== undefined && value.use !== "sig") return undefined;
  if (value.key_ops !== undefined) {
    if (
      !Array.isArray(value.key_ops) ||
      !value.key_ops.includes("verify") ||
      !value.key_ops.every(
        (operation) => typeof operation === "string" && VALID_KEY_OPERATIONS.has(operation),
      )
    ) {
      return undefined;
    }
  }

  let algorithm: SupportedAlgorithm;
  if (value.kty === "RSA") {
    algorithm = "RS256";
    if (typeof value.n !== "string" || typeof value.e !== "string") return undefined;
  } else if (value.kty === "EC") {
    algorithm = "ES256";
    if (value.crv !== "P-256" || typeof value.x !== "string" || typeof value.y !== "string") {
      return undefined;
    }
  } else {
    return undefined;
  }
  if (value.alg !== undefined && value.alg !== algorithm) return undefined;

  try {
    const key = createPublicKey({ key: value as JsonWebKey, format: "jwk" });
    if (
      algorithm === "RS256" &&
      (key.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2_048)
    ) {
      return undefined;
    }
    if (
      algorithm === "ES256" &&
      (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1")
    ) {
      return undefined;
    }
    return { algorithm, kid: value.kid, key };
  } catch {
    return undefined;
  }
}

function decodeSignature(segment: string): Buffer {
  if (!segment || segment.length > 16_384 || !/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new AuthenticationError("TOKEN_MALFORMED");
  }
  const value = Buffer.from(segment, "base64url");
  if (value.toString("base64url") !== segment) throw new AuthenticationError("TOKEN_MALFORMED");
  return value;
}

function stringClaim(claims: JsonObject, name: string): string {
  const value = claims[name];
  if (typeof value !== "string" || value.length === 0)
    throw new AuthenticationError("TOKEN_CLAIM_INVALID");
  return value;
}

async function readJwksBody(response: Response): Promise<string> {
  if (!response.body) throw new AuthenticationError("JWKS_INVALID");
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (
    !Number.isSafeInteger(declaredLength) ||
    declaredLength < 0 ||
    declaredLength > MAX_JWKS_BYTES
  ) {
    await response.body.cancel().catch(() => undefined);
    throw new AuthenticationError("JWKS_INVALID");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_JWKS_BYTES) throw new AuthenticationError("JWKS_INVALID");
      chunks.push(value);
    }
    return Buffer.concat(chunks, length).toString("utf8");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof AuthenticationError) throw error;
    throw new AuthenticationError("JWKS_UNAVAILABLE");
  } finally {
    reader.releaseLock();
  }
}

export class OidcAccessTokenVerifier {
  readonly #config: ResolvedVerifierConfig;
  readonly #fetch: Fetch;
  #keys = new Map<string, CachedKey>();
  #documentExpiresAt = 0;
  #nextRefreshAllowedAt = 0;
  #lastRefreshFailure: string | undefined;
  #refreshPromise: Promise<void> | undefined;
  #unknownKids = new Map<string, number>();

  constructor(config: OidcVerifierConfig, fetchImplementation: Fetch = fetch) {
    const issuer = new URL(config.issuer);
    const jwks = new URL(config.jwksUri);
    if (issuer.protocol !== "https:" || jwks.protocol !== "https:") {
      throw new Error("OIDC issuer and JWKS URI must use HTTPS");
    }
    const clockToleranceSeconds = integerSetting(
      config.clockToleranceSeconds ?? 30,
      "OIDC clock tolerance",
      0,
      300,
    );
    const jwksTtlSeconds = integerSetting(config.jwksTtlSeconds ?? 300, "OIDC JWKS TTL", 1, 86_400);
    const maxTokenLifetimeSeconds = integerSetting(
      config.maxTokenLifetimeSeconds ?? 3_600,
      "OIDC maximum token lifetime",
      1,
      604_800,
    );
    const jwksRefreshCooldownSeconds = integerSetting(
      config.jwksRefreshCooldownSeconds ?? 5,
      "OIDC JWKS refresh cooldown",
      0,
      300,
    );
    const unknownKidTtlSeconds = integerSetting(
      config.unknownKidTtlSeconds ?? 30,
      "OIDC unknown key TTL",
      1,
      3_600,
    );
    const maximumUnknownKids = integerSetting(
      config.maximumUnknownKids ?? 256,
      "OIDC maximum unknown keys",
      1,
      4_096,
    );
    this.#config = {
      ...config,
      issuer: issuer.href,
      jwksUri: jwks.href,
      clockToleranceSeconds,
      jwksTtlSeconds,
      maxTokenLifetimeSeconds,
      jwksRefreshCooldownSeconds,
      unknownKidTtlSeconds,
      maximumUnknownKids,
    };
    this.#fetch = fetchImplementation;
  }

  async verify(token: string, now = new Date()): Promise<Principal> {
    const nowMs = now.getTime();
    if (!Number.isFinite(nowMs)) throw new AuthenticationError("TOKEN_TIME_INVALID");
    const segments = token.split(".");
    if (segments.length !== 3) throw new AuthenticationError("TOKEN_MALFORMED");
    const [encodedHeader = "", encodedClaims = "", encodedSignature = ""] = segments;
    const header = parseHeader(decodeObject(encodedHeader));
    const claims = decodeObject(encodedClaims);
    const key = await this.#getKey(header, nowMs);
    const signature = decodeSignature(encodedSignature);
    const options = header.alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" as const } : { key };
    const valid = verifySignature(
      header.alg === "RS256" ? "RSA-SHA256" : "SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      options,
      signature,
    );
    if (!valid) throw new AuthenticationError("TOKEN_SIGNATURE_INVALID");

    const nowSeconds = Math.floor(now.getTime() / 1000);
    const tolerance = this.#config.clockToleranceSeconds;
    const issuer = stringClaim(claims, "iss");
    stringClaim(claims, "sub");
    const internalSubject = stringClaim(claims, this.#config.subjectClaim);
    if (issuer !== this.#config.issuer) throw new AuthenticationError("TOKEN_ISSUER_INVALID");
    const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
    if (
      !Array.isArray(audiences) ||
      !audiences.every((audience) => typeof audience === "string") ||
      !audiences.includes(this.#config.audience)
    ) {
      throw new AuthenticationError("TOKEN_AUDIENCE_INVALID");
    }
    if (
      typeof claims.exp !== "number" ||
      !Number.isFinite(claims.exp) ||
      claims.exp <= nowSeconds - tolerance
    ) {
      throw new AuthenticationError("TOKEN_EXPIRED");
    }
    if (
      typeof claims.iat !== "number" ||
      !Number.isFinite(claims.iat) ||
      claims.iat > nowSeconds + tolerance
    ) {
      throw new AuthenticationError("TOKEN_ISSUED_AT_INVALID");
    }
    if (
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > this.#config.maxTokenLifetimeSeconds
    ) {
      throw new AuthenticationError("TOKEN_LIFETIME_INVALID");
    }
    if (claims.nbf !== undefined) {
      if (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf)) {
        throw new AuthenticationError("TOKEN_CLAIM_INVALID");
      }
      if (claims.nbf > nowSeconds + tolerance) {
        throw new AuthenticationError("TOKEN_NOT_ACTIVE");
      }
    }

    const organization = organizationId(stringClaim(claims, this.#config.tenantClaim));
    const workspaceValue = this.#config.workspaceClaim ? claims[this.#config.workspaceClaim] : [];
    if (
      !Array.isArray(workspaceValue) ||
      !workspaceValue.every((value) => typeof value === "string")
    ) {
      throw new AuthenticationError("TOKEN_WORKSPACE_CLAIM_INVALID");
    }
    const scopes =
      typeof claims.scope === "string" ? claims.scope.split(/\s+/).filter(Boolean) : [];
    return Object.freeze({
      subjectId: subjectId(internalSubject),
      organizationId: organization,
      workspaceIds: Object.freeze(workspaceValue.map((value) => workspaceId(value))),
      scopes: Object.freeze(scopes),
      authenticationMethod: "oidc",
      issuedAt: new Date(claims.iat * 1000).toISOString(),
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    });
  }

  async #getKey(header: JwtHeader, nowMs: number): Promise<KeyObject> {
    const id = cacheKey(header.alg, header.kid);
    const cached = this.#cachedKey(id, nowMs);
    if (cached) return cached;
    if (this.#isKnownMissing(id, nowMs)) {
      throw new AuthenticationError("TOKEN_KEY_NOT_FOUND");
    }

    const documentWasFresh = this.#documentExpiresAt > nowMs;
    const refreshed = await this.#refreshKeys(nowMs);
    if (!refreshed && !documentWasFresh && this.#documentExpiresAt <= nowMs) {
      throw new AuthenticationError("JWKS_UNAVAILABLE");
    }
    const selected = this.#cachedKey(id, nowMs);
    if (selected) return selected;
    this.#rememberMissing(id, nowMs);
    throw new AuthenticationError("TOKEN_KEY_NOT_FOUND");
  }

  #cachedKey(id: string, nowMs: number): KeyObject | undefined {
    const cached = this.#keys.get(id);
    if (!cached) return undefined;
    if (cached.expiresAt <= nowMs) {
      this.#keys.delete(id);
      return undefined;
    }
    return cached.key;
  }

  #isKnownMissing(id: string, nowMs: number): boolean {
    const expiresAt = this.#unknownKids.get(id);
    if (expiresAt === undefined) return false;
    if (expiresAt <= nowMs) {
      this.#unknownKids.delete(id);
      return false;
    }
    return true;
  }

  #rememberMissing(id: string, nowMs: number): void {
    for (const [candidate, expiresAt] of this.#unknownKids) {
      if (expiresAt <= nowMs) this.#unknownKids.delete(candidate);
    }
    this.#unknownKids.delete(id);
    while (this.#unknownKids.size >= this.#config.maximumUnknownKids) {
      const oldest = this.#unknownKids.keys().next().value;
      if (typeof oldest !== "string") break;
      this.#unknownKids.delete(oldest);
    }
    this.#unknownKids.set(id, nowMs + this.#config.unknownKidTtlSeconds * 1_000);
  }

  async #refreshKeys(nowMs: number): Promise<boolean> {
    if (this.#refreshPromise) {
      await this.#refreshPromise;
      return true;
    }
    if (nowMs < this.#nextRefreshAllowedAt) {
      if (this.#lastRefreshFailure) {
        throw new AuthenticationError(this.#lastRefreshFailure);
      }
      return false;
    }
    this.#nextRefreshAllowedAt = nowMs + this.#config.jwksRefreshCooldownSeconds * 1_000;
    const operation = this.#loadJwks(nowMs);
    this.#refreshPromise = operation;
    try {
      await operation;
      this.#lastRefreshFailure = undefined;
      return true;
    } catch (error) {
      this.#lastRefreshFailure =
        error instanceof AuthenticationError ? error.code : "JWKS_UNAVAILABLE";
      throw error;
    } finally {
      if (this.#refreshPromise === operation) this.#refreshPromise = undefined;
    }
  }

  async #loadJwks(nowMs: number): Promise<void> {
    let response: Response;
    try {
      response = await this.#fetch(this.#config.jwksUri, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AuthenticationError("JWKS_UNAVAILABLE");
    }
    if (!response.ok) throw new AuthenticationError("JWKS_UNAVAILABLE");
    const body = await readJwksBody(response);
    let document: unknown;
    try {
      document = JSON.parse(body);
    } catch {
      throw new AuthenticationError("JWKS_INVALID");
    }
    if (typeof document !== "object" || document === null || !("keys" in document)) {
      throw new AuthenticationError("JWKS_INVALID");
    }
    const keys = (document as { keys: unknown }).keys;
    if (!Array.isArray(keys) || keys.length > MAX_JWKS_KEYS) {
      throw new AuthenticationError("JWKS_INVALID");
    }
    const validated = new Map<string, KeyObject>();
    for (const candidate of keys) {
      const key = validateJwk(candidate);
      if (!key) continue;
      const id = cacheKey(key.algorithm, key.kid);
      if (validated.has(id)) throw new AuthenticationError("JWKS_INVALID");
      validated.set(id, key.key);
    }
    if (validated.size === 0) throw new AuthenticationError("JWKS_INVALID");

    const expiresAt = nowMs + this.#config.jwksTtlSeconds * 1000;
    const retained = new Map([...this.#keys].filter(([, cached]) => cached.expiresAt > nowMs));
    for (const [id, key] of validated) {
      retained.set(id, { expiresAt, key });
      this.#unknownKids.delete(id);
    }
    while (retained.size > MAX_CACHED_KEYS) {
      const oldest = retained.keys().next().value;
      if (typeof oldest !== "string") break;
      retained.delete(oldest);
    }
    this.#keys = retained;
    this.#documentExpiresAt = expiresAt;
  }
}

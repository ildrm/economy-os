import "reflect-metadata";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@economyos/config";
import { startTelemetry } from "@economyos/observability";
import { OidcAccessTokenVerifier, SECURITY_HEADERS } from "@economyos/security";
import { NestFactory, Reflector } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { AccessTokenGuard } from "./auth.js";
import { ProblemDetailsFilter } from "./problem.filter.js";
import { registerHttpTelemetry } from "./telemetry.js";

async function bootstrap(): Promise<void> {
  loadRootEnvironment();
  const config = loadConfig(process.env);
  const telemetry = startTelemetry({
    serviceName: "economyos-api",
    serviceVersion: "0.1.0",
    environment: config.environment,
    ...(config.telemetry.tracesEndpoint
      ? { otlpTracesEndpoint: config.telemetry.tracesEndpoint.href }
      : {}),
  });
  let app: NestFastifyApplication | undefined;
  try {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule.register(config.databaseUrl.href),
      new FastifyAdapter({
        bodyLimit: 1_048_576,
        trustProxy: false,
      }),
    );
    app.setGlobalPrefix("api/v1");
    const server = app.getHttpAdapter().getInstance();
    registerHttpTelemetry(server);
    server.addHook("onSend", (_request, reply, _payload, done) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        reply.header(name, value);
      }
      done();
    });
    const verifier = new OidcAccessTokenVerifier({
      issuer: config.oidc.issuer.href,
      audience: config.oidc.audience,
      subjectClaim: config.oidc.subjectClaim,
      tenantClaim: config.oidc.tenantClaim,
      workspaceClaim: config.oidc.workspaceClaim,
      jwksUri: config.oidc.jwksUri.href,
    });
    app.useGlobalGuards(new AccessTokenGuard(app.get(Reflector), verifier));
    app.useGlobalFilters(new ProblemDetailsFilter());

    if (config.environment !== "production") {
      const openApi = new DocumentBuilder()
        .setTitle("EconomyOS Product API")
        .setDescription(
          "Authenticated, tenant-isolated access to admitted causal-economic evidence.",
        )
        .setVersion("1.0")
        .addBearerAuth()
        .build();
      SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, openApi));
    }
    await app.listen(config.port, config.host);
  } catch (error) {
    if (app) await app.close().catch(() => undefined);
    await telemetry.shutdown().catch(() => undefined);
    throw error;
  }
  if (!app) throw new Error("API application startup invariant failed");
  const runningApp = app;

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    let shutdownFailed = false;
    try {
      await runningApp.close();
    } catch (error) {
      shutdownFailed = true;
      reportStartupOrShutdownError(error, `${signal} application shutdown`);
    }
    try {
      await telemetry.shutdown();
    } catch (error) {
      shutdownFailed = true;
      reportStartupOrShutdownError(error, `${signal} telemetry shutdown`);
    }
    if (shutdownFailed) process.exitCode = 1;
  };
  const onSignal = (signal: NodeJS.Signals) => {
    void shutdown(signal);
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
}

function loadRootEnvironment(): void {
  const rootEnvironment = fileURLToPath(new URL("../../../.env", import.meta.url));
  try {
    process.loadEnvFile(rootEnvironment);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

function isMissingFile(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === "ENOENT"
  );
}

function reportStartupOrShutdownError(error: unknown, operation: string): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`economyos-api ${operation} failed: ${message}\n`);
}

void bootstrap().catch((error: unknown) => {
  process.exitCode = 1;
  reportStartupOrShutdownError(error, "startup");
});

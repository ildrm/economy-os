import { computeMaterialBalance, simulatePlannerEnterprise } from "@economyos/allocation-planning";
import {
  detectBehavioralInterventions,
  quasiHyperbolicUtility,
  simulateBehavioralChoice,
} from "@economyos/behavioral-economics";
import { assertIsoInstant, type Principal, workspaceId } from "@economyos/contracts";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PostgresRuntime } from "./database.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { WorkspaceAccessService } from "./workspaces.js";

export interface ResearchCommand {
  readonly id: string;
  readonly workspaceId: string;
  readonly knownAt: string;
  readonly kind:
    | "behavioral_choice"
    | "material_balance"
    | "allocation_simulation"
    | "intervention_detection";
  readonly input: Readonly<Record<string, unknown>>;
}
export interface ResearchRead {
  readonly workspaceId: string;
  readonly knownAt: string;
  readonly systemAt: string;
}
export type ResearchEnvelope = Readonly<Record<string, unknown>>;

function record(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  return input as Record<string, unknown>;
}
function exactKeys(input: Record<string, unknown>, names: readonly string[]): void {
  if (
    Object.keys(input).length !== names.length ||
    Object.keys(input).some((key) => !names.includes(key))
  )
    throw invalid();
}
function instant(value: unknown, read = false): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/.test(value) ||
    (!read && /\.\d{4,}Z$/.test(value))
  )
    throw invalid();
  try {
    return assertIsoInstant(value, "research cutoff");
  } catch {
    throw invalid();
  }
}
function uuid(value: unknown): string {
  if (typeof value !== "string") throw invalid();
  try {
    return workspaceId(value);
  } catch {
    throw invalid();
  }
}
export function parseResearchCommand(value: unknown): ResearchCommand {
  const input = record(value);
  exactKeys(input, ["id", "workspaceId", "knownAt", "kind", "input"]);
  if (
    typeof input.kind !== "string" ||
    ![
      "behavioral_choice",
      "material_balance",
      "allocation_simulation",
      "intervention_detection",
    ].includes(input.kind)
  )
    throw invalid();
  const payload = record(input.input);
  try {
    if (JSON.stringify(payload).length > 100_000) throw invalid();
  } catch {
    throw invalid();
  }
  return {
    id: uuid(input.id),
    workspaceId: uuid(input.workspaceId),
    knownAt: instant(input.knownAt),
    kind: input.kind as ResearchCommand["kind"],
    input: payload,
  };
}
export function parseResearchRead(value: unknown): ResearchRead {
  const input = record(value);
  exactKeys(input, ["workspaceId", "knownAt", "systemAt"]);
  return {
    workspaceId: uuid(input.workspaceId),
    knownAt: instant(input.knownAt, true),
    systemAt: instant(input.systemAt, true),
  };
}

/** Transport adapter only: scientific computation remains in the domain packages. */
export function executeResearch(command: ResearchCommand): unknown {
  try {
    if (command.kind === "intervention_detection") {
      // This public-document research adapter does not establish restricted-source access.
      const document = record(command.input.document);
      if (document.classification !== "public" || document.exportPolicy === "deny") throw invalid();
      return detectBehavioralInterventions(
        command.input as unknown as Parameters<typeof detectBehavioralInterventions>[0],
      );
    }
    if (command.kind === "material_balance") {
      return computeMaterialBalance(
        command.input as unknown as Parameters<typeof computeMaterialBalance>[0],
      );
    }
    if (command.kind === "allocation_simulation") {
      return simulatePlannerEnterprise(
        command.input as unknown as Parameters<typeof simulatePlannerEnterprise>[0],
      );
    }
    const input = record(command.input);
    if (Object.hasOwn(input, "model")) {
      return simulateBehavioralChoice(
        input as unknown as Parameters<typeof simulateBehavioralChoice>[0],
      );
    }
    exactKeys(input, ["utilities", "beta", "delta", "assumption", "population", "periodUnit"]);
    if (
      !Array.isArray(input.utilities) ||
      input.utilities.length < 1 ||
      input.utilities.length > 1000 ||
      input.utilities.some((value) => typeof value !== "string")
    )
      throw invalid();
    if (typeof input.beta !== "string" || typeof input.delta !== "string") throw invalid();
    for (const field of ["assumption", "population", "periodUnit"] as const) {
      if (
        typeof input[field] !== "string" ||
        input[field].trim().length < 1 ||
        input[field].length > 2000
      )
        throw invalid();
    }
    const delta = input.delta;
    return {
      model: "quasi_hyperbolic_utility",
      modelVersion: "1",
      dataClass: "scenario",
      parameterSource: "scenario_assumption",
      population: input.population,
      periodUnit: input.periodUnit,
      assumption: input.assumption,
      utility: quasiHyperbolicUtility(input.utilities as string[], input.beta, input.delta),
      exponentialBenchmark: quasiHyperbolicUtility(input.utilities as string[], "1", input.delta),
      sensitivity: ["0", input.beta, "1"]
        .filter((value, index, all) => all.indexOf(value) === index)
        .map((beta) => ({
          beta,
          utility: quasiHyperbolicUtility(input.utilities as string[], beta, delta),
        })),
      interpretation:
        "Utilities are assumed equally spaced utility flows. This is not an estimated behavioral effect or policy recommendation.",
      numericalMethod: "IEEE754_kernel_decimal_output_12_places",
      numericalErrorBound: "not_estimated",
      modelUncertainty: "not_estimated",
    };
  } catch {
    throw invalid();
  }
}

@Injectable()
export class ResearchWorkbenchService {
  constructor(
    @Inject(PostgresRuntime) private readonly database: PostgresRuntime,
    @Inject(WorkspaceAccessService) private readonly access: WorkspaceAccessService,
    @Inject(GovernedAuthorizationService)
    private readonly authorization: GovernedAuthorizationService,
  ) {}

  async execute(principal: Principal, command: ResearchCommand): Promise<ResearchEnvelope> {
    try {
      return await this.database.withPrincipalMutation(principal, async (transaction) => {
        await this.access.assertMembership(principal, command.workspaceId, transaction);
        await this.authorization.assertResearchWorkspaceAccess(
          principal,
          command.workspaceId,
          "execute",
          transaction,
        );
        if (
          command.kind === "allocation_simulation" &&
          (command.input.tenantId !== `${principal.organizationId}/${command.workspaceId}` ||
            command.input.knowledgeCutoff !== command.knownAt)
        )
          throw invalid();
        if (command.kind === "intervention_detection" || Object.hasOwn(command.input, "model")) {
          const scope = record(command.input.scope);
          if (
            scope.organizationId !== principal.organizationId ||
            scope.workspaceId !== command.workspaceId ||
            command.input.knownAt !== command.knownAt
          )
            throw invalid();
        }
        const result = executeResearch(command);
        // Retain source snapshot/hash bindings, but never copy licensed raw text into responses.
        const savedInput =
          command.kind === "intervention_detection"
            ? Object.fromEntries(
                Object.entries(command.input).filter(([key]) => key !== "sourceText"),
              )
            : command.input;
        const saved = await transaction.query<{ envelope: ResearchEnvelope }>(
          "SELECT app.append_behavioral_allocation_research($1::uuid, $2::uuid, $3::text, $4::timestamptz, $5::jsonb, $6::jsonb) AS envelope",
          [
            command.workspaceId,
            command.id,
            command.kind,
            command.knownAt,
            JSON.stringify(savedInput),
            JSON.stringify(result),
          ],
        );
        if (!saved.rows[0]?.envelope) throw new Error("Research persistence invariant failed");
        return saved.rows[0].envelope;
      });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error ? error.code : null;
      if (code === "22023") throw invalid();
      if (code === "42501") throw new ForbiddenException({ code: "RESEARCH_ACCESS_DENIED" });
      if (code === "23514" || code === "23505" || code === "40001")
        throw new ConflictException({ code: "RESEARCH_REPLAY_CONFLICT" });
      throw error;
    }
  }

  async get(
    principal: Principal,
    requestedId: string,
    query: ResearchRead,
  ): Promise<ResearchEnvelope> {
    const id = uuid(requestedId);
    return this.database.withPrincipal(principal, async (transaction) => {
      await this.access.assertMembership(principal, query.workspaceId, transaction);
      await this.authorization.assertResearchWorkspaceAccess(
        principal,
        query.workspaceId,
        "read",
        transaction,
      );
      const result = await transaction.query<{ envelope: ResearchEnvelope | null }>(
        "SELECT app.get_behavioral_allocation_research($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz) AS envelope",
        [query.workspaceId, id, query.knownAt, query.systemAt],
      );
      const envelope = result.rows[0]?.envelope;
      if (!envelope) throw new NotFoundException({ code: "RESEARCH_NOT_FOUND" });
      return envelope;
    });
  }
}
function invalid(): BadRequestException {
  return new BadRequestException({ code: "RESEARCH_INPUT_INVALID" });
}

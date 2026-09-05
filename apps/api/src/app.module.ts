import type { DynamicModule } from "@nestjs/common";
import { Module } from "@nestjs/common";
import {
  CapitalCountryComparisonController,
  CapitalResearchAssessmentController,
} from "./capital-research.controller.js";
import { CapitalResearchService } from "./capital-research.js";
import {
  EvidenceController,
  HealthController,
  IdentityController,
  WorkspacesController,
} from "./controllers.js";
import {
  CrisisForecastController,
  CrisisForecastSlotController,
} from "./crisis-forecasts.controller.js";
import { CrisisForecastService } from "./crisis-forecasts.js";
import { createPostgresPool, DATABASE_POOL, PostgresRuntime } from "./database.js";
import { EconomicStateController } from "./economic-state.controller.js";
import { EconomicStateService } from "./economic-state.js";
import { EconomicStateDiscoveryController } from "./economic-state-discovery.controller.js";
import { EconomicStateDiscoveryService } from "./economic-state-discovery.js";
import { GovernedEvidenceService } from "./evidence.js";
import { GovernedAuthorizationService } from "./governed-authorization.js";
import { RelationshipGraphController } from "./relationship-graph.controller.js";
import { RelationshipGraphService } from "./relationship-graph.js";
import { ReleaseMonitoringController } from "./release-monitoring.controller.js";
import { ReleaseMonitoringService } from "./release-monitoring.js";
import {
  ReleaseNotificationsController,
  ReleaseSubscriptionController,
} from "./release-notifications.controller.js";
import { ReleaseNotificationService } from "./release-notifications.js";
import { ResearchWorkbenchController } from "./research-workbench.controller.js";
import { ResearchWorkbenchService } from "./research-workbench.js";
import {
  PostgresWorkspaceMembershipRepository,
  WORKSPACE_MEMBERSHIPS,
  WorkspaceAccessService,
} from "./workspaces.js";

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: Nest dynamic modules use a static registration API.
export class AppModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        ResearchWorkbenchController,
        IdentityController,
        WorkspacesController,
        EvidenceController,
        ReleaseMonitoringController,
        ReleaseSubscriptionController,
        ReleaseNotificationsController,
        EconomicStateController,
        EconomicStateDiscoveryController,
        RelationshipGraphController,
        CrisisForecastController,
        CrisisForecastSlotController,
        CapitalResearchAssessmentController,
        CapitalCountryComparisonController,
      ],
      providers: [
        {
          provide: DATABASE_POOL,
          useFactory: () => createPostgresPool(databaseUrl),
        },
        PostgresRuntime,
        ResearchWorkbenchService,
        PostgresWorkspaceMembershipRepository,
        {
          provide: WORKSPACE_MEMBERSHIPS,
          useExisting: PostgresWorkspaceMembershipRepository,
        },
        WorkspaceAccessService,
        GovernedAuthorizationService,
        GovernedEvidenceService,
        ReleaseMonitoringService,
        ReleaseNotificationService,
        EconomicStateService,
        EconomicStateDiscoveryService,
        RelationshipGraphService,
        CrisisForecastService,
        CapitalResearchService,
      ],
    };
  }
}

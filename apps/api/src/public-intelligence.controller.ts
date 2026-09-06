import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "./auth.js";
import { PublicIntelligenceService } from "./public-intelligence.js";

@Public()
@ApiTags("Public economic intelligence")
@Controller("public")
export class PublicIntelligenceController {
  constructor(
    @Inject(PublicIntelligenceService) private readonly intelligence: PublicIntelligenceService,
  ) {}

  @Get("catalog")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Published countries, metrics, questions and actual coverage" })
  catalog() {
    return this.intelligence.catalog();
  }

  @Get("countries/:country")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Dated annual measurements with source semantics and histories" })
  country(@Param("country") country: string) {
    return this.intelligence.country(country);
  }

  @Get("compare")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Compare two to four countries using up to eight metrics and common periods",
  })
  compare(@Query("countries") countries: unknown, @Query("metrics") metrics: unknown) {
    return this.intelligence.compare(countries, metrics);
  }

  @Get("behavioral/:country")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Published survey aggregates, subject to current source permissions" })
  behavioral(@Param("country") country: string, @Query("measure") measure: unknown) {
    return this.intelligence.behavioral(country, measure);
  }

  @Get("questions/:question")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Answer a supported analytical question with cited measurements" })
  question(@Param("question") question: string, @Query("country") country: unknown) {
    return this.intelligence.question(question, country);
  }

  @Post("scenarios")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Execute a bounded scenario with disclosed illustrative assumptions" })
  scenario(@Body() body: unknown) {
    return this.intelligence.scenario(body);
  }

  @Get("risk/:country")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Separate risk indicators and observed changes; unavailable forecasts remain explicit",
  })
  risk(@Param("country") country: string) {
    return this.intelligence.risk(country);
  }
}

import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Shared RFC 9457-compatible problem response documented by every controller. */
export class ProblemDetailsDto {
  @ApiProperty({ format: "uri" })
  type!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty({ minimum: 400, maximum: 599 })
  status!: number;

  @ApiProperty({ pattern: "^[A-Z][A-Z0-9_]+$" })
  code!: string;

  @ApiProperty()
  detail!: string;

  @ApiPropertyOptional()
  instance?: string;

  @ApiPropertyOptional({ pattern: "^(?!0{32})[0-9a-f]{32}$" })
  traceId?: string;
}

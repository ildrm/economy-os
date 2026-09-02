import type { Principal } from "@economyos/contracts";
import { AuthenticationError } from "@economyos/security";
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import type { AuthenticatedRequest } from "./http.js";

export const IS_PUBLIC = Symbol("economyos.public");
export const Public = () => SetMetadata(IS_PUBLIC, true);

export interface AccessTokenVerifier {
  verify(token: string): Promise<Principal>;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: AccessTokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || authorization.length <= 7) {
      throw new UnauthorizedException({ code: "AUTHENTICATION_REQUIRED" });
    }
    try {
      request.principal = await this.verifier.verify(authorization.slice(7));
      return true;
    } catch (error) {
      if (
        error instanceof AuthenticationError &&
        (error.code === "JWKS_UNAVAILABLE" || error.code === "JWKS_INVALID")
      ) {
        throw new ServiceUnavailableException({ code: "IDENTITY_PROVIDER_UNAVAILABLE" });
      }
      if (error instanceof AuthenticationError || error instanceof TypeError) {
        throw new UnauthorizedException({ code: "ACCESS_TOKEN_INVALID" });
      }
      throw error;
    }
  }
}

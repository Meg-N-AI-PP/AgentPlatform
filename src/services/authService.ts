import { dataverseService } from "./dataverseService";
import { HttpError } from "../utils/httpError";

class AuthService {
  /**
   * Validate an API key against the tenant.
   *
   * meg_agentkey has no active/expiry field yet, so a matching
   * record for the key + tenantId is sufficient for validation.
   */
  async validateApiKey(apiKey: string, tenantId: string): Promise<void> {
    const record = await dataverseService.validateApiKey(apiKey, tenantId);

    if (!record) {
      throw new HttpError(401, "Invalid API key for tenant.");
    }
  }
}

export const authService = new AuthService();

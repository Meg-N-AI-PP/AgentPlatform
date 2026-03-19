import { dataverseService } from "./dataverseService";
import { HttpError } from "../utils/httpError";

class AuthService {
  async validateApiKey(apiKey: string, tenantId: string): Promise<void> {
    const record = await dataverseService.validateApiKey(apiKey, tenantId);

    if (!record || !record.isActive) {
      throw new HttpError(401, "Invalid API key for tenant.");
    }
  }
}

export const authService = new AuthService();

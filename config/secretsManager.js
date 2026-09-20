import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

let client;

const getClient = () => {
  if (!client) {
    const region = process.env.AWS_REGION;
    if (!region) {
      throw new Error("Secrets Manager configuration is incomplete: AWS_REGION is required");
    }
    // Credentials intentionally come from the AWS SDK default provider chain.
    client = new SecretsManagerClient({ region });
  }
  return client;
};

const categoryForError = (error) => {
  if (error?.name === "AccessDeniedException") return "access-denied";
  if (error?.name === "ResourceNotFoundException") return "not-found";
  if (error?.name === "InvalidRequestException") return "invalid-request";
  if (error?.name === "InvalidParameterException") return "invalid-parameter";
  if (error?.name === "DecryptionFailure") return "decryption-failed";
  return "service-error";
};

export class SecretsManagerConfigError extends Error {
  constructor(message, { secretId, category = "configuration" } = {}) {
    super(message);
    this.name = "SecretsManagerConfigError";
    this.secretId = secretId;
    this.category = category;
  }
}

export const getJsonSecret = async (secretId) => {
  if (!secretId || typeof secretId !== "string") {
    throw new SecretsManagerConfigError(
      "Secrets Manager configuration is incomplete: a secret identifier is required",
    );
  }

  try {
    const response = await getClient().send(
      new GetSecretValueCommand({ SecretId: secretId, VersionStage: "AWSCURRENT" }),
    );

    let rawValue;
    if (typeof response.SecretString === "string") {
      rawValue = response.SecretString;
    } else if (response.SecretBinary !== undefined) {
      const binary = response.SecretBinary;
      const bytes = typeof binary === "string"
        ? Buffer.from(binary, "base64")
        : Buffer.from(binary);
      rawValue = bytes.toString("utf8");
    } else {
      throw new SecretsManagerConfigError(
        "Secrets Manager returned an empty secret",
        { secretId, category: "empty-secret" },
      );
    }

    try {
      return { value: JSON.parse(rawValue), versionId: response.VersionId };
    } catch {
      throw new SecretsManagerConfigError(
        "Secrets Manager returned malformed JSON",
        { secretId, category: "malformed-json" },
      );
    }
  } catch (error) {
    if (error instanceof SecretsManagerConfigError) throw error;
    const category = categoryForError(error);
    throw new SecretsManagerConfigError(
      `Secrets Manager request failed (${category}) for ${secretId}`,
      { secretId, category },
    );
  }
};

export const resetSecretsManagerClientForTests = () => {
  client = undefined;
};

export class FalProviderError extends Error {
  readonly errorType: string;
  readonly statusCode?: number;

  constructor(message: string, errorType = "unknown", statusCode?: number) {
    super(message);
    this.name = this.constructor.name;
    this.errorType = errorType;
    this.statusCode = statusCode;
  }
}

export class FalRateLimitError extends FalProviderError {
  constructor(message = "fal.ai rate limit exceeded") {
    super(message, "rate_limit", 429);
  }
}

export class FalTimeoutError extends FalProviderError {
  constructor(message = "fal.ai request timed out") {
    super(message, "timeout", 504);
  }
}

export class FalContentPolicyError extends FalProviderError {
  constructor(message = "fal.ai content policy rejected the request") {
    super(message, "content_policy", 400);
  }
}

export class FalWebhookSignatureError extends FalProviderError {
  constructor(message = "Invalid fal.ai webhook signature") {
    super(message, "webhook_signature", 401);
  }
}

export class FalUnknownError extends FalProviderError {
  constructor(message = "Unknown fal.ai provider error") {
    super(message, "unknown", 500);
  }
}

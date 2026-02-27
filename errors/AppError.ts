interface MetaErrorDetails {
  code?: number;
  subcode?: number;
  userTitle?: string;
  userMessage?: string;
  fbtrace_id?: string;
}

class AppError {
  public readonly message: string;

  public readonly statusCode: number;

  public readonly metaError?: MetaErrorDetails;

  constructor(message: string, statusCode = 400, metaError?: MetaErrorDetails) {
    this.message = message;
    this.statusCode = statusCode;
    this.metaError = metaError;
  }
}

export default AppError;

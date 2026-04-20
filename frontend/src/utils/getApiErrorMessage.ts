interface ApiErrorPayload {
  response?: {
    data?: {
      message?: string;
      error?: string;
      errors?: Array<{ message?: string } | string>;
    };
  };
  message?: string;
}

const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const apiError = error as ApiErrorPayload;
  const responseData = apiError?.response?.data;

  if (typeof responseData?.message === "string" && responseData.message.trim()) {
    return responseData.message;
  }

  if (typeof responseData?.error === "string" && responseData.error.trim()) {
    return responseData.error;
  }

  const firstNestedError = responseData?.errors?.[0];

  if (typeof firstNestedError === "string" && firstNestedError.trim()) {
    return firstNestedError;
  }

  if (
    firstNestedError &&
    typeof firstNestedError === "object" &&
    typeof firstNestedError.message === "string" &&
    firstNestedError.message.trim()
  ) {
    return firstNestedError.message;
  }

  if (typeof apiError?.message === "string" && apiError.message.trim()) {
    return apiError.message;
  }

  return fallback;
};

export default getApiErrorMessage;

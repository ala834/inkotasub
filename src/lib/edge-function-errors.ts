/**
 * Parse edge function response errors into user-friendly messages.
 * Used across all purchase/payment pages.
 */
export function parseEdgeFunctionError(
  error: any,
  data: any,
  fallbackMessage: string
): string {
  // Network-level errors
  if (error) {
    const msg = error.message || "";
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch")) {
      return "Network error. Please check your internet connection and try again.";
    }
    // Try to extract JSON error from FunctionsHttpError
    if (error.context?.body) {
      try {
        const body = typeof error.context.body === "string" ? JSON.parse(error.context.body) : error.context.body;
        if (body?.error) return mapErrorMessage(body.error, body);
      } catch {}
    }
    return msg || "Service unavailable. Please try again later.";
  }

  // Structured error from data
  if (data && !data.success) {
    const msg = data.error || data.message || fallbackMessage;
    return mapErrorMessage(msg, data);
  }

  return fallbackMessage;
}

function mapErrorMessage(msg: string, data?: any): string {
  if (msg.includes("Insufficient balance")) {
    return "Insufficient wallet balance. Please fund your wallet first.";
  }
  if (msg.includes("Invalid transaction PIN") || msg.includes("Invalid PIN") || msg.includes("Incorrect PIN")) {
    return data?.attemptsRemaining != null
      ? `Invalid PIN. ${data.attemptsRemaining} attempt(s) remaining.`
      : "Invalid PIN. Please try again.";
  }
  if (msg.includes("locked") || msg.includes("Locked")) {
    return "Account locked due to too many failed PIN attempts. Try again in 30 minutes.";
  }
  if (msg.includes("PIN required")) {
    return "Transaction PIN is required to complete this payment.";
  }
  if (msg.includes("Unauthorized")) {
    return "Session expired. Please log in again.";
  }
  if (msg.includes("Wallet not found")) {
    return "Wallet not found. Please contact support.";
  }
  if (msg.includes("Too many requests") || msg.includes("rate limit")) {
    return data?.retryAfter
      ? `Too many requests. Please wait ${data.retryAfter} seconds.`
      : "Too many requests. Please slow down and try again.";
  }
  if (msg.includes("Another transaction")) {
    return "A transaction is already being processed. Please wait a moment.";
  }
  if (/temporarily unavailable|service unavailable|provider (failed|error)|all providers/i.test(msg)) {
    return "Service temporarily unavailable, please try again.";
  }
  return msg;
}

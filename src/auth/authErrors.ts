const friendlyMessages: Readonly<Record<string, string>> = {
  AliasExistsException: "An account with this email already exists.",
  CodeMismatchException: "That verification code is incorrect.",
  ExpiredCodeException:
    "That verification code has expired. Request a new one.",
  InvalidPasswordException:
    "Use at least 8 characters with uppercase, lowercase, and a number.",
  LimitExceededException: "Too many attempts. Please wait and try again.",
  NotAuthorizedException: "The email or password is incorrect.",
  TooManyRequestsException: "Too many attempts. Please wait and try again.",
  UserNotConfirmedException: "Verify your email before signing in.",
  UsernameExistsException: "An account with this email already exists.",
  UserNotFoundException: "No account was found for this email.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return friendlyMessages[error.name] ?? error.message;
  }
  return "Something went wrong. Please try again.";
}

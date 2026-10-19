import { HttpStatus } from '@nestjs/common';

/**
 * Business-rule violations, each with a stable code. Messages are for developers; the web app
 * shows a translated text based on the code (ADR-0008).
 */
export const ERROR_STATUS = {
  FORBIDDEN: HttpStatus.FORBIDDEN,
  INVALID_TRANSITION: HttpStatus.CONFLICT,
  EDIT_LOCKED: HttpStatus.CONFLICT,
  ALREADY_PUBLISHED: HttpStatus.CONFLICT,
  DELETE_BLOCKED: HttpStatus.CONFLICT,
  CANNOT_RECATEGORIZE: HttpStatus.CONFLICT,
  JUSTIFICATION_REQUIRED: HttpStatus.BAD_REQUEST,
  INVALID_ORIGINAL_IDEA: HttpStatus.BAD_REQUEST,
  INVALID_FIELDS: HttpStatus.BAD_REQUEST,
  CATEGORY_UNAVAILABLE: HttpStatus.BAD_REQUEST,
  SAME_CATEGORY: HttpStatus.BAD_REQUEST,
  CATEGORY_NAME_TAKEN: HttpStatus.CONFLICT,
  CATEGORY_IN_USE: HttpStatus.CONFLICT,
  INACTIVE_REVIEWERS: HttpStatus.BAD_REQUEST,
  FIELD_OPTIONS_REQUIRED: HttpStatus.BAD_REQUEST,
  FIELD_OPTIONS_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  FIELD_DETECTION_TEXT_ONLY: HttpStatus.BAD_REQUEST,
  FIELD_IN_USE: HttpStatus.CONFLICT,
  FIELD_ORDER_INCOMPLETE: HttpStatus.BAD_REQUEST,
  EMAIL_TAKEN: HttpStatus.CONFLICT,
  LIKE_UNAVAILABLE: HttpStatus.CONFLICT,
  COMMENT_UNAVAILABLE: HttpStatus.CONFLICT,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  PASSWORD_CHANGE_REQUIRED: HttpStatus.FORBIDDEN,
  EMERGENCY_PASSWORD_FROM_ENV: HttpStatus.BAD_REQUEST,
  NO_LOCAL_PASSWORD: HttpStatus.BAD_REQUEST,
  WRONG_CURRENT_PASSWORD: HttpStatus.BAD_REQUEST,
  SAME_PASSWORD: HttpStatus.BAD_REQUEST,
  IMAGE_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  FILE_REQUIRED: HttpStatus.BAD_REQUEST,
  ATTACHMENT_TYPE_NOT_ALLOWED: HttpStatus.BAD_REQUEST,
  ATTACHMENT_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  TOO_MANY_ATTACHMENTS: HttpStatus.CONFLICT,
} as const satisfies Record<string, HttpStatus>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

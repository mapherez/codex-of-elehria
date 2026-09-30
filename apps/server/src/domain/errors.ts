import type { ErrorCode, Values } from '../../../../packages/i18n';
import type { PageRecord } from '../../../../packages/contracts';

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status = 400,
    readonly params: Values = {},
    readonly details: { current?: PageRecord; committed?: boolean } = {}
  ) { super(code); }
}

export function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

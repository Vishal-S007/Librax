import type { Resolver } from 'react-hook-form';
import type { ZodType, ZodTypeDef } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

/**
 * Typed bridge between a Zod schema and React Hook Form.
 * The form edits the schema's *input* type (e.g. authors as a "A; B" string) and,
 * after validation, receives the parsed *output* type (authors as string[]).
 * zodResolver already returns parsed output at runtime; this only states that in the types,
 * which differ between @hookform/resolvers releases.
 */
export function zodFormResolver<Input extends Record<string, unknown>, Output extends Record<string, unknown>>(
  schema: ZodType<Output, ZodTypeDef, Input>,
): Resolver<Input, unknown, Output> {
  return zodResolver(schema) as unknown as Resolver<Input, unknown, Output>;
}

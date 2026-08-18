import { z } from "zod";

/**
 * z.string().uuid() exige variante RFC4122 estrita (13º dígito em 8/9/a/b) —
 * os ids fixos do seed (ex.: 11111111-1111-1111-1111-111111111111) não
 * passam nisso mesmo sendo ids válidos no Postgres. Valida só o formato
 * 8-4-4-4-12 em hex, que é o que realmente importa aqui.
 */
export const uuidLike = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "ID inválido.");

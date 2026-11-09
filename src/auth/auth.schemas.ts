import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .email()
    .transform((email) => email.toLowerCase())
    .meta({ example: 'admin@example.com' }),
  password: z.string().min(1).meta({ example: 'secreta123' }),
});
export type LoginDto = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1)
    .meta({ description: 'El refreshToken recibido en login o en el último refresh' }),
});
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;

/** Reglas de contraseña al crear o cambiar una. */
export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .meta({ description: 'Entre 8 y 128 caracteres', example: 'secreta123' });

import { z } from "zod";

export const rateLimitsSchema = z.object({
  daily_connection_requests: z.number().int().min(1).max(100),
  daily_messages: z.number().int().min(1).max(100),
  weekly_connection_cap: z.number().int().min(1).max(500),
  min_delay_seconds: z.number().int().min(5).max(600),
  max_delay_seconds: z.number().int().min(10).max(1200),
});

export const workingHoursSchema = z.object({
  working_hours_start: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
  working_hours_end: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format"),
  timezone: z.string().min(1, "Timezone is required"),
  pause_weekends: z.boolean(),
});

export const aiSettingsSchema = z.object({
  model: z.string().min(1, "Model is required"),
  temperature: z.number().min(0).max(2),
  max_tokens: z.number().int().min(100).max(8000),
});

export const connectionStrategySchema = z.object({
  wait_after_acceptance_hours: z.number().int().min(1).max(168),
  include_note_with_request: z.boolean(),
  max_follow_ups: z.number().int().min(0).max(10),
  follow_up_delay_days: z.number().int().min(1).max(30),
});

export type RateLimitsForm = z.infer<typeof rateLimitsSchema>;
export type WorkingHoursForm = z.infer<typeof workingHoursSchema>;
export type AISettingsForm = z.infer<typeof aiSettingsSchema>;
export type ConnectionStrategyForm = z.infer<typeof connectionStrategySchema>;

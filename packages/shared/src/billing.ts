import type { CreditOperation, PlanLimits } from './index.js';

export const PLAN_LIMITS: Record<'FREE' | 'PRO', PlanLimits> = {
  FREE: {
    projects: 3,
    imageGenerationsMonthly: 10,
    videoGenerationsMonthly: 3,
    ttsMinutesMonthly: 30,
    maxResolution: '720p',
    watermark: true,
    creditsMonthly: 200,
  },
  PRO: {
    projects: 100,
    imageGenerationsMonthly: 500,
    videoGenerationsMonthly: 100,
    ttsMinutesMonthly: 600,
    maxResolution: '1080p',
    watermark: false,
    creditsMonthly: 10_000,
  },
};

export const CREDIT_COSTS: Record<CreditOperation, number> = {
  TEXT: 2,
  IMAGE: 8,
  VIDEO: 30,
  TTS: 3,
  TRANSLATION: 2,
  UPSCALE: 12,
  RENDER: 5,
};

export const SUPPORTED_LANGUAGES = [
  'Vietnamese', 'English', 'Chinese', 'Japanese', 'Korean', 'Spanish', 'French',
  'German', 'Portuguese', 'Thai', 'Indonesian', 'Hindi', 'Arabic',
] as const;

function configuredInteger(env: Record<string, string | undefined>, key: string, fallback: number, minimum = 0): number {
  const value = env[key];
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.floor(parsed)) : fallback;
}

export function planLimits(plan: 'FREE' | 'PRO', env: Record<string, string | undefined> = process.env): PlanLimits {
  const base = PLAN_LIMITS[plan];
  return {
    ...base,
    projects: configuredInteger(env, `PLAN_${plan}_PROJECTS`, base.projects),
    imageGenerationsMonthly: configuredInteger(env, `PLAN_${plan}_IMAGES_MONTHLY`, base.imageGenerationsMonthly),
    videoGenerationsMonthly: configuredInteger(env, `PLAN_${plan}_VIDEOS_MONTHLY`, base.videoGenerationsMonthly),
    ttsMinutesMonthly: configuredInteger(env, `PLAN_${plan}_TTS_MINUTES_MONTHLY`, base.ttsMinutesMonthly),
    creditsMonthly: configuredInteger(env, `PLAN_${plan}_CREDITS_MONTHLY`, base.creditsMonthly),
    maxResolution: ['720p', '1080p', '4k'].includes(env[`PLAN_${plan}_MAX_RESOLUTION`] ?? '') ? env[`PLAN_${plan}_MAX_RESOLUTION`] as PlanLimits['maxResolution'] : base.maxResolution,
    watermark: env[`PLAN_${plan}_WATERMARK`] ? env[`PLAN_${plan}_WATERMARK`] === 'true' : base.watermark,
  };
}

export function creditCosts(env: Record<string, string | undefined> = process.env): Record<CreditOperation, number> {
  return Object.fromEntries(Object.entries(CREDIT_COSTS).map(([operation, cost]) => [
    operation,
    configuredInteger(env, `CREDIT_COST_${operation}`, cost),
  ])) as Record<CreditOperation, number>;
}
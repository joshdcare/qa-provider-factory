export type Platform = 'web' | 'mobile';

export const WEB_STEPS = [
  'at-get-started',
  'at-soft-intro-combined',
  'at-vertical-selection',
  'at-location',
  'at-preferences',
  'at-family-count',
  'at-account-creation',
  'at-family-connection',
  'at-safety-screening',
  'at-subscriptions',
  'at-basic-payment',
  'at-premium-payment',
  'at-app-download',
] as const;

export const MOBILE_STEPS = [
  'account-created',
  'at-build-profile',
  'at-availability',
  'profile-complete',
  'upgraded',
  'at-disclosure',
  'fully-enrolled',
] as const;

export const ALL_STEPS = [
  ...new Set([...WEB_STEPS, ...MOBILE_STEPS]),
] as const;

export type Step = (typeof WEB_STEPS)[number] | (typeof MOBILE_STEPS)[number];

export type Tier = 'basic' | 'premium';

export type Vertical = 'childcare' | 'seniorcare' | 'petcare' | 'housekeeping' | 'tutoring';

export interface CliOptions {
  step: Step;
  tier: Tier;
  vertical: Vertical;
  env: string;
  platform: Platform;
  autoClose: boolean;
}

export interface EnvConfig {
  baseUrl: string;
  apiKey: string;
  stripeKey: string;
  sterlingCallbackUrl: string;
  db: {
    host: string;
    user: string;
    password: string;
    database: string;
  };
}

export interface ProviderContext {
  email: string;
  password: string;
  memberId: string;
  uuid?: string;
  authToken: string;
  accessToken?: string;
  tier: Tier;
  vertical: string;
  _eligibilityResponse?: any;
}

export interface ProviderResult {
  email: string;
  password: string;
  memberId: string;
  uuid: string;
  vertical: string;
}

export const ENV_CONFIGS: Record<string, EnvConfig> = {
  dev: {
    baseUrl: 'https://www.dev.carezen.net',
    apiKey: process.env.CZEN_API_KEY ?? '',
    stripeKey: process.env.STRIPE_KEY ?? '',
    sterlingCallbackUrl:
      'https://safety-background-check.useast1.dev.omni.carezen.net',
    db: {
      host: 'dev-czendb-ro.use.dom.carezen.net',
      user: 'readOnly',
      password: process.env.MYSQL_DB_PASS_DEV ?? '',
      database: 'czen',
    },
  },
};

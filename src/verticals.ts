import type { Vertical } from './types.js';

export interface VerticalConfig {
  serviceId: string;
  subServiceId: string;
  webTilePattern: RegExp;
  webTestIdToken: string;
}

export const VERTICAL_REGISTRY: Record<Vertical, VerticalConfig> = {
  childcare: {
    serviceId: 'CHILDCARE',
    subServiceId: 'babysitter',
    webTilePattern: /child\s*care/i,
    webTestIdToken: 'childcare',
  },
  seniorcare: {
    serviceId: 'SENIRCARE',
    subServiceId: 'babysitter',
    webTilePattern: /senior\s*care/i,
    webTestIdToken: 'seniorcare',
  },
  petcare: {
    serviceId: 'PETCAREXX',
    subServiceId: 'babysitter',
    webTilePattern: /pet\s*care/i,
    webTestIdToken: 'petcare',
  },
  housekeeping: {
    serviceId: 'HOUSEKEEP',
    subServiceId: 'babysitter',
    webTilePattern: /house\s*keep/i,
    webTestIdToken: 'housekeeping',
  },
  tutoring: {
    serviceId: 'TUTORINGX',
    subServiceId: 'babysitter',
    webTilePattern: /tutor/i,
    webTestIdToken: 'tutoring',
  },
};

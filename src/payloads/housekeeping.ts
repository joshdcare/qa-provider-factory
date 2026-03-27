export const providerCreateDefaults = {
  serviceType: 'HOUSEKEEPING',
  zipcode: '72204',
  firstName: 'Martina',
  lastName: 'Goodram',
  gender: 'FEMALE',
  howDidYouHearAboutUs: 'OTHER',
  referrerCookie: '',
};

export const providerNameUpdateInput = {
  firstName: 'Martina',
  lastName: 'Goodram',
};

export const saveMultipleVerticalsInput = {
  serviceIds: ['CHILDCARE', 'PETCAREXX', 'SENIRCARE', 'TUTORINGX'],
  test: 'mv_PTA',
  testVariance: 'mv_unlimited_PTA',
};

export const caregiverAttributesUpdateInput = {
  caregiver: {
    yearsOfExperience: 3,
  },
  serviceType: 'HOUSEKEEPING',
};

export const providerJobInterestUpdateInput = {
  source: 'ENROLLMENT',
  serviceType: 'HOUSEKEEPING',
  recurringJobInterest: {
    jobRate: {
      maximum: { amount: '21', currencyCode: 'USD' },
      minimum: { amount: '14', currencyCode: 'USD' },
    },
  },
};

export const universalProviderAttributesUpdateInput = {
  education: 'SOME_COLLEGE',
  languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
  qualities: ['COMFORTABLE_WITH_PETS', 'OWN_TRANSPORTATION'],
  vaccinated: true,
};

export const providerUniversalAvailabilityInput = {
  daysOfWeek: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'],
  timesOfDay: ['MORNINGS', 'AFTERNOONS'],
};

export const providerBiographyInput = {
  experienceSummary:
    'I have 3 years of experience in housekeeping. I am thorough, reliable, and take pride in keeping homes clean, organized, and welcoming.',
  serviceType: 'HOUSEKEEPING',
  title:
    'I have 3 years of experience in housekeeping. Thorough, reliable, and focused on a spotless, organized home.',
};

export const caregiverAttributesSecondUpdateInput = {
  caregiver: {
    comfortableWithPets: true,
    covidVaccinated: true,
    education: 'SOME_HIGH_SCHOOL',
    languages: ['ENGLISH', 'FRENCH', 'SPANISH'],
    ownTransportation: true,
    smokes: true,
    yearsOfExperience: 3,
  },
  housekeeping: {
    vacuuming: true,
    laundry: true,
    dishes: true,
    organizing: true,
    windowCleaning: true,
    deepCleaning: true,
    bathroomCleaning: true,
    kitchenCleaning: true,
    mopping: true,
    dusting: true,
  },
  serviceType: 'HOUSEKEEPING',
};

export const notificationSettingCreateInput = {
  domain: 'PROVIDER_SCREENING',
  phoneNumber: '+12001004000',
  type: 'SMS',
};

export const pricingConfig = {
  premium: {
    pricingSchemeId: 'PRO_FEAT_FEB2512',
    pricingPlanId: 'PRO_FEAT_FEB2512001',
    promoCode: '',
  },
  basic: {
    pricingSchemeId: 'PRO_PB_FEB2512',
    pricingPlanId: 'PRO_PB_FEB2512001',
    promoCode: '',
  },
};

export const p2pStripeAccountInput = {
  firstName: 'Martina',
  lastName: 'Goodram',
  addressLine1: '28965 Homewood Plaza',
  dateOfBirth: '1995-07-26',
  lastFourSSN: '9347',
  city: 'Little Rock',
  state: 'AR',
  zip: '72204',
};

export const legalInfoInput = {
  gender: 'F',
  dateOfBirth: '07/26/1995',
  screenName: 'Name',
  firstName: 'Martina',
  middleName: '',
  lastName: 'Goodram',
};

export const legalAddressInput = {
  addressLine1: '28965 Homewood Plaza',
  addressLine2: '',
  screenName: 'Address',
  zip: '72204',
  city: 'Little Rock',
  state: 'AR',
};

export const ssnInput = {
  ssn: '490959347',
  ssnInfoAccepted: true,
};

export const mobilePreferencesInput = {
  pageId: 'PREFERENCES',
  milesWillingToTravel: '10',
  ownTransportation: 'true',
  'attr-sitter.smokes': 'false',
  acceptsCreditCard: 'true',
  availability: 'FULL_TIME',
  hourlyRate: '10,25',
  'attr-sitter.covid.vaccine.status': 'true',
};

export const mobileSkillsInput = {
  pageId: 'SKILLS',
  yearsOfExperience: '5',
  'attr-sitter.languagesSpoken': 'LANGUAGES020',
  educationLevel: 'GRADUATE',
};

export const mobileBioInput = {
  experienceSummary:
    'I have 3 years of experience in housekeeping. I am thorough, reliable, and take pride in keeping homes clean, organized, and welcoming.',
};

export const availabilityNotes = 'Available for housekeeping work';

export const providerCreateDefaults = {
  serviceType: 'CHILD_CARE',
  zipcode: '72204',
  howDidYouHearAboutUs: 'OTHER',
  referrerCookie: '',
};

export const providerNameUpdateInput = {
  firstName: 'Martina',
  lastName: 'Goodram',
};

export const saveMultipleVerticalsInput = {
  serviceIds: ['PETCAREXX', 'HOUSEKEEP', 'SENIRCARE', 'TUTORINGX'],
  test: 'mv_PTA',
  testVariance: 'mv_unlimited_PTA',
};

export const caregiverAttributesUpdateInput = {
  childcare: {
    ageGroups: ['NEWBORN', 'EARLY_SCHOOL', 'TODDLER', 'ELEMENTARY_SCHOOL'],
    numberOfChildren: 2,
  },
  serviceType: 'CHILD_CARE',
};

export const providerJobInterestUpdateInput = {
  source: 'ENROLLMENT',
  serviceType: 'CHILD_CARE',
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
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
  serviceType: 'CHILD_CARE',
  title:
    'I have 3 year of experience. I can help with caregiver. I have some other experience as well.',
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
  childcare: {
    ageGroups: null,
    careForSickChild: false,
    carpooling: true,
    certifiedNursingAssistant: false,
    certifiedRegistedNurse: false,
    certifiedTeacher: true,
    childDevelopmentAssociate: false,
    cprTrained: true,
    craftAssistance: false,
    doula: false,
    earlyChildDevelopmentCoursework: true,
    earlyChildhoodEducation: false,
    errands: true,
    expSpecialNeedsChildren: false,
    experienceWithTwins: false,
    firstAidTraining: true,
    groceryShopping: true,
    laundryAssistance: true,
    lightHousekeeping: true,
    mealPreparation: true,
    nafccCertified: false,
    trustlineCertifiedCalifornia: false,
    travel: true,
    swimmingSupervision: true,
    remoteLearningAssistance: false,
    numberOfChildren: 1,
  },
  serviceType: 'CHILD_CARE',
};

export const notificationSettingCreateInput = {
  domain: 'PROVIDER_SCREENING',
  phoneNumber: '+12001004000',
  type: 'SMS',
};

export const pricingConfig = {
  premium: {
    pricingSchemeId: 'JUN231',
    pricingPlanId: 'JUN231001',
    promoCode: 'SYSTEM$4DISCOUNT',
  },
  basic: {
    pricingSchemeId: 'PROVIDER_PAID_BASIC3',
    pricingPlanId: 'PROVIDER_PAID_BASIC3_001',
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

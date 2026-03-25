export const PROVIDER_CREATE = `
  mutation providerCreate($submitValues: ProviderCreateInput!) {
    providerCreate(input: $submitValues) {
      ... on ProviderCreateSuccess {
        memberId
        oneTimeToken
        authToken
      }
      ... on ProviderCreateError {
        errors {
          message
        }
      }
    }
  }
`;

export const PROVIDER_NAME_UPDATE = `
  mutation providerNameUpdate($input: ProviderNameUpdateInput!) {
    providerNameUpdate(input: $input) {
      __typename
      ... on ProviderNameUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const SAVE_MULTIPLE_VERTICAL = `
  mutation SaveMultipleVerticals($input: MultipleVerticalsInput) {
    saveMultipleVerticals(input: $input) {
      ... on MultipleVerticalsUpdateSuccess {
        success
        __typename
      }
      ... on MultipleVerticalsUpdateError {
        message
        __typename
      }
      __typename
    }
  }
`;

export const CAREGIVER_ATTRIBUTES_UPDATE = `
  mutation caregiverAttributesUpdate($input: CaregiverAttributesUpdateInput!) {
    caregiverAttributesUpdate(input: $input) {
      __typename
      ... on CaregiverAttributesUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const PROVIDER_JOB_INTEREST_UPDATE = `
  mutation providerJobInterestUpdate($input: ProviderJobInterestUpdateInput!) {
    providerJobInterestUpdate(input: $input) {
      __typename
      ... on ProviderJobInterestUpdateSuccess {
        dummy
        __typename
      }
    }
  }
`;

export const UNIVERSAL_PROVIDER_ATTRIBUTES_UPDATE = `
  mutation UniversalProviderAttributesUpdate($input: UniversalProviderAttributesUpdateInput!) {
    universalProviderAttributesUpdate(input: $input) {
      ... on UniversalProviderAttributesUpdateSuccess {
        success
      }
    }
  }
`;

export const SET_PROVIDER_UNIVERSAL_AVAILABILITY = `
  mutation SetProviderUniversalAvailability($input: ProviderUniversalAvailabilityInput!) {
    setProviderUniversalAvailability(input: $input) {
      ... on SetProviderAvailabilitySuccess {
        success
      }
      ... on SetProviderUniversalAvailabilityError {
        error
      }
    }
  }
`;

export const CAREGIVER_SERVICE_BIOGRAPHY_UPDATE = `
  mutation CaregiverServiceBiographyUpdate($input: CaregiverServiceBiographyUpdateInput!) {
    caregiverServiceBiographyUpdate(input: $input) {
      ... on CaregiverServiceBiographyUpdateSuccess {
        success
      }
      ... on CaregiverServiceBiographyUpdateResultError {
        errors {
          message
        }
      }
    }
  }
`;

export const GET_PAYMENT_METHODS_INFORMATION = `
  query PaymentMethodsInformation {
    paymentMethodsInformationGet {
      ... on PaymentMethodsInformation {
        braintreeClientToken
        paymentMethods {
          default
          details {
            ... on StripePaymentMethodCreditCard {
              billingZIP
              cardType
              expirationMonth
              expirationYear
              familyName
              givenName
              id
              lastFourDigits
              walletType
            }
          }
          externalID
          id
          provider
          status
          type
        }
        stripeCustomerId
      }
    }
  }
`;

export const UPGRADE_PROVIDER_SUBSCRIPTION = `
  mutation paymentProviderSubscriptionUpgrade($input: PaymentProviderSubscriptionUpgradeInput!) {
    paymentProviderSubscriptionUpgrade(input: $input) {
      __typename
      ... on PaymentProviderSubscriptionUpgradeSuccessResponse {
        upgrade {
          status
          __typename
        }
        __typename
      }
      ... on PaymentProviderSubscriptionUpgradeErrorResponse {
        errors {
          message
          __typename
        }
        __typename
      }
    }
  }
`;

export const GET_MEMBER_IDS = `
  query getMemberIds($ids: [ID!]!, $idType: IdType!) {
    getMemberIds(ids: $ids, idType: $idType) {
      memberId
      uuid
    }
  }
`;

export const UPDATE_PROVIDER_AVAILABILITY_PREFERENCE = `
  mutation UpdateProviderAvailabilityPreference($input: UpdateProviderAvailabilityPreferenceInput!) {
    UpdateProviderAvailabilityPreference(input: $input) {
      ... on UpdateProviderAvailabilityPreferenceSuccess {
        success
      }
      ... on UpdateProviderAvailabilityPreferenceError {
        error
      }
    }
  }
`;

export const ACKNOWLEDGE_AVAILABILITY = `
  mutation AcknowledgeAvailability($input: AcknowledgeAvailabilityInput!) {
    AcknowledgeAvailability(input: $input) {
      ... on AcknowledgeAvailabilitySuccess {
        success
      }
      ... on AcknowledgeAvailabilityError {
        error
      }
    }
  }
`;

export const NOTIFICATION_SETTING_CREATE = `
  mutation NotificationSettingCreate($input: NotificationSettingCreateInput!) {
    notificationSettingCreate(input: $input) {
      ... on NotificationSettingCreateSuccess {
        dummy
      }
      ... on NotificationSettingErrors {
        errors {
          message
        }
      }
    }
  }
`;

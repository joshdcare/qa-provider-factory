import Stripe from 'stripe';
import type { ApiClient } from '../api/client.js';
import type { ProviderContext } from '../types.js';
import {
  GET_PAYMENT_METHODS_INFORMATION,
  UPGRADE_PROVIDER_SUBSCRIPTION,
} from '../api/graphql.js';

export async function setupPayment(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.restPost(
    '/platform/spi/payment/stripe/addAccount',
    ctx.authToken,
    payloads.p2pStripeAccountInput,
    'form'
  );

  console.log('  ✓ P2P Stripe account linked');
}

export async function upgradeSubscription(
  client: ApiClient,
  ctx: ProviderContext,
  payloads: any
): Promise<void> {
  await client.retryRequest(
    () => client.graphql(GET_PAYMENT_METHODS_INFORMATION, {}),
    3,
    'Get payment methods (create Stripe customer)'
  );

  const stripeKey = process.env.STRIPE_KEY;
  if (!stripeKey) {
    throw new Error('STRIPE_KEY environment variable is required for upgrade step');
  }
  const stripe = new Stripe(stripeKey);

  const paymentMethod = await stripe.paymentMethods.create({
    type: 'card',
    card: {
      number: '4111111111111111',
      exp_month: 10,
      exp_year: 2030,
      cvc: '134',
    },
    billing_details: {
      name: 'Harvey Zellarzi',
      address: { postal_code: '02451' },
    },
  });

  if (!paymentMethod.id) {
    throw new Error('Stripe payment method creation returned no ID');
  }

  const pricing = payloads.pricingConfig[ctx.tier];
  const upgradeInput = {
    billingZIP: '02451',
    familyName: 'Zellarzi',
    givenName: 'Harvey',
    pricingSchemeId: pricing.pricingSchemeId,
    pricingPlanId: pricing.pricingPlanId,
    promoCode: pricing.promoCode,
    paymentIdentifier: {
      id: paymentMethod.id,
      type: 'STRIPE_PAYMENT_METHOD_ID',
    },
  };

  await client.retryRequest(
    () =>
      client.graphql(UPGRADE_PROVIDER_SUBSCRIPTION, {
        input: upgradeInput,
      }),
    3,
    'Upgrade provider subscription'
  );

  console.log(`  ✓ Upgraded to ${ctx.tier}`);
}

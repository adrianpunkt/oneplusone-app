update public.credit_products
set
  name = '1 credit',
  description = 'One seat at one dinner or brunch.',
  credits = 1,
  price_amount_cents = 1500,
  currency = 'eur',
  stripe_price_id = 'price_1TgTo5RdvHJ1EiRIrHTkqcJV',
  status = 'active',
  sort_order = 10,
  updated_at = now()
where id = '11111111-1111-4111-8111-111111111111';

update public.credit_products
set
  name = '3 credits',
  description = 'Three events with a small bundle discount.',
  credits = 3,
  price_amount_cents = 3900,
  currency = 'eur',
  stripe_price_id = 'price_1TgTotRdvHJ1EiRIXDuTU4vQ',
  status = 'active',
  sort_order = 20,
  updated_at = now()
where id = '33333333-3333-4333-8333-333333333333';

update public.credit_products
set
  name = '5 credits',
  description = 'Five events for members who plan to keep showing up.',
  credits = 5,
  price_amount_cents = 5000,
  currency = 'eur',
  stripe_price_id = 'price_1TgTpbRdvHJ1EiRIpmv5sGFm',
  status = 'active',
  sort_order = 30,
  updated_at = now()
where id = '55555555-5555-4555-8555-555555555555';

update public.credit_products
set
  description = 'Five events for members who like savings.',
  localized_content =
    coalesce(localized_content, '{}'::jsonb) ||
    jsonb_build_object(
      'es',
      coalesce(localized_content->'es', '{}'::jsonb) ||
      jsonb_build_object(
        'description',
        'Cinco eventos para miembros a quienes les gusta ahorrar.'
      )
    ),
  updated_at = now()
where id = '55555555-5555-4555-8555-555555555555';

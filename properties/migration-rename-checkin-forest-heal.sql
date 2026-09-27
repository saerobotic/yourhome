UPDATE checkins
SET unit = 'Villa Forest Heal'
WHERE lower(trim(unit)) = lower(trim('Villa Forest Hill'));

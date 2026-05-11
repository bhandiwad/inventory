insert into public.brands (name, slug, sort_order) values
('Maruti', 'maruti', 10),
('Nexa', 'nexa', 20),
('Tata', 'tata', 30),
('Mahindra', 'mahindra', 40),
('Hyundai', 'hyundai', 50),
('Kia', 'kia', 60),
('MG', 'mg', 70),
('Renault', 'renault', 80),
('Nissan', 'nissan', 90),
('Skoda', 'skoda', 100),
('Toyota', 'toyota', 110),
('Honda', 'honda', 120),
('Ford', 'ford', 130),
('Citroen', 'citroen', 140),
('VW', 'vw', 150),
('Datsun', 'datsun', 160),
('Chevrolet', 'chevrolet', 170),
('Jeep', 'jeep', 180),
('Fiat', 'fiat', 190),
('Ashok Leyland', 'ashok-leyland', 200),
('Force', 'force', 210),
('Vinfast', 'vinfast', 220),
('Universal / Generic', 'universal-generic', 900),
('2-Wheeler', '2-wheeler', 910)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

insert into public.product_categories (code, display_name_en, icon, sort_order, description) values
('LLM', 'LLM - confirm with pilot owner', 'car-front', 10, 'Pilot abbreviation; do not guess final friendly name.'),
('TRUNK_MAT', 'Trunk mat', 'box', 20, null),
('PARCEL_TRAY', 'Parcel tray', 'panel-top', 30, null),
('FOOTSTEP', 'Foot-step garnish', 'footprints', 40, null),
('DCC', 'DCC - confirm with pilot owner', 'badge-help', 50, 'Pilot abbreviation; do not guess final friendly name.'),
('WFK', 'WFK - confirm with pilot owner', 'badge-help', 60, 'Pilot abbreviation; do not guess final friendly name.'),
('DVSL', 'DVSL - confirm with pilot owner', 'badge-help', 70, 'Pilot abbreviation; do not guess final friendly name.'),
('DV', 'DV - confirm with pilot owner', 'badge-help', 80, 'Pilot abbreviation; do not guess final friendly name.'),
('TLC', 'TLC - confirm with pilot owner', 'badge-help', 90, 'Pilot abbreviation; do not guess final friendly name.'),
('GRASSMAT', 'Grass mat', 'grid-2x2', 100, null),
('DOOR_EDGE', 'Door edge guard', 'shield', 110, null),
('DOOR_HANDLE', 'Door handle cover', 'grip', 120, null)
on conflict (code) do update
set display_name_en = excluded.display_name_en,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    description = excluded.description;

insert into public.vehicle_models (brand_id, name, slug, aliases)
select b.id, v.name, v.slug, v.aliases
from (values
  ('maruti','Swift 2018','swift-2018', array['SWIFT 18','Swift 18']),
  ('maruti','Swift 2024','swift-2024', array['SWIFT 24','Swift 24']),
  ('maruti','Brezza 2016','brezza-2016', array['BREZZA 16','BREEZA 16','Breezza 16','breeza 16','Vitara Brezza']),
  ('maruti','Brezza 2022','brezza-2022', array['BREZZA 22','BREEZA 22','Breezza 22','breeza 22']),
  ('tata','Nexon','nexon', array['NEXON 17','NEXON 22']),
  ('tata','Nexon EV','nexon-ev', array['NEXON/EV','NEXON EV MAX']),
  ('hyundai','Creta 2020','creta-2020', array['CRETA 20']),
  ('hyundai','Creta 2024','creta-2024', array['CRETA 24']),
  ('toyota','Innova Crysta','innova-crysta', array['CRYSTA']),
  ('toyota','Innova Hycross','innova-hycross', array['HYCROSS']),
  ('mahindra','XUV300','xuv300', array['XUV 300']),
  ('mahindra','XUV 3XO','xuv-3xo', array['3XO','XUV3XO'])
) as v(brand_slug, name, slug, aliases)
join public.brands b on b.slug = v.brand_slug
on conflict (brand_id, slug) do update set name = excluded.name, aliases = excluded.aliases;

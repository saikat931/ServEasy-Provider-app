import { MaterialCommunityIcons } from '@expo/vector-icons';

export type ServiceIconName = keyof typeof MaterialCommunityIcons.glyphMap;

/**
 * Intelligent icon resolver for services across the ServEasy platform.
 * Analyzes service name, subcategory, and optional category to assign
 * distinct, intuitive, and modern MaterialCommunityIcons.
 */
export const getServiceIcon = (
  name: string = '',
  subcategory: string = '',
  category: string = ''
): ServiceIconName => {
  const text = `${name || ''} ${subcategory || ''} ${category || ''}`.toLowerCase().trim();

  // 1. Two-Wheeler / Bike / Motorcycle / Scooter
  if (
    text.includes('bike') ||
    text.includes('motorcycle') ||
    text.includes('scooter') ||
    text.includes('two wheeler') ||
    text.includes('two-wheeler') ||
    text.includes('2 wheeler') ||
    text.includes('2-wheeler')
  ) {
    return 'motorbike';
  }

  // 2. Car / Auto Wash & Detailing
  if (
    text.includes('car wash') ||
    text.includes('auto wash') ||
    text.includes('vehicle wash') ||
    text.includes('car detailing') ||
    text.includes('foam wash') ||
    text.includes('car polish') ||
    (text.includes('car') && text.includes('wash'))
  ) {
    return 'car-wash';
  }

  // 3. Garage & Towing / Breakdown Recovery
  if (text.includes('garage')) {
    return 'garage';
  }
  if (text.includes('tow') || text.includes('breakdown') || text.includes('recovery')) {
    return 'tow-truck';
  }

  // 4. Vehicle Servicing & Inspection / Engine / Tuning
  if (
    text.includes('servicing') ||
    text.includes('tune up') ||
    text.includes('oil change') ||
    text.includes('engine') ||
    text.includes('vehicle service') ||
    text.includes('car service') ||
    text.includes('inspection')
  ) {
    return 'car-cog';
  }

  // 5. Vehicle Parts, Spares, Batteries, Tires
  if (text.includes('battery') || text.includes('car battery')) {
    return 'car-battery';
  }
  if (text.includes('tire') || text.includes('tyre') || text.includes('wheel') || text.includes('puncture')) {
    return 'tire';
  }
  if (
    text.includes('part') ||
    text.includes('spare') ||
    text.includes('accessory') ||
    text.includes('accessories') ||
    text.includes('component')
  ) {
    return 'cog-outline';
  }

  // 6. Vehicle Repair / Mechanic / Denting & Painting
  if (
    text.includes('car repair') ||
    text.includes('vehicle repair') ||
    text.includes('auto repair') ||
    text.includes('mechanic') ||
    text.includes('denting') ||
    text.includes('brake')
  ) {
    return 'car-wrench';
  }

  // 7. Bathroom / Washroom / Toilet / Shower Cleaning & Wash
  if (
    text.includes('bathroom') ||
    text.includes('washroom') ||
    text.includes('toilet') ||
    text.includes('restroom') ||
    text.includes('shower')
  ) {
    return 'shower';
  }

  // 8. Kitchen / Chimney / Cooktop / Appliances
  if (
    text.includes('kitchen') ||
    text.includes('chimney') ||
    text.includes('cook') ||
    text.includes('stove') ||
    text.includes('oven') ||
    text.includes('dish')
  ) {
    return 'countertop-outline';
  }
  if (text.includes('fridge') || text.includes('refrigerator')) {
    return 'fridge-outline';
  }
  if (text.includes('washing machine') || text.includes('laundry')) {
    return 'washing-machine';
  }

  // 9. Plumbing, Pipes, Taps, Leakages
  if (
    text.includes('plumb') ||
    text.includes('pipe') ||
    text.includes('tap') ||
    text.includes('faucet') ||
    text.includes('leak') ||
    text.includes('drain') ||
    text.includes('sewage')
  ) {
    return 'pipe-wrench';
  }

  // 10. AC / Cooling / HVAC / Ventilation
  if (
    text.includes('ac ') ||
    text.includes('ac-') ||
    text.includes(' ac') ||
    text.startsWith('ac') ||
    text.includes('air condition') ||
    text.includes('cooling') ||
    text.includes('hvac') ||
    text.includes('filter clean')
  ) {
    return 'air-conditioner';
  }

  // 11. Electrical, Wiring, Electrician
  if (
    text.includes('electric') ||
    text.includes('wiring') ||
    text.includes('switch') ||
    text.includes('socket') ||
    text.includes('fuse') ||
    text.includes('fan') ||
    text.includes('light') ||
    text.includes('inverter')
  ) {
    return 'lightning-bolt-outline';
  }

  // 12. Painting, Room Decor, Interior Designing
  if (
    text.includes('decor') ||
    text.includes('paint') ||
    text.includes('wallpaper') ||
    text.includes('interior') ||
    text.includes('whitewash') ||
    text.includes('varnish')
  ) {
    return 'format-paint';
  }

  // 13. Carpentry, Furniture, Woodwork
  if (
    text.includes('carpenter') ||
    text.includes('carpentry') ||
    text.includes('wood') ||
    text.includes('furniture') ||
    text.includes('sofa') ||
    text.includes('table')
  ) {
    return 'hammer';
  }

  // 14. Home Maintenance / Handyman
  if (
    text.includes('home maintenance') ||
    text.includes('house maintenance') ||
    text.includes('maintenance') ||
    text.includes('handyman')
  ) {
    return 'hammer-wrench';
  }

  // 15. Cleaning, Housekeeping, Maid, Disinfection
  if (
    text.includes('clean') ||
    text.includes('maid') ||
    text.includes('mop') ||
    text.includes('sweep') ||
    text.includes('housekeeping') ||
    text.includes('deep clean')
  ) {
    return 'broom';
  }

  // 16. Pest Control / Termite Treatment
  if (
    text.includes('pest') ||
    text.includes('termite') ||
    text.includes('bug') ||
    text.includes('cockroach') ||
    text.includes('rodent')
  ) {
    return 'bug-outline';
  }

  // 17. Sanitization & Disinfection
  if (
    text.includes('sanitize') ||
    text.includes('disinfect') ||
    text.includes('shield') ||
    text.includes('safety')
  ) {
    return 'shield-check-outline';
  }

  // 18. Gardening & Lawn Care
  if (text.includes('garden') || text.includes('lawn') || text.includes('plant') || text.includes('grass')) {
    return 'sprout';
  }

  // 19. Security & CCTV
  if (text.includes('cctv') || text.includes('security') || text.includes('surveillance') || text.includes('camera')) {
    return 'cctv';
  }

  // 20. Transport, Driver, Cab
  if (text.includes('driver') || text.includes('rental') || text.includes('transport') || text.includes('cab')) {
    return 'car';
  }

  // 21. General Home
  if (text.includes('home') || text.includes('house')) {
    return 'home-outline';
  }

  // 22. General Repair
  if (text.includes('repair') || text.includes('fix')) {
    return 'car-wrench';
  }

  // Default fallback
  return 'tools';
};

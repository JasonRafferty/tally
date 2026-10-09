// A symbol for each list, picked from its name. Drawn like App Drawer's glyphs: a line symbol (24 x 24,
// current colour) that sits on the list's gradient square.
const LIST_ICONS = {
  tick: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  cart: '<path d="M3 4h2.5l2 11h10.2l2-8H6.6"/><circle cx="9" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
  basket: '<path d="M4 10h16l-1.6 9a1 1 0 0 1-1 .8H6.6a1 1 0 0 1-1-.8z"/><path d="m8 10 3-6M16 10l-3-6"/>',
  bag: '<path d="M5 8h14l1 12H4z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-1-3-5-3.5-5-1.2C7 8 9 8 12 8zM12 8c1-3 5-3.5 5-1.2C17 8 15 8 12 8z"/>',
  plane: '<path d="M21 4 3 11l7 2.5L12.5 21 21 4z"/><path d="m10 13.5 4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="17" cy="10" r="1.8"/><circle cx="10.5" cy="6" r="1.8"/><circle cx="13.5" cy="6" r="1.8"/><path d="M12 12.5c-3 0-5 2.5-5 4.5 0 1.5 1.5 2 3 1.5 1-.3 1.4-.5 2-.5s1 .2 2 .5c1.5.5 3 0 3-1.5 0-2-2-4.5-5-4.5z"/>',
  tools: '<path d="M15 4a4.5 4.5 0 0 0-4.2 6L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l7.3-7.3A4.5 4.5 0 0 0 20 8.4l-3 3-2.5-.5-.5-2.5 3-3A4.5 4.5 0 0 0 15 4z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
  broom: '<path d="M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>', // sparkle: for cleaning and chores
  dumbbell: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/>',
  car: '<path d="M4 17v-5l2-5h12l2 5v5z"/><path d="M4 12h16"/><circle cx="8" cy="17" r="1.6"/><circle cx="16" cy="17" r="1.6"/>',
  wallet: '<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7l12-3v3"/><circle cx="16" cy="13.5" r="1"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.6-9.4C.9 8 3 4.5 6.4 4.5c2.2 0 3.9 1.2 5.6 3.3 1.7-2.1 3.4-3.3 5.6-3.3 3.4 0 5.5 3.5 4 7.1C19.5 16.4 12 21 12 21z"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2.2 9 2.2 12 0v-5"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19 13 11"/>',
  cake: '<path d="M4 20h16v-6H4z"/><path d="M4 14c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2"/><path d="M12 12V8M12 5.5v.01"/>',
  pot: '<path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M3 11h18M9 8c0-1.5 1-1.5 1-3M14 8c0-1.5 1-1.5 1-3"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  film: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="m10 9.5 5 2.5-5 2.5z"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  file: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.7l-5.2 2.8 1-5.8-4.2-4.1 5.8-.8z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/>',
  bookmark: '<path d="M7 4h10v17l-5-4-5 4z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
};

// First match wins, so the more specific names come first.
const ICON_RULES = [
  ['gift', /\b(gifts?|presents?|birthdays?|christmas|xmas|wish ?list|anniversary|valentine)/],
  ['plane', /\b(holiday|trips?|travel|flights?|packing|vacation|airport|abroad)/],
  ['sun', /\b(beach|summer|camping|festival)/],
  ['tools', /\b(hardware|diy|tools?|b&q|fix|repairs?|building|paint)/],
  ['cart', /\b(groc|shop|supermarket|food|tesco|aldi|lidl|asda|sainsbury|morrisons|waitrose|costco|big shop)/],
  ['paw', /\b(pets?|dogs?|cats?|vet|puppy|kitten)/],
  ['dumbbell', /\b(gym|fitness|workouts?|exercise|running|training)/],
  ['car', /\b(cars?|mot|garage|petrol|tyres?|driving)\b/],
  ['wallet', /\b(money|bills?|budget|rent|tax|bank|payday|savings?|invoices?)/],
  ['heart', /\b(health|doctor|gp|dentist|pharmacy|meds|medic|hospital|wellbeing)/],
  ['cap', /\b(study|uni|school|homework|revision|exams?|courses?|learn|lessons?|tutor)/],
  ['leaf', /\b(garden|plants?|allotment|lawn)/],
  ['cake', /\b(party|wedding|events?|celebrat|bbq)/],
  ['pot', /\b(cook|recipes?|meals?|dinner|lunch|baking|kitchen)/],
  ['book', /\b(books?|reading|library)/],
  ['film', /\b(films?|movies?|tv|watch|netflix)/],
  ['broom', /\b(chores?|clean|tidy|laundry)/],
  ['home', /\b(home|house|flat|rooms?|furniture|ikea)/],
  ['briefcase', /\b(work|office|jobs?|meetings?|clients?|projects?|career)/],
  ['file', /\b(admin|paperwork|forms?|documents?|council|insurance|passport)/],
  ['calendar', /\b(plans?|schedule|week|month|today|tomorrow|appointments?|diary)/],
  ['bulb', /\b(ideas?|brainstorm)/],
  ['star', /\b(favou?rites?|best|top)/],
];
// Lists with no obvious name get one of these, the same one every time for the same list.
const TODO_FALLBACK = ['tick', 'star', 'bulb', 'flag', 'bookmark', 'compass', 'leaf', 'calendar', 'heart'];
const SHOPPING_FALLBACK = ['cart', 'basket', 'bag'];

function listIcon(list) {
  const name = (list.name ?? '').toLowerCase();
  const rule = ICON_RULES.find(([, pattern]) => pattern.test(name));
  let key = rule?.[0];
  if (!key) {
    let hash = 0;
    for (const char of String(list.id)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const pool = list.kind === 'shopping' ? SHOPPING_FALLBACK : TODO_FALLBACK;
    key = pool[hash % pool.length];
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${LIST_ICONS[key]}</svg>`;
}

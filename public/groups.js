// Shopping groups, in the order you'd walk a supermarket, and a guess at which one an item belongs to.
const GROUPS = [
  { id: 'produce', name: 'Fruit & veg' },
  { id: 'bakery', name: 'Bakery' },
  { id: 'dairy', name: 'Dairy & eggs' },
  { id: 'meat', name: 'Meat & fish' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'cupboard', name: 'Cupboard' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'household', name: 'Household' },
  { id: 'other', name: 'Other' },
];

const GROUP_WORDS = {
  produce: 'apple banana orange lemon lime pear grape strawberry blueberry raspberry berry melon watermelon mango pineapple kiwi avocado tomato cucumber lettuce salad spinach rocket kale cabbage broccoli cauliflower carrot potato onion shallot garlic ginger chilli mushroom courgette aubergine celery leek sweetcorn pea beetroot radish asparagus basil parsley coriander mint rosemary thyme fruit veg vegetable squash pumpkin plum peach nectarine cherry clementine satsuma tangerine grapefruit pepper',
  bakery: 'bread loaf roll bagel croissant bun wrap tortilla pitta naan baguette muffin cake pastry doughnut crumpet sourdough brioche scone flatbread',
  dairy: 'milk cheese butter yoghurt yogurt cream egg custard margarine mozzarella cheddar parmesan feta halloumi brie hummus crème',
  meat: 'chicken beef pork lamb mince steak bacon sausage ham turkey salmon fish cod prawn haddock burger chorizo salami gammon fillet duck trout mackerel',
  frozen: 'frozen',
  cupboard: 'pasta rice noodle flour sugar salt oil vinegar sauce ketchup mayo mayonnaise mustard cereal oat porridge bean lentil chickpea soup tin tuna jam honey marmalade spread stock gravy spice curry biscuit cracker chocolate crisp snack sweet nut popcorn raisin granola muesli couscous quinoa pesto syrup treacle tea coffee',
  drinks: 'juice water cola coke lemonade squash wine beer cider lager gin vodka whisky prosecco fizz smoothie soda tonic rum',
  household: 'bleach detergent sponge foil shampoo conditioner soap toothpaste toothbrush deodorant razor tissue nappy wipe candle battery lightbulb sunscreen plaster',
};

// Phrases are checked first, because a word on its own can point the wrong way ("ice cream" is not cream).
const GROUP_PHRASES = [
  ['frozen', 'frozen'], ['ice cream', 'frozen'], ['fish finger', 'frozen'], ['ice lolly', 'frozen'], ['hash brown', 'frozen'], ['oven chip', 'frozen'], ['pizza', 'frozen'], ['nugget', 'frozen'], ['waffle', 'frozen'],
  ['toilet roll', 'household'], ['toilet paper', 'household'], ['kitchen roll', 'household'], ['washing up', 'household'], ['washing powder', 'household'], ['washing liquid', 'household'],
  ['fabric softener', 'household'], ['bin bag', 'household'], ['bin liner', 'household'], ['cling film', 'household'], ['light bulb', 'household'], ['dishwasher tab', 'household'], ['hand wash', 'household'],
  ['black pepper', 'cupboard'], ['peanut butter', 'cupboard'], ['chopped tomato', 'cupboard'], ['tinned', 'cupboard'], ['baked bean', 'cupboard'], ['tomato puree', 'cupboard'], ['tomato paste', 'cupboard'],
  ['orange juice', 'drinks'], ['apple juice', 'drinks'], ['energy drink', 'drinks'], ['hot chocolate', 'drinks'],
];

const WORD_GROUP = new Map();
for (const [group, words] of Object.entries(GROUP_WORDS)) for (const word of words.split(' ')) if (!WORD_GROUP.has(word)) WORD_GROUP.set(word, group);

const GROUP_IDS = new Set(GROUPS.map((group) => group.id));

// "tomatoes" -> "tomato", "berries" -> "berry", "eggs" -> "egg".
function wordForms(word) {
  const forms = [word];
  if (word.endsWith('ies')) forms.push(`${word.slice(0, -3)}y`);
  if (word.endsWith('es')) forms.push(word.slice(0, -2));
  if (word.endsWith('s')) forms.push(word.slice(0, -1));
  return forms;
}

function guessGroup(text) {
  const lower = text.toLowerCase();
  for (const [phrase, group] of GROUP_PHRASES) if (lower.includes(phrase)) return group;
  // The last word usually names the thing ("oat milk", "chicken soup"), so look from the end.
  const words = lower.split(/[^a-zà-ÿ]+/).filter(Boolean).reverse();
  for (const word of words) {
    for (const form of wordForms(word)) {
      const group = WORD_GROUP.get(form);
      if (group) return group;
    }
  }
  return 'other';
}

// Generic UK departments: actual aisle order varies between shops.
const AISLE_GROUPS = [
  ['produce', 'Fruit & veg'], ['bakery', 'Bakery'], ['meat', 'Meat & fish'],
  ['dairy', 'Chilled & dairy'], ['frozen', 'Frozen'], ['tins', 'Tins & jars'],
  ['grains', 'Pasta, rice & noodles'], ['breakfast', 'Breakfast'], ['baking', 'Baking'],
  ['sauces', 'Sauces, oils & seasonings'], ['snacks', 'Biscuits, crisps & sweets'],
  ['drinks', 'Drinks & hot drinks'], ['household', 'Cleaning & household'],
  ['toiletries', 'Toiletries & health'], ['baby', 'Baby'], ['pets', 'Pet supplies'],
  ['cupboard', 'Other cupboard'], ['other', 'Other'],
].map(([id, name]) => ({ id, name }));
const PRODUCT_GROUPS = [
  ['fruit', 'Fruit'], ['vegetables', 'Vegetables & herbs'], ['bakery', 'Bread & baked goods'],
  ['dairy', 'Dairy, eggs & alternatives'], ['meat', 'Meat'], ['fish', 'Fish & seafood'],
  ['grains', 'Grains & pulses'], ['sauces', 'Sauces & seasonings'], ['baking', 'Baking ingredients'],
  ['snacks', 'Snacks & treats'], ['meals', 'Prepared meals'], ['drinks', 'Drinks'],
  ['household', 'Household'], ['toiletries', 'Toiletries & health'], ['baby', 'Baby'],
  ['pets', 'Pet supplies'], ['cupboard', 'Other food'], ['other', 'Other'],
].map(([id, name]) => ({ id, name }));

// Research and evidence limits are recorded in docs/supermarket-layout-research.md.
// These are editable department routes, never claimed to be branch aisle maps.
const STORE_PROFILES = {
  aldi: { name: 'Aldi', order: ['produce', 'meat', 'dairy', 'bakery', 'breakfast', 'tins', 'grains', 'sauces', 'baking', 'snacks', 'drinks', 'household', 'toiletries', 'baby', 'pets', 'cupboard', 'frozen', 'other'] },
  morrisons: { name: 'Morrisons', order: ['produce', 'bakery', 'meat', 'dairy', 'tins', 'grains', 'sauces', 'baking', 'breakfast', 'snacks', 'drinks', 'household', 'pets', 'toiletries', 'baby', 'cupboard', 'frozen', 'other'] },
  lidl: { name: 'Lidl', order: ['produce', 'bakery', 'meat', 'dairy', 'tins', 'grains', 'sauces', 'breakfast', 'baking', 'snacks', 'household', 'toiletries', 'baby', 'pets', 'drinks', 'cupboard', 'frozen', 'other'] },
  tesco: { name: 'Tesco', order: ['produce', 'meat', 'dairy', 'bakery', 'grains', 'tins', 'sauces', 'baking', 'breakfast', 'snacks', 'drinks', 'baby', 'toiletries', 'household', 'pets', 'cupboard', 'frozen', 'other'] },
};
function storeGroups(store, saved = []) {
  const profile = STORE_PROFILES[store];
  if (!profile) return AISLE_GROUPS;
  const ids = [...new Set([...saved.filter((id) => AISLE_GROUPS.some((group) => group.id === id)), ...profile.order])];
  return ids.map((id) => AISLE_GROUPS.find((group) => group.id === id));
}

// Each catalogue entry supplies both classifications; storage temperature is
// relevant to the aisle, while product type describes the food itself.
const SUPERMARKET_SECTIONS = [
  ['produce', 'fruit', 'Apples|Bananas|Oranges|Pears|Grapes|Strawberries|Blueberries|Raspberries|Blackberries|Cherries|Peaches|Nectarines|Plums|Apricots|Mango|Pineapple|Kiwi fruit|Watermelon|Melon|Grapefruit|Clementines|Satsumas|Lemons|Limes|Avocados|Dates|Figs|Pomegranate'],
  ['produce', 'vegetables', 'Potatoes|Sweet potatoes|Carrots|Parsnips|Onions|Red onions|Spring onions|Shallots|Garlic|Ginger|Broccoli|Cauliflower|Cabbage|Red cabbage|Spinach|Kale|Rocket|Lettuce|Mixed salad|Cucumber|Tomatoes|Cherry tomatoes|Peppers|Chillies|Courgettes|Aubergines|Mushrooms|Celery|Leeks|Asparagus|Green beans|Sugar snap peas|Mangetout|Sweetcorn|Beetroot|Radishes|Butternut squash|Pumpkin|Brussels sprouts|Fresh basil|Fresh coriander|Fresh parsley|Fresh mint|Fresh rosemary|Fresh thyme|Salad cress'],
  ['bakery', 'bakery', 'Bread|White bread|Wholemeal bread|Seeded bread|Sourdough|Bread rolls|Bagels|Crumpets|English muffins|Croissants|Brioche|Baguette|Pitta bread|Naan bread|Tortilla wraps|Flatbreads|Hot cross buns|Scones|Teacakes|Doughnuts|Pancakes|Pain au chocolat|Fruit loaf|Garlic bread'],
  ['dairy', 'dairy', 'Milk|Whole milk|Semi-skimmed milk|Skimmed milk|Lactose-free milk|Oat milk|Soya milk|Almond milk|Coconut milk drink|Butter|Spreadable butter|Margarine|Cheddar|Mature cheddar|Mozzarella|Parmesan|Feta|Halloumi|Brie|Cream cheese|Cottage cheese|Yoghurt|Greek yoghurt|Natural yoghurt|Dairy-free yoghurt|Double cream|Single cream|Sour cream|Crème fraîche|Eggs|Free-range eggs|Custard|Kefir'],
  ['dairy', 'meals', 'Hummus|Coleslaw|Potato salad|Fresh pasta|Ravioli|Tortellini|Ready meal|Chilled pizza|Quiche|Pork pie|Scotch eggs|Falafel|Tofu|Tempeh|Vegetarian sausages|Veggie burgers|Guacamole|Tzatziki'],
  ['meat', 'meat', 'Chicken|Chicken breasts|Chicken thighs|Chicken drumsticks|Whole chicken|Beef mince|Beef steak|Stewing beef|Pork chops|Pork mince|Lamb chops|Lamb mince|Turkey mince|Bacon|Sausages|Ham|Gammon|Chorizo|Salami|Beef burgers|Meatballs|Duck breasts'],
  ['meat', 'fish', 'Salmon|Cod|Haddock|Sea bass|Trout|Mackerel|Smoked salmon|Prawns|King prawns|Mussels|Fish pie mix|Tuna steaks|Sardines'],
  ['frozen', 'vegetables', 'Frozen peas|Frozen sweetcorn|Frozen spinach|Frozen broccoli|Frozen mixed vegetables|Frozen green beans|Frozen cauliflower'],
  ['frozen', 'fruit', 'Frozen berries|Frozen blueberries|Frozen raspberries|Frozen mango|Frozen strawberries'],
  ['frozen', 'meals', 'Frozen pizza|Frozen chips|Oven chips|Hash browns|Potato waffles|Yorkshire puddings|Frozen roast potatoes|Frozen vegetarian burgers|Frozen ready meals|Spring rolls'],
  ['frozen', 'fish', 'Fish fingers|Frozen prawns|Frozen salmon|Battered fish|Breaded fish'],
  ['frozen', 'meat', 'Chicken nuggets|Frozen chicken|Frozen burgers'],
  ['frozen', 'snacks', 'Ice cream|Ice lollies|Frozen yoghurt|Ice cream cones'],
  ['tins', 'grains', 'Baked beans|Chickpeas|Kidney beans|Black beans|Butter beans|Cannellini beans|Green lentils|Red lentils|Tinned lentils'],
  ['tins', 'vegetables', 'Tinned tomatoes|Chopped tomatoes|Plum tomatoes|Passata|Tomato purée|Tinned sweetcorn|Tinned peas|Tinned mushrooms'],
  ['tins', 'fish', 'Tinned tuna|Tinned salmon|Tinned sardines|Tinned mackerel|Anchovies'],
  ['tins', 'fruit', 'Tinned peaches|Tinned pineapple|Tinned pears|Fruit cocktail'],
  ['tins', 'meals', 'Tomato soup|Chicken soup|Vegetable soup|Mushroom soup|Tinned spaghetti|Tinned curry|Coconut milk'],
  ['tins', 'sauces', 'Olives|Gherkins|Pickled onions|Capers|Chutney|Pickle'],
  ['grains', 'grains', 'Rice|Basmati rice|Long grain rice|Brown rice|Jasmine rice|Risotto rice|Microwave rice|Pasta|Spaghetti|Penne|Fusilli|Macaroni|Lasagne sheets|Noodles|Egg noodles|Rice noodles|Couscous|Quinoa|Bulgur wheat|Pearl barley|Dried lentils|Dried chickpeas'],
  ['breakfast', 'grains', 'Cereal|Cornflakes|Weetabix|Bran flakes|Rice cereal|Shredded wheat|Granola|Muesli|Porridge oats|Oats|Instant porridge'],
  ['breakfast', 'sauces', 'Jam|Strawberry jam|Raspberry jam|Marmalade|Honey|Peanut butter|Chocolate spread|Marmite|Maple syrup'],
  ['baking', 'baking', 'Plain flour|Self-raising flour|Strong bread flour|Wholemeal flour|Cornflour|Caster sugar|Granulated sugar|Icing sugar|Light brown sugar|Dark brown sugar|Baking powder|Bicarbonate of soda|Dried yeast|Cocoa powder|Vanilla extract|Chocolate chips|Desiccated coconut|Ground almonds|Sultanas|Raisins|Mixed dried fruit|Glacé cherries|Golden syrup|Black treacle|Gelatine|Baking parchment|Cake cases'],
  ['sauces', 'sauces', 'Olive oil|Extra virgin olive oil|Vegetable oil|Sunflower oil|Rapeseed oil|Sesame oil|Salt|Black pepper|White pepper|Paprika|Smoked paprika|Ground cumin|Ground coriander|Turmeric|Cinnamon|Chilli powder|Curry powder|Garam masala|Mixed herbs|Oregano|Dried basil|Bay leaves|Soy sauce|Worcestershire sauce|Fish sauce|Sweet chilli sauce|Hot sauce|Ketchup|Mayonnaise|Mustard|Brown sauce|BBQ sauce|Salad cream|Salad dressing|Balsamic vinegar|Malt vinegar|White wine vinegar|Pasta sauce|Pesto|Curry sauce|Curry paste|Gravy granules|Chicken stock cubes|Vegetable stock cubes|Beef stock cubes|Tahini'],
  ['snacks', 'snacks', 'Crisps|Ready salted crisps|Salt and vinegar crisps|Cheese and onion crisps|Tortilla chips|Popcorn|Pretzels|Rice cakes|Crackers|Oatcakes|Digestive biscuits|Chocolate digestives|Rich tea biscuits|Hobnobs|Shortbread|Cookies|Jaffa cakes|Chocolate|Dark chocolate|Milk chocolate|White chocolate|Chocolate bars|Sweets|Mints|Chewing gum|Cereal bars|Flapjacks|Mixed nuts|Cashews|Almonds|Walnuts|Peanuts|Pistachios|Sunflower seeds|Pumpkin seeds|Trail mix'],
  ['drinks', 'drinks', 'Tea|Tea bags|Decaf tea|Green tea|Peppermint tea|Chamomile tea|Coffee|Instant coffee|Ground coffee|Coffee beans|Decaf coffee|Hot chocolate|Orange juice|Apple juice|Cranberry juice|Smoothies|Water|Sparkling water|Squash|Orange squash|Blackcurrant squash|Lemonade|Cola|Diet cola|Ginger beer|Tonic water|Soda water|Energy drinks|Sports drinks|Beer|Lager|Cider|Red wine|White wine|Rosé wine|Prosecco|Gin|Vodka|Whisky|Rum|Alcohol-free beer'],
  ['household', 'household', 'Toilet roll|Kitchen roll|Tissues|Bin bags|Food waste bags|Recycling bags|Washing up liquid|Dishwasher tablets|Dishwasher salt|Rinse aid|Laundry detergent|Laundry capsules|Washing powder|Fabric conditioner|Stain remover|Bleach|Toilet cleaner|Bathroom cleaner|Kitchen cleaner|Surface spray|Antibacterial wipes|Floor cleaner|Glass cleaner|Limescale remover|Sponges|Scourers|Cleaning cloths|Rubber gloves|Cling film|Kitchen foil|Freezer bags|Sandwich bags|Food storage containers|Matches|Candles|Batteries|Light bulbs|Air freshener'],
  ['toiletries', 'toiletries', 'Shampoo|Conditioner|Dry shampoo|Shower gel|Body wash|Soap|Hand wash|Toothpaste|Toothbrush|Dental floss|Mouthwash|Deodorant|Antiperspirant|Razor blades|Shaving foam|Moisturiser|Face wash|Cotton wool|Cotton buds|Makeup remover|Lip balm|Sun cream|Hand cream|Sanitary towels|Tampons|Panty liners|Plasters|Paracetamol|Ibuprofen|Antihistamines|Vitamins|Hand sanitiser'],
  ['baby', 'baby', 'Nappies|Baby wipes|Nappy bags|Baby formula|Baby food|Baby porridge|Baby shampoo|Baby bath|Nappy cream|Cotton pads'],
  ['pets', 'pets', 'Cat food|Dry cat food|Wet cat food|Cat treats|Cat litter|Dog food|Dry dog food|Wet dog food|Dog treats|Dog poo bags|Bird seed|Rabbit food|Hay|Fish food'],
];
const SUPERMARKET_ITEMS = SUPERMARKET_SECTIONS.flatMap(([aisle, product, names]) => names.split('|').map((text) => ({ text, aisle, product })));
const SHOPPING_CLASSIFICATIONS = new Map(SUPERMARKET_ITEMS.map((entry) => [ShoppingCore.key(entry.text), entry]));
function shoppingGroup(item, mode) {
  const text = ShoppingCore.key(item.text);
  const match = SHOPPING_CLASSIFICATIONS.get(text);
  const legacy = groupOf(item);
  // Keep a person's explicit item-group correction, where it differs from the guess.
  if (GROUP_IDS.has(item.grp) && item.grp !== guessGroup(item.text)) return mode === 'product' && item.grp === 'produce' ? 'vegetables' : mode === 'product' && item.grp === 'frozen' ? 'meals' : item.grp;
  if (match) return mode === 'product' ? match.product : match.aisle;
  if (/\b(cat|dog|pet|kitten|puppy|litter|bird seed)\b/.test(text)) return 'pets';
  if (/\b(nappies|nappy|baby)\b/.test(text)) return 'baby';
  if (/\b(shampoo|conditioner|toothpaste|toothbrush|deodorant|razor|sanitary|tampon|plaster|vitamin|paracetamol|ibuprofen)\b/.test(text)) return 'toiletries';
  if (mode === 'product') {
    if (/\b(salmon|cod|fish|prawn|tuna|haddock|mackerel|trout|seafood)\b/.test(text)) return 'fish';
    if (legacy === 'produce') return 'vegetables';
    if (legacy === 'frozen') return 'meals';
  }
  return legacy;
}

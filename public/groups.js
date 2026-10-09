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

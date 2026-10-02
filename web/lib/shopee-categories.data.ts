export type ShopeeCategory = {
  id: number;
  name: string;
  children: ShopeeCategory[];
};

/** Shopee PH browse category tree (public category list snapshot). */
export const SHOPEE_CATEGORIES: ShopeeCategory[] = [
  {
    "id": 11021587,
    "name": "Men's Apparel",
    "children": [
      {
        "id": 11021590,
        "name": "Tops",
        "children": []
      },
      {
        "id": 11021617,
        "name": "Shorts",
        "children": []
      },
      {
        "id": 11021610,
        "name": "Pants",
        "children": []
      },
      {
        "id": 11021634,
        "name": "Jeans",
        "children": []
      },
      {
        "id": 11021604,
        "name": "Underwear",
        "children": []
      },
      {
        "id": 11021627,
        "name": "Socks",
        "children": []
      },
      {
        "id": 11021622,
        "name": "Hoodies & Sweatshirts",
        "children": []
      },
      {
        "id": 11021596,
        "name": "Jackets & Sweaters",
        "children": []
      },
      {
        "id": 11021640,
        "name": "Sleepwear",
        "children": []
      },
      {
        "id": 11021642,
        "name": "Suits",
        "children": []
      },
      {
        "id": 11021638,
        "name": "Sets",
        "children": []
      },
      {
        "id": 11021636,
        "name": "Occupational Attire",
        "children": []
      },
      {
        "id": 11021646,
        "name": "Traditional Wear",
        "children": []
      },
      {
        "id": 11021632,
        "name": "Costumes",
        "children": []
      },
      {
        "id": 11021588,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021963,
    "name": "Women's Apparel",
    "children": [
      {
        "id": 11021969,
        "name": "Dresses",
        "children": []
      },
      {
        "id": 11044971,
        "name": "Tops",
        "children": []
      },
      {
        "id": 11021964,
        "name": "Tees",
        "children": []
      },
      {
        "id": 11021975,
        "name": "Shorts",
        "children": []
      },
      {
        "id": 11021993,
        "name": "Pants",
        "children": []
      },
      {
        "id": 11044985,
        "name": "Jeans",
        "children": []
      },
      {
        "id": 11021981,
        "name": "Skirts",
        "children": []
      },
      {
        "id": 11021988,
        "name": "Jumpsuits & Rompers",
        "children": []
      },
      {
        "id": 11022015,
        "name": "Lingerie & Nightwear",
        "children": []
      },
      {
        "id": 11022025,
        "name": "Sets",
        "children": []
      },
      {
        "id": 11022004,
        "name": "Swimsuit",
        "children": []
      },
      {
        "id": 11022008,
        "name": "Jackets & Outerwear",
        "children": []
      },
      {
        "id": 11022034,
        "name": "Plus Size",
        "children": []
      },
      {
        "id": 11022011,
        "name": "Sweater & Cardigans",
        "children": []
      },
      {
        "id": 11044987,
        "name": "Maternity Wear",
        "children": []
      },
      {
        "id": 11022028,
        "name": "Socks & Stockings",
        "children": []
      },
      {
        "id": 11044983,
        "name": "Costumes",
        "children": []
      },
      {
        "id": 11044990,
        "name": "Traditional Wear",
        "children": []
      },
      {
        "id": 11022048,
        "name": "Fabric",
        "children": []
      }
    ]
  },
  {
    "id": 11021712,
    "name": "Mobiles & Gadgets",
    "children": [
      {
        "id": 11021737,
        "name": "Portable Audio",
        "children": []
      },
      {
        "id": 11021733,
        "name": "Wearables",
        "children": []
      },
      {
        "id": 11021727,
        "name": "E-Cigarettes",
        "children": []
      },
      {
        "id": 11021723,
        "name": "Tablets",
        "children": []
      },
      {
        "id": 11021713,
        "name": "Mobiles",
        "children": []
      }
    ]
  },
  {
    "id": 11021260,
    "name": "Health & Personal Care",
    "children": [
      {
        "id": 11021341,
        "name": "Sexual Wellness",
        "children": []
      },
      {
        "id": 11021330,
        "name": "Medical Supplies",
        "children": []
      },
      {
        "id": 11021327,
        "name": "Men's Grooming",
        "children": []
      },
      {
        "id": 11021320,
        "name": "Health Supplements",
        "children": []
      },
      {
        "id": 11021313,
        "name": "Slimming",
        "children": []
      },
      {
        "id": 11021308,
        "name": "Suncare",
        "children": []
      },
      {
        "id": 11021303,
        "name": "Whitening",
        "children": []
      },
      {
        "id": 11021293,
        "name": "Personal Care",
        "children": []
      },
      {
        "id": 11021285,
        "name": "Bath & Body",
        "children": []
      },
      {
        "id": 11021276,
        "name": "Hair Care",
        "children": []
      },
      {
        "id": 11021263,
        "name": "Skin Care",
        "children": []
      },
      {
        "id": 11021261,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021742,
    "name": "Mobiles Accessories",
    "children": [
      {
        "id": 11021762,
        "name": "Others Mobile Accessories",
        "children": []
      },
      {
        "id": 11021756,
        "name": "Attachments",
        "children": []
      },
      {
        "id": 11021749,
        "name": "Cases & Covers",
        "children": []
      },
      {
        "id": 11021743,
        "name": "Powerbanks & Chargers",
        "children": []
      }
    ]
  },
  {
    "id": 11021036,
    "name": "Makeup & Fragrances",
    "children": [
      {
        "id": 11021090,
        "name": "Palettes & Makeup Sets",
        "children": []
      },
      {
        "id": 11021078,
        "name": "Tools & Accessories",
        "children": []
      },
      {
        "id": 11021072,
        "name": "Nails",
        "children": []
      },
      {
        "id": 11021066,
        "name": "Fragrances",
        "children": []
      },
      {
        "id": 11021056,
        "name": "Face Makeup",
        "children": []
      },
      {
        "id": 11021046,
        "name": "Lip Makeup",
        "children": []
      },
      {
        "id": 11021039,
        "name": "Eye Makeup",
        "children": []
      },
      {
        "id": 11021037,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11020924,
    "name": "Home Entertainment",
    "children": [
      {
        "id": 11020940,
        "name": "Projectors",
        "children": []
      },
      {
        "id": 11020932,
        "name": "TV Accessories",
        "children": []
      },
      {
        "id": 11020927,
        "name": "Television",
        "children": []
      },
      {
        "id": 11020925,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11034482,
    "name": "Home Appliances",
    "children": [
      {
        "id": 11034558,
        "name": "Small Household Appliances",
        "children": []
      },
      {
        "id": 11034549,
        "name": "Home Appliance Parts & Accessories",
        "children": []
      },
      {
        "id": 11034543,
        "name": "Large Appliances",
        "children": []
      },
      {
        "id": 11034535,
        "name": "Vacuum Cleaners & Floor Care",
        "children": []
      },
      {
        "id": 11034527,
        "name": "Humidifier & Air Purifier",
        "children": []
      },
      {
        "id": 11034513,
        "name": "Cooling & Heating",
        "children": []
      },
      {
        "id": 11034506,
        "name": "Specialty Appliances",
        "children": []
      },
      {
        "id": 11034491,
        "name": "Small kitchen Appliances",
        "children": []
      },
      {
        "id": 11034485,
        "name": "Garment Care",
        "children": []
      },
      {
        "id": 11034483,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021766,
    "name": "Babies & Kids",
    "children": [
      {
        "id": 11047673,
        "name": "Baby Detergent",
        "children": []
      },
      {
        "id": 11034455,
        "name": "Babies' Fashion",
        "children": []
      },
      {
        "id": 11021875,
        "name": "Rain Gear",
        "children": []
      },
      {
        "id": 11021863,
        "name": "Nursery",
        "children": []
      },
      {
        "id": 11021855,
        "name": "Moms & Maternity",
        "children": []
      },
      {
        "id": 11021847,
        "name": "Baby Gear",
        "children": []
      },
      {
        "id": 11021836,
        "name": "Health & Safety",
        "children": []
      },
      {
        "id": 11021825,
        "name": "Bath & Skin Care",
        "children": []
      },
      {
        "id": 11021818,
        "name": "Boys' Fashion",
        "children": []
      },
      {
        "id": 11021803,
        "name": "Girls' Fashion",
        "children": []
      },
      {
        "id": 11021780,
        "name": "Feeding & Nursing",
        "children": []
      },
      {
        "id": 11021778,
        "name": "Feeding",
        "children": []
      },
      {
        "id": 11021769,
        "name": "Diapers & Wipes",
        "children": []
      },
      {
        "id": 11021767,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021121,
    "name": "Laptops & Computers",
    "children": [
      {
        "id": 11021171,
        "name": "USB Gadgets",
        "children": []
      },
      {
        "id": 11021161,
        "name": "Computer Hardware",
        "children": []
      },
      {
        "id": 11021159,
        "name": "Software",
        "children": []
      },
      {
        "id": 11021155,
        "name": "Printers and Inks",
        "children": []
      },
      {
        "id": 11021146,
        "name": "Storage",
        "children": []
      },
      {
        "id": 11021134,
        "name": "Computer Accessories",
        "children": []
      },
      {
        "id": 11021128,
        "name": "Network Components",
        "children": []
      },
      {
        "id": 11021124,
        "name": "Laptops and Desktops",
        "children": []
      },
      {
        "id": 11021122,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021407,
    "name": "Home & Living",
    "children": [
      {
        "id": 11034612,
        "name": "Hand Warmers, Hot Water Bags & Ice Bags",
        "children": []
      },
      {
        "id": 11021568,
        "name": "Home Maintenance",
        "children": []
      },
      {
        "id": 11021548,
        "name": "Furniture",
        "children": []
      },
      {
        "id": 11021537,
        "name": "Lighting",
        "children": []
      },
      {
        "id": 11021530,
        "name": "Party Supplies",
        "children": []
      },
      {
        "id": 11021520,
        "name": "Beddings",
        "children": []
      },
      {
        "id": 11021506,
        "name": "Bath",
        "children": []
      },
      {
        "id": 11021499,
        "name": "Glassware & Drinkware",
        "children": []
      },
      {
        "id": 11021491,
        "name": "Dinnerware",
        "children": []
      },
      {
        "id": 11021486,
        "name": "Bakeware",
        "children": []
      },
      {
        "id": 11021473,
        "name": "Kitchenware",
        "children": []
      },
      {
        "id": 11021470,
        "name": "Sinkware",
        "children": []
      },
      {
        "id": 11021465,
        "name": "Power Tools",
        "children": []
      },
      {
        "id": 11021449,
        "name": "Home Improvement",
        "children": []
      },
      {
        "id": 11021436,
        "name": "Storage & Organization",
        "children": []
      },
      {
        "id": 11021424,
        "name": "Home Decor",
        "children": []
      },
      {
        "id": 11021421,
        "name": "Garden Decor",
        "children": []
      },
      {
        "id": 11021410,
        "name": "Outdoor & Garden",
        "children": []
      },
      {
        "id": 11021408,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021092,
    "name": "Cameras",
    "children": [
      {
        "id": 11021117,
        "name": "Car / Dash Camera",
        "children": []
      },
      {
        "id": 11021114,
        "name": "Drones",
        "children": []
      },
      {
        "id": 11021111,
        "name": "CCTV / IP Camera",
        "children": []
      },
      {
        "id": 11021109,
        "name": "Action Camera",
        "children": []
      },
      {
        "id": 11021100,
        "name": "Camera Accessories",
        "children": []
      },
      {
        "id": 11021094,
        "name": "Digital Camera",
        "children": []
      },
      {
        "id": 11021093,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021197,
    "name": "Groceries",
    "children": [
      {
        "id": 11034582,
        "name": "Seasoning, Staple Foods & Baking Ingredients",
        "children": []
      },
      {
        "id": 11021258,
        "name": "Gift Set & Hampers",
        "children": []
      },
      {
        "id": 11021249,
        "name": "Dairy & Eggs",
        "children": []
      },
      {
        "id": 11021247,
        "name": "Cigarettes",
        "children": []
      },
      {
        "id": 11021241,
        "name": "Superfoods & Healthy Foods",
        "children": []
      },
      {
        "id": 11021235,
        "name": "Breakfast Food",
        "children": []
      },
      {
        "id": 11021224,
        "name": "Snack & Sweets",
        "children": []
      },
      {
        "id": 11021222,
        "name": "Frozen & Fresh foods",
        "children": []
      },
      {
        "id": 11021215,
        "name": "Alcoholic Beverages",
        "children": []
      },
      {
        "id": 11021207,
        "name": "Laundry & Household Care",
        "children": []
      },
      {
        "id": 11021200,
        "name": "Beverages",
        "children": []
      },
      {
        "id": 11021198,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11044844,
    "name": "Sports & Travel",
    "children": [
      {
        "id": 11046785,
        "name": "Travel Bags",
        "children": []
      },
      {
        "id": 11046770,
        "name": "Travel Accessories",
        "children": []
      },
      {
        "id": 11046768,
        "name": "Travel Organizer",
        "children": []
      },
      {
        "id": 11046615,
        "name": "Kid's Activewear",
        "children": []
      },
      {
        "id": 11046607,
        "name": "Boxing & MMA",
        "children": []
      },
      {
        "id": 11046601,
        "name": "Weather Protection",
        "children": []
      },
      {
        "id": 11046595,
        "name": "WinterSports Gear",
        "children": []
      },
      {
        "id": 11046590,
        "name": "Outdoor Recreation",
        "children": []
      },
      {
        "id": 11046584,
        "name": "Leisure Sports & Game Room",
        "children": []
      },
      {
        "id": 11046577,
        "name": "Golf",
        "children": []
      },
      {
        "id": 11046571,
        "name": "Racket Sports",
        "children": []
      },
      {
        "id": 11045281,
        "name": "Sports Bags",
        "children": []
      },
      {
        "id": 11044965,
        "name": "Women's Activewear",
        "children": []
      },
      {
        "id": 11044921,
        "name": "Men's Activewear",
        "children": []
      },
      {
        "id": 11044909,
        "name": "Cycling, Skates & Scooters",
        "children": []
      },
      {
        "id": 11044901,
        "name": "Team Sports",
        "children": []
      },
      {
        "id": 11044889,
        "name": "Water Sports",
        "children": []
      },
      {
        "id": 11044879,
        "name": "Camping & Hiking",
        "children": []
      },
      {
        "id": 11044868,
        "name": "Weightlifting",
        "children": []
      },
      {
        "id": 11044856,
        "name": "Fitness Accessory",
        "children": []
      },
      {
        "id": 11044850,
        "name": "Yoga",
        "children": []
      },
      {
        "id": 11044848,
        "name": "Exercise & Fitness",
        "children": []
      },
      {
        "id": 11044846,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021347,
    "name": "Toys, Games & Collectibles",
    "children": [
      {
        "id": 11021402,
        "name": "Celebrity Merchandise",
        "children": []
      },
      {
        "id": 11021397,
        "name": "Dress Up & Pretend",
        "children": []
      },
      {
        "id": 11021392,
        "name": "Blasters & Toy Guns",
        "children": []
      },
      {
        "id": 11021382,
        "name": "Sports & Outdoor Toys",
        "children": []
      },
      {
        "id": 11021377,
        "name": "Dolls",
        "children": []
      },
      {
        "id": 11021368,
        "name": "Educational Toys",
        "children": []
      },
      {
        "id": 11021365,
        "name": "Electronic Toys",
        "children": []
      },
      {
        "id": 11021360,
        "name": "Boards & Family Games",
        "children": []
      },
      {
        "id": 11021353,
        "name": "Collectibles",
        "children": []
      },
      {
        "id": 11021352,
        "name": "Character",
        "children": []
      },
      {
        "id": 11021350,
        "name": "Action Figure",
        "children": []
      },
      {
        "id": 11021348,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021670,
    "name": "Men's Bags & Accessories",
    "children": [
      {
        "id": 11021671,
        "name": "Hats & Caps",
        "children": []
      },
      {
        "id": 11021692,
        "name": "Wallets",
        "children": []
      },
      {
        "id": 11021688,
        "name": "Eyewear",
        "children": []
      },
      {
        "id": 11034474,
        "name": "Accessories",
        "children": []
      },
      {
        "id": 11021683,
        "name": "Jewelry",
        "children": []
      },
      {
        "id": 11021678,
        "name": "Watches",
        "children": []
      },
      {
        "id": 11021698,
        "name": "Men's Bags",
        "children": []
      },
      {
        "id": 11021704,
        "name": "Accessories Sets & Packages",
        "children": []
      }
    ]
  },
  {
    "id": 11021933,
    "name": "Women's Bags",
    "children": [
      {
        "id": 11021942,
        "name": "Shoulder Bags",
        "children": []
      },
      {
        "id": 11021948,
        "name": "Tote Bags",
        "children": []
      },
      {
        "id": 11021936,
        "name": "Handbags",
        "children": []
      },
      {
        "id": 11021952,
        "name": "Clutches",
        "children": []
      },
      {
        "id": 11021954,
        "name": "Backpacks",
        "children": []
      },
      {
        "id": 11021959,
        "name": "Drawstrings",
        "children": []
      },
      {
        "id": 11021960,
        "name": "Accessories",
        "children": []
      },
      {
        "id": 11021934,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021651,
    "name": "Men's Shoes",
    "children": [
      {
        "id": 11021654,
        "name": "Loafer & Boat Shoes",
        "children": []
      },
      {
        "id": 11021657,
        "name": "Sneakers",
        "children": []
      },
      {
        "id": 11044756,
        "name": "Sandals & Flip Flops",
        "children": []
      },
      {
        "id": 11021663,
        "name": "Boots",
        "children": []
      },
      {
        "id": 11021661,
        "name": "Formal",
        "children": []
      },
      {
        "id": 11021665,
        "name": "Shoe Care & Accessories",
        "children": []
      },
      {
        "id": 11021652,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11022093,
    "name": "Women Accessories",
    "children": [
      {
        "id": 11022099,
        "name": "Jewelry",
        "children": []
      },
      {
        "id": 11022122,
        "name": "Watches",
        "children": []
      },
      {
        "id": 11022115,
        "name": "Hair Accessories",
        "children": []
      },
      {
        "id": 11046319,
        "name": "Eyewear",
        "children": []
      },
      {
        "id": 11022142,
        "name": "Wallets & Pouches",
        "children": []
      },
      {
        "id": 11022109,
        "name": "Hats & Caps",
        "children": []
      },
      {
        "id": 11022128,
        "name": "Belts & Scarves",
        "children": []
      },
      {
        "id": 11022152,
        "name": "Gloves",
        "children": []
      },
      {
        "id": 11046323,
        "name": "Accessories Sets & Packages",
        "children": []
      },
      {
        "id": 11022148,
        "name": "Additional Accessories",
        "children": []
      },
      {
        "id": 11022145,
        "name": "Watch & Jewelry Organizers",
        "children": []
      },
      {
        "id": 11022094,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11020952,
    "name": "Motors",
    "children": [
      {
        "id": 11044690,
        "name": "Car Care & Detailing",
        "children": []
      },
      {
        "id": 11034592,
        "name": "Automotive Parts",
        "children": []
      },
      {
        "id": 11021031,
        "name": "Engine Parts",
        "children": []
      },
      {
        "id": 11021028,
        "name": "Ignition",
        "children": []
      },
      {
        "id": 11021024,
        "name": "Exterior Car Accessories",
        "children": []
      },
      {
        "id": 11021017,
        "name": "Oils, Coolants, & Fluids",
        "children": []
      },
      {
        "id": 11021005,
        "name": "Car Electronics",
        "children": []
      },
      {
        "id": 11021002,
        "name": "Moto Riding & Protective Gear",
        "children": []
      },
      {
        "id": 11020997,
        "name": "Tools & Garage",
        "children": []
      },
      {
        "id": 11020988,
        "name": "Motorcycle Accessories",
        "children": []
      },
      {
        "id": 11020975,
        "name": "Motorcycle & ATV Parts",
        "children": []
      },
      {
        "id": 11020955,
        "name": "Interior Car Accessories",
        "children": []
      },
      {
        "id": 11020953,
        "name": "Others",
        "children": []
      },
      {
        "id": 11105878,
        "name": "Motorcycles",
        "children": []
      }
    ]
  },
  {
    "id": 11022062,
    "name": "Women's Shoes",
    "children": [
      {
        "id": 11022065,
        "name": "Flats",
        "children": []
      },
      {
        "id": 11022076,
        "name": "Heels",
        "children": []
      },
      {
        "id": 11022082,
        "name": "Flip Flops",
        "children": []
      },
      {
        "id": 11022078,
        "name": "Sneakers",
        "children": []
      },
      {
        "id": 11022073,
        "name": "Wedges & Platforms",
        "children": []
      },
      {
        "id": 11034575,
        "name": "Boots",
        "children": []
      },
      {
        "id": 11034570,
        "name": "Shoe Care & Accessories",
        "children": []
      },
      {
        "id": 11022063,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11044709,
    "name": "Hobbies & Stationery",
    "children": [
      {
        "id": 11046763,
        "name": "E-Books",
        "children": []
      },
      {
        "id": 11046717,
        "name": "Books and Magazines",
        "children": []
      },
      {
        "id": 11044828,
        "name": "Paper Supplies",
        "children": []
      },
      {
        "id": 11044809,
        "name": "Writing Materials",
        "children": []
      },
      {
        "id": 11044799,
        "name": "Religious Artifacts",
        "children": []
      },
      {
        "id": 11044782,
        "name": "Packaging & Wrapping",
        "children": []
      },
      {
        "id": 11044757,
        "name": "Arts & Crafts",
        "children": []
      },
      {
        "id": 11044731,
        "name": "School & Office Supplies",
        "children": []
      },
      {
        "id": 11044712,
        "name": "Musical Instruments",
        "children": []
      },
      {
        "id": 11044710,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021881,
    "name": "Pet Care",
    "children": [
      {
        "id": 11044842,
        "name": "Toys & Accessories",
        "children": []
      },
      {
        "id": 11021900,
        "name": "Litter & Toilet",
        "children": []
      },
      {
        "id": 11021897,
        "name": "Pet Essentials",
        "children": []
      },
      {
        "id": 11021895,
        "name": "Pet Clothing & Accessories",
        "children": []
      },
      {
        "id": 11021892,
        "name": "Pet Grooming Supplies",
        "children": []
      },
      {
        "id": 11021888,
        "name": "Pet Toys & Accessories",
        "children": []
      },
      {
        "id": 11021884,
        "name": "Pet Food & Treats",
        "children": []
      },
      {
        "id": 11021882,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11021177,
    "name": "Gaming",
    "children": [
      {
        "id": 11021189,
        "name": "Computer Gaming",
        "children": []
      },
      {
        "id": 11021186,
        "name": "Mobile Gaming",
        "children": []
      },
      {
        "id": 11021180,
        "name": "Console Gaming",
        "children": []
      },
      {
        "id": 11021178,
        "name": "Others",
        "children": []
      }
    ]
  },
  {
    "id": 11115519,
    "name": "Audio",
    "children": [
      {
        "id": 11115524,
        "name": "Audio & Video Cables & Converters",
        "children": []
      },
      {
        "id": 11115539,
        "name": "Earphones, Headphones & Headsets",
        "children": []
      },
      {
        "id": 11115522,
        "name": "Amplifiers & Mixers",
        "children": []
      },
      {
        "id": 11115520,
        "name": "Speakers and Karaoke",
        "children": []
      },
      {
        "id": 11115533,
        "name": "Home Audio & Speakers",
        "children": []
      },
      {
        "id": 11115527,
        "name": "Media Players",
        "children": []
      }
    ]
  }
];

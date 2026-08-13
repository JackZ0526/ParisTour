import type { Place } from '../../../types'

function mapsUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/** Cafés, attractions, restaurants — each opens Google Maps for photos & ratings */
export const places: Record<string, Place> = {
  // —— Cafés ——
  'cafe-boots': {
    id: 'cafe-boots',
    name: 'Boot Café',
    nameLocal: 'Boot Café',
    type: 'cafe',
    description: '玛黑区极小精品咖啡馆，拿铁与简餐口碑稳定，适合抵达后第一杯咖啡提神。',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8612, lng: 2.3631 },
    googleMapsUrl: mapsUrl('Boot Café Paris'),
    durationHint: '40–60 分钟',
  },
  'cafe-kitsune': {
    id: 'cafe-kitsune',
    name: 'Café Kitsuné Palais Royal',
    type: 'cafe',
    description: '皇宫花园旁的日系咖啡馆，环境安静，适合作为西侧行程的起点。',
    ratingHint: 'Google ≈ 4.3',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8635, lng: 2.3369 },
    googleMapsUrl: mapsUrl('Café Kitsuné Palais Royal Paris'),
    durationHint: '45 分钟',
  },
  'cafe-haute': {
    id: 'cafe-haute',
    name: 'Ten Belles',
    type: 'cafe',
    description: 'Canal Saint-Martin 附近人气咖啡店，烘焙豆与轻食评价高，适合右岸生活感一天的开头。',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8726, lng: 2.3628 },
    googleMapsUrl: mapsUrl('Ten Belles Café Paris'),
    durationHint: '45 分钟',
  },
  'cafe-odette': {
    id: 'cafe-odette',
    name: 'Café de Flore',
    type: 'cafe',
    description: '圣日耳曼经典咖啡馆；偏游客，但位置与氛围适合左岸轻松日。也可换成隔壁 Les Deux Magots。',
    ratingHint: 'Google ≈ 4.1',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8541, lng: 2.3325 },
    googleMapsUrl: mapsUrl('Café de Flore Paris'),
    durationHint: '45–60 分钟',
  },
  'cafe-disney-start': {
    id: 'cafe-disney-start',
    name: 'Coutume Café',
    type: 'cafe',
    description: '出发去迪士尼前的精品咖啡；靠近地铁，吃完再坐 RER，避免乐园门口长队空腹。',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8478, lng: 2.3185 },
    googleMapsUrl: mapsUrl('Coutume Café Paris'),
    durationHint: '40 分钟',
  },
  'cafe-fontaine': {
    id: 'cafe-fontaine',
    name: 'Holybelly 5',
    type: 'cafe',
    description: '早午餐口碑极好的澳式咖啡馆，适合自驾日前好好吃一顿再去取车。',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8735, lng: 2.3639 },
    googleMapsUrl: mapsUrl('Holybelly 5 Paris'),
    durationHint: '60–75 分钟',
  },
  'cafe-depart': {
    id: 'cafe-depart',
    name: 'Fragments',
    type: 'cafe',
    description: '玛黑区高分小咖啡馆，返程日浅坐一杯即可，不要排太久队。',
    ratingHint: 'Google ≈ 4.6',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8605, lng: 2.3618 },
    googleMapsUrl: mapsUrl('Fragments Café Paris Marais'),
    durationHint: '30–45 分钟',
  },

  // —— Attractions ——
  'attr-arc': {
    id: 'attr-arc',
    name: '凯旋门',
    nameLocal: 'Arc de Triomphe',
    tripadvisorContentId: '188709',
    type: 'attraction',
    description: '可选择登顶俯瞰香街；地铁到 Charles de Gaulle–Étoile 出站即达，避免沿着香街从头走到尾。',
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8738, lng: 2.295 },
    googleMapsUrl: mapsUrl('Arc de Triomphe Paris'),
    durationHint: '60–90 分钟（含登顶）',
  },
  'attr-champs': {
    id: 'attr-champs',
    name: '香榭丽舍大街（中段）',
    nameLocal: 'Avenue des Champs-Élysées',
    tripadvisorContentId: '209760',
    type: 'attraction',
    description: '只走凯旋门到 Franklin D. Roosevelt 一段即可看街景与橱窗，整条走完会很累。',
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8698, lng: 2.3075 },
    googleMapsUrl: mapsUrl('Champs-Élysées Paris'),
    durationHint: '45–60 分钟',
  },
  'attr-monceau': {
    id: 'attr-monceau',
    name: '蒙索公园',
    nameLocal: 'Parc Monceau',
    type: 'attraction',
    description: '优雅英式园林，适合坐下休息；地铁直达，步行圈小。',
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8797, lng: 2.309 },
    googleMapsUrl: mapsUrl('Parc Monceau Paris'),
    durationHint: '45–60 分钟',
  },
  'attr-canal': {
    id: 'attr-canal',
    name: '圣马丁运河',
    nameLocal: 'Canal Saint-Martin',
    type: 'attraction',
    description: '沿岸咖啡馆与铁桥，秋季光线很好；沿河走一小段即可，不必拉长距离。',
    ratingHint: 'Google ≈ 4.5',
    image:
      'https://images.unsplash.com/photo-1522093007474-d86e9bf7ba6f?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8715, lng: 2.3658 },
    googleMapsUrl: mapsUrl('Canal Saint-Martin Paris'),
    durationHint: '60 分钟',
  },
  'attr-passages': {
    id: 'attr-passages',
    name: '有盖廊街（Passage des Panoramas 一带）',
    type: 'attraction',
    description: '19 世纪室内廊街，避雨且少走路，适合逛小店与拍建筑细节。',
    ratingHint: 'Google ≈ 4.4',
    image:
      'https://images.unsplash.com/photo-1520939817895-060bdaf4fe1b?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.871, lng: 2.3415 },
    googleMapsUrl: mapsUrl('Passage des Panoramas Paris'),
    durationHint: '45 分钟',
  },
  'attr-marais-walk': {
    id: 'attr-marais-walk',
    name: '玛黑区漫步（Place des Vosges）',
    type: 'attraction',
    description: '在孚日广场坐下或廊下走走，不安排大馆；广场周边地铁密集。',
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1471623432079-b009d30b6729?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8555, lng: 2.3655 },
    googleMapsUrl: mapsUrl('Place des Vosges Paris'),
    durationHint: '60 分钟',
  },
  'attr-luxembourg': {
    id: 'attr-luxembourg',
    name: '卢森堡公园',
    nameLocal: 'Jardin du Luxembourg',
    type: 'attraction',
    description: '秋天落叶很美，找椅子坐着比“打卡式逛完”更合适。',
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1549144511-f099e773c147?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8462, lng: 2.3372 },
    googleMapsUrl: mapsUrl('Jardin du Luxembourg Paris'),
    durationHint: '60–90 分钟',
  },
  'attr-ile': {
    id: 'attr-ile',
    name: '圣路易岛',
    nameLocal: 'Île Saint-Louis',
    type: 'attraction',
    description: '小岛街巷短而精致，买个冰淇淋或看看塞纳河即可，控制步行距离。',
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8515, lng: 2.3565 },
    googleMapsUrl: mapsUrl('Île Saint-Louis Paris'),
    durationHint: '45–60 分钟',
  },
  'attr-disney': {
    id: 'attr-disney',
    name: '巴黎迪士尼乐园',
    nameLocal: 'Disneyland Paris',
    type: 'attraction',
    description: 'RER A 到 Marne-la-Vallée–Chessy；建议早进园，傍晚错峰回城。门票请提前官网购买。',
    ratingHint: 'Google ≈ 4.5',
    image:
      'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8674, lng: 2.7838 },
    googleMapsUrl: mapsUrl('Disneyland Paris'),
    durationHint: '全天',
  },
  'attr-fontainebleau': {
    id: 'attr-fontainebleau',
    name: '枫丹白露宫',
    nameLocal: 'Château de Fontainebleau',
    type: 'attraction',
    description: '自驾日主景点，规模比凡尔赛更松弛；可再开去森林观景点短停。',
    ratingHint: 'Google ≈ 4.7',
    image:
      'https://images.unsplash.com/photo-1591289009723-aef0a1a8a04f?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.4021, lng: 2.7002 },
    googleMapsUrl: mapsUrl('Château de Fontainebleau'),
    durationHint: '2.5–3.5 小时',
  },
  'attr-forest': {
    id: 'attr-forest',
    name: '枫丹白露森林观景短停',
    type: 'attraction',
    description: '选一个靠近停车场的观景点（如 Franchard 一带）下车走走，控制在 45 分钟内。',
    ratingHint: 'Google ≈ 4.6',
    image:
      'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.408, lng: 2.655 },
    googleMapsUrl: mapsUrl('Forêt de Fontainebleau Franchard'),
    durationHint: '45 分钟',
  },
  'attr-cdg': {
    id: 'attr-cdg',
    name: '戴高乐机场 CDG',
    type: 'transport',
    description: '国际出发建议提前 3–3.5 小时到机场；RER B 或出租车/网约车皆可。',
    ratingHint: '—',
    image:
      'https://images.unsplash.com/photo-1436491865332-7a61a109cab0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 49.0097, lng: 2.5479 },
    googleMapsUrl: mapsUrl('Paris Charles de Gaulle Airport'),
    durationHint: '交通 45–70 分钟',
  },

  // —— Restaurants ——
  'rest-bouillon': {
    id: 'rest-bouillon',
    name: 'Bouillon Chartier Grands Boulevards',
    type: 'restaurant',
    description: '传统法式大众食堂，价格亲民、上菜快，适合抵达夜不折腾。',
    cuisine: '法餐 · 家常',
    ratingHint: 'Google ≈ 4.2',
    priceHint: '€',
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8722, lng: 2.3438 },
    googleMapsUrl: mapsUrl('Bouillon Chartier Grands Boulevards Paris'),
    durationHint: '60–75 分钟',
  },
  'rest-clown': {
    id: 'rest-clown',
    name: 'Le Petit Cler',
    type: 'restaurant',
    description: '七区小双人桌氛围的邻里小馆，适合凯旋门/香街后的轻松晚餐（需排队或早到）。',
    cuisine: '法餐 · 邻里菜',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.857, lng: 2.306 },
    googleMapsUrl: mapsUrl('Le Petit Cler Paris'),
    durationHint: '75 分钟',
  },
  'rest-east': {
    id: 'rest-east',
    name: 'East Mamma',
    type: 'restaurant',
    description: '人气意餐，披萨与意面份量大、评价稳定，不是法餐也能吃得很开心。',
    cuisine: '意餐',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8495, lng: 2.3778 },
    googleMapsUrl: mapsUrl('East Mamma Paris'),
    durationHint: '75 分钟',
  },
  'rest-laza': {
    id: 'rest-laza',
    name: 'Laza',
    type: 'restaurant',
    description: '现代中东菜，彩色拼盘适合分享，评分高且价位友好。',
    cuisine: '中东菜',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1529042410759-befb1204b468?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8658, lng: 2.3785 },
    googleMapsUrl: mapsUrl('Laza Restaurant Paris'),
    durationHint: '75 分钟',
  },
  'rest-asuka': {
    id: 'rest-asuka',
    name: 'Asuka',
    type: 'restaurant',
    description: '口碑很好的日料定食/寿司小店（位置以 Google Maps 为准），换换口味。',
    cuisine: '日料',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8685, lng: 2.342 },
    googleMapsUrl: mapsUrl('Asuka Restaurant Paris'),
    durationHint: '70 分钟',
  },
  'rest-breizh': {
    id: 'rest-breizh',
    name: 'Breizh Café – Marais',
    type: 'restaurant',
    description: '布列塔尼薄饼高分店，午餐很合适，不用正餐法餐也能很巴黎。',
    cuisine: '可丽饼 / 布列塔尼',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1506084868230-bb9d95c24759?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8568, lng: 2.3622 },
    googleMapsUrl: mapsUrl('Breizh Café Marais Paris'),
    durationHint: '60–75 分钟',
  },
  'rest-septime': {
    id: 'rest-septime',
    name: 'Le Servan',
    type: 'restaurant',
    description: '11 区高分现代小馆，价位相对友好（需订位）；若订不到可改附近邻里菜。',
    cuisine: '现代法餐',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.863, lng: 2.3805 },
    googleMapsUrl: mapsUrl('Le Servan Paris'),
    durationHint: '90 分钟',
  },
  'rest-fish': {
    id: 'rest-fish',
    name: 'Clamato',
    type: 'restaurant',
    description: '海鲜小食风格、气氛轻松，适合左岸日晚餐；不接受复杂正餐仪式感。',
    cuisine: '海鲜 / 小食',
    ratingHint: 'Google ≈ 4.4',
    priceHint: '€€€',
    image:
      'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8532, lng: 2.3808 },
    googleMapsUrl: mapsUrl('Clamato Paris'),
    durationHint: '75–90 分钟',
  },
  'rest-neige': {
    id: 'rest-neige',
    name: 'Hai Kai',
    type: 'restaurant',
    description: '创意亚洲风味，评分高，适合不想连续吃法餐的夜晚。',
    cuisine: '亚洲融合',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1553621042-f6e147245754?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8652, lng: 2.3675 },
    googleMapsUrl: mapsUrl('Hai Kai Paris'),
    durationHint: '75 分钟',
  },
  'rest-disney': {
    id: 'rest-disney',
    name: '迪士尼小镇简餐 / 回城后邻里晚餐',
    type: 'restaurant',
    description: '乐园内可选 Disney Village 轻松用餐；若早回城，可在酒店附近任选评分 4.3+ 的餐厅。',
    cuisine: '综合',
    ratingHint: '以 Google Maps 当日为准',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8695, lng: 2.782 },
    googleMapsUrl: mapsUrl('Disney Village Disneyland Paris restaurants'),
    durationHint: '60–90 分钟',
  },
  'rest-fontaine-town': {
    id: 'rest-fontaine-town',
    name: 'La Petite Menuiserie（枫丹白露镇）',
    type: 'restaurant',
    description: '小镇高分邻里餐厅示例；出发前用 Google Maps 确认当日营业与座位。',
    cuisine: '法餐 · 小镇',
    ratingHint: 'Google ≈ 4.5',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1466978913421-dad2ebd01d17?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.4045, lng: 2.7018 },
    googleMapsUrl: mapsUrl('La Petite Menuiserie Fontainebleau'),
    durationHint: '75 分钟',
  },
  'rest-return-eve': {
    id: 'rest-return-eve',
    name: 'Hotel 附近轻松晚餐',
    type: 'restaurant',
    description: '自驾还车后不奔波，在酒店 10–15 分钟地铁圈内找 Google 评分 4.4+ 的餐厅即可。',
    cuisine: '随缘高分',
    ratingHint: '打开地图按评分筛选',
    priceHint: '€€',
    image:
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8578, lng: 2.3595 },
    googleMapsUrl: mapsUrl('restaurants near Le Marais Paris'),
    durationHint: '60–75 分钟',
  },
  'rest-early': {
    id: 'rest-early',
    name: '抵达日轻食 / 酒店附近',
    type: 'restaurant',
    description: '倒时差第一天建议早吃早睡；可选 Bouillon 或酒店步行 5 分钟内的高分小馆。',
    cuisine: '轻食 / 法式家常',
    ratingHint: 'Google ≈ 4.2+',
    priceHint: '€–€€',
    image:
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80',
    location: { lat: 48.8578, lng: 2.3595 },
    googleMapsUrl: mapsUrl('Bouillon Chartier Paris'),
    durationHint: '45–60 分钟',
  },
}

export function getPlace(id: string, customPlaces: Record<string, Place> = {}): Place {
  const place = customPlaces[id] || places[id]
  if (!place) {
    throw new Error(`Unknown place: ${id}`)
  }
  return place
}

export function listCatalogPlaces(): Place[] {
  return Object.values(places)
}

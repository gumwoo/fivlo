const mongoose = require('mongoose');
const ShopItem = require('../models/ShopItem');
const logger = require('../utils/logger');

/**
 * 기본 상점 아이템 데이터
 */
const defaultShopItems = [
  // 상의 아이템
  {
    name: '기본 티셔츠',
    description: '오분이의 기본 티셔츠입니다.',
    category: 'top',
    type: 'clothing',
    price: 10,
    rarity: 'common',
    imageUrl: '/images/items/basic-tshirt.png',
    isActive: true
  },
  {
    name: '후드 티셔츠',
    description: '따뜻한 후드 티셔츠입니다.',
    category: 'top',
    type: 'clothing',
    price: 25,
    rarity: 'common',
    imageUrl: '/images/items/hoodie.png',
    isActive: true
  },
  {
    name: '정장 셔츠',
    description: '멋진 정장 셔츠입니다.',
    category: 'top',
    type: 'clothing',
    price: 50,
    rarity: 'rare',
    imageUrl: '/images/items/suit-shirt.png',
    isActive: true
  },
  {
    name: '슈퍼히어로 코스튬',
    description: '강력한 슈퍼히어로 코스튬입니다.',
    category: 'top',
    type: 'special',
    price: 100,
    rarity: 'epic',
    imageUrl: '/images/items/superhero-costume.png',
    isActive: true
  },
  
  // 하의 아이템
  {
    name: '기본 바지',
    description: '오분이의 기본 바지입니다.',
    category: 'bottom',
    type: 'clothing',
    price: 8,
    rarity: 'common',
    imageUrl: '/images/items/basic-pants.png',
    isActive: true
  },
  {
    name: '청바지',
    description: '시원한 청바지입니다.',
    category: 'bottom',
    type: 'clothing',
    price: 20,
    rarity: 'common',
    imageUrl: '/images/items/jeans.png',
    isActive: true
  },
  {
    name: '정장 바지',
    description: '고급 정장 바지입니다.',
    category: 'bottom',
    type: 'clothing',
    price: 40,
    rarity: 'rare',
    imageUrl: '/images/items/suit-pants.png',
    isActive: true
  },
  {
    name: '스포츠 팬츠',
    description: '운동하기 좋은 스포츠 팬츠입니다.',
    category: 'bottom',
    type: 'sport',
    price: 30,
    rarity: 'common',
    imageUrl: '/images/items/sport-pants.png',
    isActive: true
  },
  
  // 액세서리 아이템
  {
    name: '기본 모자',
    description: '심플한 기본 모자입니다.',
    category: 'accessory',
    type: 'hat',
    price: 15,
    rarity: 'common',
    imageUrl: '/images/items/basic-hat.png',
    isActive: true
  },
  {
    name: '야구 모자',
    description: '스포티한 야구 모자입니다.',
    category: 'accessory',
    type: 'hat',
    price: 25,
    rarity: 'common',
    imageUrl: '/images/items/baseball-cap.png',
    isActive: true
  },
  {
    name: '왕관',
    description: '화려한 황금 왕관입니다.',
    category: 'accessory',
    type: 'special',
    price: 150,
    rarity: 'legendary',
    imageUrl: '/images/items/crown.png',
    isActive: true
  },
  {
    name: '선글라스',
    description: '멋진 선글라스입니다.',
    category: 'accessory',
    type: 'glasses',
    price: 35,
    rarity: 'rare',
    imageUrl: '/images/items/sunglasses.png',
    isActive: true
  },
  {
    name: '목도리',
    description: '따뜻한 목도리입니다.',
    category: 'accessory',
    type: 'scarf',
    price: 20,
    rarity: 'common',
    imageUrl: '/images/items/scarf.png',
    isActive: true
  },
  
  // 배경 아이템
  {
    name: '기본 배경',
    description: '심플한 기본 배경입니다.',
    category: 'background',
    type: 'simple',
    price: 0,
    rarity: 'common',
    imageUrl: '/images/backgrounds/basic.png',
    isActive: true
  },
  {
    name: '자연 배경',
    description: '아름다운 자연 풍경 배경입니다.',
    category: 'background',
    type: 'nature',
    price: 30,
    rarity: 'common',
    imageUrl: '/images/backgrounds/nature.png',
    isActive: true
  },
  {
    name: '도시 배경',
    description: '화려한 도시 야경 배경입니다.',
    category: 'background',
    type: 'city',
    price: 45,
    rarity: 'rare',
    imageUrl: '/images/backgrounds/city.png',
    isActive: true
  },
  {
    name: '우주 배경',
    description: '신비로운 우주 배경입니다.',
    category: 'background',
    type: 'space',
    price: 80,
    rarity: 'epic',
    imageUrl: '/images/backgrounds/space.png',
    isActive: true
  },
  {
    name: '무지개 배경',
    description: '환상적인 무지개 배경입니다.',
    category: 'background',
    type: 'fantasy',
    price: 120,
    rarity: 'legendary',
    imageUrl: '/images/backgrounds/rainbow.png',
    isActive: true
  }
];

/**
 * 기본 상점 아이템 생성 함수
 */
async function seedShopItems() {
  try {
    logger.info('기본 상점 아이템 생성 시작...');
    
    // 기존 아이템 확인
    const existingCount = await ShopItem.countDocuments();
    if (existingCount > 0) {
      logger.info(`이미 ${existingCount}개의 상점 아이템이 존재합니다. 스킵합니다.`);
      return;
    }
    
    // 아이템 생성
    const createdItems = await ShopItem.insertMany(defaultShopItems);
    
    logger.info(`✅ ${createdItems.length}개의 기본 상점 아이템이 생성되었습니다.`);
    
    // 카테고리별 통계
    const stats = await ShopItem.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } }
    ]);
    
    logger.info('카테고리별 아이템 수:');
    stats.forEach(stat => {
      logger.info(`  - ${stat._id}: ${stat.count}개`);
    });
    
  } catch (error) {
    logger.error('기본 상점 아이템 생성 실패:', error);
    throw error;
  }
}

/**
 * 특정 아이템 추가 함수
 */
async function addShopItem(itemData) {
  try {
    const item = new ShopItem(itemData);
    await item.save();
    logger.info(`새 상점 아이템 추가: ${item.name}`);
    return item;
  } catch (error) {
    logger.error('상점 아이템 추가 실패:', error);
    throw error;
  }
}

/**
 * 상점 아이템 업데이트 함수
 */
async function updateShopItem(itemId, updateData) {
  try {
    const item = await ShopItem.findByIdAndUpdate(
      itemId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!item) {
      throw new Error('상점 아이템을 찾을 수 없습니다');
    }
    
    logger.info(`상점 아이템 업데이트: ${item.name}`);
    return item;
  } catch (error) {
    logger.error('상점 아이템 업데이트 실패:', error);
    throw error;
  }
}

/**
 * 상점 아이템 삭제 (비활성화) 함수
 */
async function deleteShopItem(itemId) {
  try {
    const item = await ShopItem.findByIdAndUpdate(
      itemId,
      { isActive: false },
      { new: true }
    );
    
    if (!item) {
      throw new Error('상점 아이템을 찾을 수 없습니다');
    }
    
    logger.info(`상점 아이템 삭제: ${item.name}`);
    return item;
  } catch (error) {
    logger.error('상점 아이템 삭제 실패:', error);
    throw error;
  }
}

module.exports = {
  seedShopItems,
  addShopItem,
  updateShopItem,
  deleteShopItem,
  defaultShopItems
};

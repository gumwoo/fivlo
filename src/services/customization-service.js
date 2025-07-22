const UserInventory = require('../models/UserInventory');
const ShopItem = require('../models/ShopItem');
const CoinTransaction = require('../models/CoinTransaction');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * 커스터마이징 서비스
 * 오분이 아이템 구매, 착용, 관리 기능 제공
 */
class CustomizationService {
  /**
   * 사용자 인벤토리 조회
   */
  async getUserInventory(userId) {
    try {
      logger.info(`사용자 인벤토리 조회 시작: ${userId}`);
      
      const inventory = await UserInventory.findOrCreateByUserId(userId);
      
      await inventory.populate([
        {
          path: 'items.itemId',
          select: 'name category type price imageUrl rarity'
        },
        {
          path: 'equippedItems.top',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.bottom',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.accessory',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.background',
          select: 'name category type imageUrl'
        }
      ]);
      
      const stats = inventory.getItemStats();
      
      logger.info(`사용자 인벤토리 조회 완료: ${userId}, 보유 아이템: ${stats.totalItems}개`);
      
      return {
        inventory,
        stats,
        equippedItems: inventory.getEquippedItems()
      };
      
    } catch (error) {
      logger.error(`사용자 인벤토리 조회 실패: ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 상점 아이템 목록 조회
   */
  async getShopItems(userId, filters = {}) {
    try {
      logger.info(`상점 아이템 조회 시작: ${userId}`);
      
      const { category, type, rarity, page = 1, limit = 20 } = filters;
      
      // 필터 조건 구성
      const query = { isActive: true };
      if (category) query.category = category;
      if (type) query.type = type;
      if (rarity) query.rarity = rarity;
      
      // 페이지네이션 설정
      const skip = (page - 1) * limit;
      
      // 상점 아이템 조회
      const [items, totalCount] = await Promise.all([
        ShopItem.find(query)
          .sort({ category: 1, price: 1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        ShopItem.countDocuments(query)
      ]);
      
      // 사용자 인벤토리 조회
      const inventory = await UserInventory.findOne({ userId });
      const ownedItemIds = inventory ? inventory.items.map(item => item.itemId.toString()) : [];
      
      // 아이템에 소유 여부 추가
      const itemsWithOwnership = items.map(item => ({
        ...item,
        isOwned: ownedItemIds.includes(item._id.toString())
      }));
      
      logger.info(`상점 아이템 조회 완료: ${items.length}개`);
      
      return {
        items: itemsWithOwnership,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      logger.error(`상점 아이템 조회 실패: ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 아이템 구매
   */
  async purchaseItem(userId, itemId) {
    try {
      logger.info(`아이템 구매 시작: 사용자=${userId}, 아이템=${itemId}`);
      
      const result = await UserInventory.purchaseItem(userId, itemId);
      
      logger.info(`아이템 구매 완료: 사용자=${userId}, 아이템=${itemId}, 잔여코인=${result.remainingCoins}`);
      
      return result;
      
    } catch (error) {
      logger.error(`아이템 구매 실패: 사용자=${userId}, 아이템=${itemId}`, error);
      throw error;
    }
  }
  
  /**
   * 아이템 착용
   */
  async equipItem(userId, itemId) {
    try {
      logger.info(`아이템 착용 시작: 사용자=${userId}, 아이템=${itemId}`);
      
      const inventory = await UserInventory.findOne({ userId });
      if (!inventory) {
        throw new Error('사용자 인벤토리를 찾을 수 없습니다');
      }
      
      await inventory.equipItem(itemId);
      
      // 착용된 아이템 정보와 함께 반환
      await inventory.populate([
        {
          path: 'equippedItems.top',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.bottom',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.accessory',
          select: 'name category type imageUrl'
        },
        {
          path: 'equippedItems.background',
          select: 'name category type imageUrl'
        }
      ]);
      
      logger.info(`아이템 착용 완료: 사용자=${userId}, 아이템=${itemId}`);
      
      return {
        equippedItems: inventory.getEquippedItems(),
        message: '아이템이 착용되었습니다'
      };
      
    } catch (error) {
      logger.error(`아이템 착용 실패: 사용자=${userId}, 아이템=${itemId}`, error);
      throw error;
    }
  }
  
  /**
   * 아이템 착용 해제
   */
  async unequipItem(userId, category) {
    try {
      logger.info(`아이템 착용 해제 시작: 사용자=${userId}, 카테고리=${category}`);
      
      const inventory = await UserInventory.findOne({ userId });
      if (!inventory) {
        throw new Error('사용자 인벤토리를 찾을 수 없습니다');
      }
      
      await inventory.unequipItem(category);
      
      logger.info(`아이템 착용 해제 완료: 사용자=${userId}, 카테고리=${category}`);
      
      return {
        equippedItems: inventory.getEquippedItems(),
        message: '아이템 착용이 해제되었습니다'
      };
      
    } catch (error) {
      logger.error(`아이템 착용 해제 실패: 사용자=${userId}, 카테고리=${category}`, error);
      throw error;
    }
  }
  
  /**
   * 사용자 코인 조회
   */
  async getUserCoins(userId) {
    try {
      logger.info(`사용자 코인 조회: ${userId}`);
      
      const user = await User.findById(userId).select('coins');
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다');
      }
      
      return {
        coins: user.coins
      };
      
    } catch (error) {
      logger.error(`사용자 코인 조회 실패: ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 코인 거래 내역 조회
   */
  async getCoinTransactions(userId, filters = {}) {
    try {
      logger.info(`코인 거래 내역 조회: ${userId}`);
      
      const { type, page = 1, limit = 20 } = filters;
      
      // 필터 조건 구성
      const query = { userId };
      if (type) query.type = type;
      
      // 페이지네이션 설정
      const skip = (page - 1) * limit;
      
      const [transactions, totalCount] = await Promise.all([
        CoinTransaction.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate({
            path: 'relatedId',
            select: 'name imageUrl',
            model: 'ShopItem'
          })
          .lean(),
        CoinTransaction.countDocuments(query)
      ]);
      
      logger.info(`코인 거래 내역 조회 완료: ${transactions.length}개`);
      
      return {
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      };
      
    } catch (error) {
      logger.error(`코인 거래 내역 조회 실패: ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 오분이 현재 모습 조회 (홈화면용)
   */
  async getObuniAppearance(userId) {
    try {
      logger.info(`오분이 모습 조회: ${userId}`);
      
      const inventory = await UserInventory.findOne({ userId });
      
      if (!inventory) {
        // 기본 오분이 모습 반환
        return {
          appearance: {
            top: null,
            bottom: null,
            accessory: null,
            background: null
          },
          isDefault: true
        };
      }
      
      await inventory.populate([
        {
          path: 'equippedItems.top',
          select: 'name imageUrl'
        },
        {
          path: 'equippedItems.bottom',
          select: 'name imageUrl'
        },
        {
          path: 'equippedItems.accessory',
          select: 'name imageUrl'
        },
        {
          path: 'equippedItems.background',
          select: 'name imageUrl'
        }
      ]);
      
      logger.info(`오분이 모습 조회 완료: ${userId}`);
      
      return {
        appearance: inventory.getEquippedItems(),
        isDefault: false
      };
      
    } catch (error) {
      logger.error(`오분이 모습 조회 실패: ${userId}`, error);
      throw error;
    }
  }
  
  /**
   * 인벤토리 통계 조회
   */
  async getInventoryStats(userId) {
    try {
      logger.info(`인벤토리 통계 조회: ${userId}`);
      
      const inventory = await UserInventory.findOne({ userId });
      
      if (!inventory) {
        return {
          totalItems: 0,
          totalSpent: 0,
          equippedCount: 0,
          unequippedCount: 0,
          categoryStats: {
            top: 0,
            bottom: 0,
            accessory: 0,
            background: 0
          }
        };
      }
      
      const stats = inventory.getItemStats();
      
      // 카테고리별 통계 계산
      await inventory.populate('items.itemId', 'category');
      
      const categoryStats = inventory.items.reduce((acc, item) => {
        if (item.itemId && item.itemId.category) {
          acc[item.itemId.category] = (acc[item.itemId.category] || 0) + 1;
        }
        return acc;
      }, {
        top: 0,
        bottom: 0,
        accessory: 0,
        background: 0
      });
      
      logger.info(`인벤토리 통계 조회 완료: ${userId}`);
      
      return {
        ...stats,
        categoryStats
      };
      
    } catch (error) {
      logger.error(`인벤토리 통계 조회 실패: ${userId}`, error);
      throw error;
    }
  }
}

module.exports = new CustomizationService();

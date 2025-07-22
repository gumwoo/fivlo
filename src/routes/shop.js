/**
 * 커스터마이징 상점 API 라우터 v2.0
 * PDF 기획서 기반 새로운 API 명세 구현 - 오분이 Avatar 시스템
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, premiumMiddleware } = require('../middleware/auth');
const customizationService = require('../services/customization-service');
const coinService = require('../services/coinService');
const logger = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   name: Shop
 *   description: 커스터마이징 상점 시스템 (Premium 전용)
 */

// 11.1 상점 아이템 목록 (잠금 표시)
router.get('/items', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`상점 아이템 목록 조회 요청`, { userId });

    const items = await customizationService.getShopItems(userId);
    
    logger.info(`상점 아이템 목록 조회 완료`, { 
      userId, 
      itemCount: items.length 
    });

    res.json({
      items: items.map(item => ({
        id: item._id,
        name: item.name,
        category: item.category,
        price: item.price,
        imageUrl: item.imageUrl,
        owned: item.owned || false,
        locked: false // Premium 사용자는 모든 아이템 잠금 해제
      }))
    });

  } catch (error) {
    logger.error('상점 아이템 목록 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '상점 아이템 목록을 불러오는데 실패했습니다.'
    });
  }
});

// 11.2 아이템 구매 → 코인 차감
router.post('/purchase', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.body;
    
    logger.info(`아이템 구매 요청`, { userId, itemId });

    if (!itemId) {
      return res.status(400).json({
        error: '아이템 ID는 필수 항목입니다.'
      });
    }

    const purchaseResult = await customizationService.purchaseItem(userId, itemId);
    
    logger.info(`아이템 구매 완료`, { 
      userId, 
      itemId, 
      coinSpent: purchaseResult.coinSpent,
      remainingCoins: purchaseResult.remainingCoins 
    });

    res.json({
      success: true,
      coinSpent: purchaseResult.coinSpent,
      remainingCoins: purchaseResult.remainingCoins,
      item: {
        id: purchaseResult.item._id,
        name: purchaseResult.item.name,
        category: purchaseResult.item.category
      }
    });

  } catch (error) {
    logger.error('아이템 구매 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      itemId: req.body?.itemId 
    });
    
    if (error.message.includes('코인이 부족')) {
      return res.status(402).json({
        error: '코인이 부족합니다.'
      });
    }
    
    if (error.message.includes('이미 구매')) {
      return res.status(400).json({
        error: '이미 구매한 아이템입니다.'
      });
    }
    
    res.status(500).json({
      error: '아이템 구매에 실패했습니다.'
    });
  }
});

// 11.3 보유 아이템 조회
router.get('/inventory', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`보유 아이템 조회 요청`, { userId });

    const inventory = await customizationService.getUserInventory(userId);
    
    logger.info(`보유 아이템 조회 완료`, { 
      userId, 
      itemCount: inventory.items.length 
    });

    res.json({
      items: inventory.items.map(item => ({
        id: item.itemId,
        name: item.name,
        category: item.category,
        equipped: item.equipped,
        acquiredAt: item.acquiredAt
      }))
    });

  } catch (error) {
    logger.error('보유 아이템 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '보유 아이템 목록을 불러오는데 실패했습니다.'
    });
  }
});

// 11.4 아이템 착용
router.post('/inventory/equip', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.body;
    
    logger.info(`아이템 착용 요청`, { userId, itemId });

    if (!itemId) {
      return res.status(400).json({
        error: '아이템 ID는 필수 항목입니다.'
      });
    }

    await customizationService.equipItem(userId, itemId);
    
    logger.info(`아이템 착용 완료`, { userId, itemId });

    res.json({
      message: '아이템이 성공적으로 착용되었습니다.',
      equippedItemId: itemId
    });

  } catch (error) {
    logger.error('아이템 착용 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      itemId: req.body?.itemId 
    });
    
    res.status(500).json({
      error: '아이템 착용에 실패했습니다.'
    });
  }
});

// 11.5 아이템 해제
router.post('/inventory/unequip', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { itemId } = req.body;
    
    logger.info(`아이템 해제 요청`, { userId, itemId });

    if (!itemId) {
      return res.status(400).json({
        error: '아이템 ID는 필수 항목입니다.'
      });
    }

    await customizationService.unequipItem(userId, itemId);
    
    logger.info(`아이템 해제 완료`, { userId, itemId });

    res.json({
      message: '아이템이 성공적으로 해제되었습니다.',
      unequippedItemId: itemId
    });

  } catch (error) {
    logger.error('아이템 해제 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      itemId: req.body?.itemId 
    });
    
    res.status(500).json({
      error: '아이템 해제에 실패했습니다.'
    });
  }
});

// 11.6 현재 오분이 모습 (홈 노출)
router.get('/avatar', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const isPremium = req.user.subscriptionStatus === 'premium';
    
    logger.info(`오분이 모습 조회 요청`, { userId, isPremium });

    if (isPremium) {
      // Premium 사용자는 커스터마이징된 오분이
      const avatar = await customizationService.getUserAvatar(userId);
      const coins = await coinService.getCoinBalance(userId);
      
      logger.info(`오분이 모습 조회 완료 (Premium)`, { userId, equippedItemsCount: avatar.equippedItems.length });

      res.json({
        avatar: {
          baseCharacter: "오분이",
          equippedItems: avatar.equippedItems.map(item => ({
            category: item.category,
            name: item.name,
            imageUrl: item.imageUrl
          })),
          totalCoins: coins.balance
        }
      });
    } else {
      // 무료 사용자는 기본 오분이
      logger.info(`오분이 모습 조회 완료 (Free)`, { userId });

      res.json({
        avatar: {
          baseCharacter: "오분이",
          equippedItems: [],
          totalCoins: 0,
          message: "Premium으로 업그레이드하여 오분이를 꾸며보세요!"
        }
      });
    }

  } catch (error) {
    logger.error('오분이 모습 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '오분이 모습을 불러오는데 실패했습니다.'
    });
  }
});

module.exports = router;

/**
 * @swagger
 * tags:
 *   name: Customization
 *   description: 오분이 커스터마이징 및 상점
 */

const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const customizationService = require('../services/customization-service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * /api/customization/inventory:
 *   get:
 *     summary: 사용자 인벤토리 조회
 *     tags: [Customization]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 인벤토리 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     ownedItems:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ShopItem'
 *                     equippedItems:
 *                       type: object
 *                       properties:
 *                         top:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         bottom:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         accessory:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         background:
 *                           $ref: '#/components/schemas/ShopItem'
 *                     totalItems:
 *                       type: integer
 *                       example: 15
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/inventory', authenticateToken, async (req, res) => {
  try {
    logger.info(`인벤토리 조회 요청: ${req.user.id}`);
    
    const result = await customizationService.getUserInventory(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('인벤토리 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/customization/shop:
 *   get:
 *     summary: 상점 아이템 목록 조회
 *     tags: [Customization]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         required: false
 *         description: 아이템 카테고리 필터
 *         schema:
 *           type: string
 *           enum: [top, bottom, accessory, background]
 *       - in: query
 *         name: type
 *         required: false
 *         description: 아이템 타입 필터
 *         schema:
 *           type: string
 *       - in: query
 *         name: rarity
 *         required: false
 *         description: 아이템 희귀도 필터
 *         schema:
 *           type: string
 *           enum: [common, rare, epic, legendary]
 *       - in: query
 *         name: page
 *         required: false
 *         description: 페이지 번호 (기본값 1)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         description: 페이지당 아이템 수 (기본값 20)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 20
 *     responses:
 *       200:
 *         description: 상점 아이템 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         allOf:
 *                           - $ref: '#/components/schemas/ShopItem'
 *                           - type: object
 *                             properties:
 *                               canPurchase:
 *                                 type: boolean
 *                                 example: true
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 5
 *                         totalItems:
 *                           type: integer
 *                           example: 87
 *                         hasNext:
 *                           type: boolean
 *                           example: true
 *                     userCoins:
 *                       type: integer
 *                       example: 150
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/shop', authenticateToken, async (req, res) => {
  try {
    logger.info(`상점 아이템 조회 요청: ${req.user.id}`);
    
    const filters = {
      category: req.query.category,
      type: req.query.type,
      rarity: req.query.rarity,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };
    
    const result = await customizationService.getShopItems(req.user.id, filters);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('상점 아이템 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/customization/purchase:
 *   post:
 *     summary: 아이템 구매
 *     tags: [Customization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *             properties:
 *               itemId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 아이템 구매 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 아이템을 성공적으로 구매했습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     item:
 *                       $ref: '#/components/schemas/ShopItem'
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         itemId:
 *                           type: string
 *                         cost:
 *                           type: integer
 *                           example: 50
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                     remainingCoins:
 *                       type: integer
 *                       example: 100
 *       400:
 *         description: 잘못된 요청 (아이템 ID 누락, 코인 부족 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 아이템을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/purchase', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: '아이템 ID가 필요합니다'
      });
    }
    
    logger.info(`아이템 구매 요청: 사용자=${req.user.id}, 아이템=${itemId}`);
    
    const result = await customizationService.purchaseItem(req.user.id, itemId);
    
    res.json({
      success: true,
      data: result,
      message: '아이템 구매가 완료되었습니다'
    });
    
  } catch (error) {
    logger.error('아이템 구매 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/customization/equip:
 *   post:
 *     summary: 아이템 착용
 *     tags: [Customization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - itemId
 *             properties:
 *               itemId:
 *                 type: string
 *                 example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 아이템 착용 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 아이템을 성공적으로 착용했습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     equippedItem:
 *                       $ref: '#/components/schemas/ShopItem'
 *                     previousItem:
 *                       oneOf:
 *                         - $ref: '#/components/schemas/ShopItem'
 *                         - type: "null"
 *                     currentAppearance:
 *                       type: object
 *                       properties:
 *                         top:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         bottom:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         accessory:
 *                           $ref: '#/components/schemas/ShopItem'
 *                         background:
 *                           $ref: '#/components/schemas/ShopItem'
 *       400:
 *         description: 잘못된 요청 (아이템 ID 누락, 미보유 아이템 등)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: 아이템을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/equip', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({
        success: false,
        message: '아이템 ID가 필요합니다'
      });
    }
    
    logger.info(`아이템 착용 요청: 사용자=${req.user.id}, 아이템=${itemId}`);
    
    const result = await customizationService.equipItem(req.user.id, itemId);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('아이템 착용 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/customization/unequip:
 *   post:
 *     summary: 아이템 착용 해제
 *     tags: [Customization]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category
 *             properties:
 *               category:
 *                 type: string
 *                 enum: [top, bottom, accessory, background]
 *                 example: top
 *     responses:
 *       200:
 *         description: 아이템 해제 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: 아이템을 성공적으로 해제했습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     unequippedItem:
 *                       $ref: '#/components/schemas/ShopItem'
 *                     currentAppearance:
 *                       type: object
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/unequip', authenticateToken, async (req, res) => {
  try {
    const { category } = req.body;
    
    if (!category) {
      return res.status(400).json({
        success: false,
        message: '카테고리가 필요합니다'
      });
    }
    
    logger.info(`아이템 착용 해제 요청: 사용자=${req.user.id}, 카테고리=${category}`);
    
    const result = await customizationService.unequipItem(req.user.id, category);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('아이템 착용 해제 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/customization/coins
 * @desc 사용자 코인 조회
 * @access Private
 */
router.get('/coins', authenticateToken, async (req, res) => {
  try {
    logger.info(`코인 조회 요청: ${req.user.id}`);
    
    const result = await customizationService.getUserCoins(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('코인 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/customization/transactions
 * @desc 코인 거래 내역 조회
 * @access Private
 */
router.get('/transactions', authenticateToken, async (req, res) => {
  try {
    logger.info(`코인 거래 내역 조회 요청: ${req.user.id}`);
    
    const filters = {
      type: req.query.type,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20
    };
    
    const result = await customizationService.getCoinTransactions(req.user.id, filters);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('코인 거래 내역 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/customization/appearance
 * @desc 오분이 현재 모습 조회 (홈화면용)
 * @access Private
 */
router.get('/appearance', authenticateToken, async (req, res) => {
  try {
    logger.info(`오분이 모습 조회 요청: ${req.user.id}`);
    
    const result = await customizationService.getObuniAppearance(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('오분이 모습 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/customization/stats
 * @desc 인벤토리 통계 조회
 * @access Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    logger.info(`인벤토리 통계 조회 요청: ${req.user.id}`);
    
    const result = await customizationService.getInventoryStats(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('인벤토리 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/customization/shop/categories
 * @desc 상점 카테고리 목록 조회
 * @access Private
 */
router.get('/shop/categories', authenticateToken, async (req, res) => {
  try {
    logger.info(`상점 카테고리 조회 요청: ${req.user.id}`);
    
    const categories = [
      { value: 'top', label: '상의', description: '오분이의 상의 아이템' },
      { value: 'bottom', label: '하의', description: '오분이의 하의 아이템' },
      { value: 'accessory', label: '액세서리', description: '오분이의 액세서리' },
      { value: 'background', label: '배경', description: '홈화면 배경' }
    ];
    
    const rarities = [
      { value: 'common', label: '일반', color: '#6B7280' },
      { value: 'rare', label: '레어', color: '#3B82F6' },
      { value: 'epic', label: '에픽', color: '#8B5CF6' },
      { value: 'legendary', label: '전설', color: '#F59E0B' }
    ];
    
    res.json({
      success: true,
      data: {
        categories,
        rarities
      }
    });
    
  } catch (error) {
    logger.error('상점 카테고리 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

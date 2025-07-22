const express = require('express');
const { body, query, validationResult } = require('express-validator');
const coinService = require('../services/coinService');
const { authenticateToken } = require('../middleware/auth');
const { requirePremiumFeature, PREMIUM_FEATURES } = require('../middleware/premiumMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Coins
 *   description: 코인 시스템 관리 (Premium 기능)
 */

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('코인 API 유효성 검사 실패', { 
      errors: errors.array(),
      url: req.originalUrl,
      userId: req.user?.id
    });
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: errors.array()
    });
  }
  next();
};

/**
 * @swagger
 * /api/coins:
 *   get:
 *     summary: 코인 잔액 조회
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 코인 잔액 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 balance:
 *                   type: integer
 *                   description: 현재 코인 잔액
 *                 totalEarned:
 *                   type: integer
 *                   description: 총 획득 코인
 *                 totalSpent:
 *                   type: integer
 *                   description: 총 사용 코인
 *       402:
 *         description: Premium 구독 필요
 */
router.get('/',
  authenticateToken,
  requirePremiumFeature(PREMIUM_FEATURES.COINS),
  async (req, res) => {
    try {
      const userId = req.user.id;

      logger.info('코인 잔액 조회', { userId });

      const coinData = await coinService.getCoinBalance(userId);

      res.json({
        success: true,
        balance: coinData.balance,
        totalEarned: coinData.totalEarned,
        totalSpent: coinData.totalSpent
      });

    } catch (error) {
      logger.error('코인 잔액 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: 'COIN_BALANCE_FAILED',
        message: '코인 잔액 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/coins/transactions:
 *   get:
 *     summary: 코인 거래 내역 조회
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 페이지당 항목 수
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [earn, spend, all]
 *           default: all
 *         description: 거래 유형 필터
 *     responses:
 *       200:
 *         description: 거래 내역 조회 성공
 */
router.get('/transactions',
  authenticateToken,
  requirePremiumFeature(PREMIUM_FEATURES.COINS),
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .toInt()
      .withMessage('페이지는 1 이상의 정수여야 합니다.'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .toInt()
      .withMessage('limit은 1-100 사이의 정수여야 합니다.'),
    query('type')
      .optional()
      .isIn(['earn', 'spend', 'all'])
      .withMessage('올바른 거래 유형을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type = 'all' } = req.query;

      logger.info('코인 거래 내역 조회', { 
        userId, 
        page, 
        limit, 
        type 
      });

      const transactions = await coinService.getCoinTransactions(userId, {
        page,
        limit,
        type
      });

      res.json({
        success: true,
        transactions: transactions.data,
        pagination: {
          page,
          limit,
          total: transactions.total,
          totalPages: Math.ceil(transactions.total / limit)
        }
      });

    } catch (error) {
      logger.error('코인 거래 내역 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: 'TRANSACTIONS_FAILED',
        message: '거래 내역 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/coins/earn:
 *   post:
 *     summary: 코인 적립 (자동 트리거)
 *     description: |
 *       다음 상황에서 자동으로 호출됩니다:
 *       - 포모도로 1 사이클 완료
 *       - 하루 모든 Task 완료 
 *       - 망각방지 알림 전체 완료
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - amount
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [pomodoro_complete, task_all_done, reminder_all_checked]
 *                 description: 코인 적립 사유
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *                 description: 적립할 코인 수
 *     responses:
 *       200:
 *         description: 코인 적립 성공
 */
router.post('/earn',
  authenticateToken,
  requirePremiumFeature(PREMIUM_FEATURES.COINS),
  [
    body('reason')
      .isIn(['pomodoro_complete', 'task_all_done', 'reminder_all_checked'])
      .withMessage('올바른 적립 사유를 선택해주세요.'),
    body('amount')
      .isInt({ min: 1 })
      .withMessage('적립 코인은 1개 이상이어야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reason, amount } = req.body;
      const userId = req.user.id;

      logger.info('코인 적립 요청', { 
        userId, 
        reason, 
        amount 
      });

      const result = await coinService.earnCoins(userId, {
        reason,
        amount,
        metadata: {
          timestamp: new Date(),
          ip: req.ip,
          userAgent: req.get('User-Agent')
        }
      });

      logger.info('코인 적립 성공', { 
        userId, 
        reason, 
        amount,
        newBalance: result.newBalance
      });

      res.json({
        success: true,
        message: `${amount}개 코인이 적립되었습니다.`,
        coinEarned: amount,
        newBalance: result.newBalance,
        reason: result.reasonDisplay
      });

    } catch (error) {
      logger.error('코인 적립 오류:', error);

      if (error.message === 'DAILY_LIMIT_EXCEEDED') {
        return res.status(429).json({
          success: false,
          error: 'DAILY_LIMIT_EXCEEDED',
          message: '오늘 해당 활동에 대한 코인 적립 한도에 도달했습니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'COIN_EARN_FAILED',
        message: '코인 적립 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/coins/spend:
 *   post:
 *     summary: 코인 소모 (커스터마이징 아이템 구매)
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *               - itemId
 *               - amount
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [item_purchase]
 *                 description: 코인 사용 사유
 *               itemId:
 *                 type: string
 *                 description: 구매할 아이템 ID
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *                 description: 소모할 코인 수
 *     responses:
 *       200:
 *         description: 코인 소모 성공
 */
router.post('/spend',
  authenticateToken,
  requirePremiumFeature(PREMIUM_FEATURES.COINS),
  [
    body('reason')
      .equals('item_purchase')
      .withMessage('현재는 아이템 구매만 지원됩니다.'),
    body('itemId')
      .notEmpty()
      .withMessage('아이템 ID가 필요합니다.'),
    body('amount')
      .isInt({ min: 1 })
      .withMessage('소모 코인은 1개 이상이어야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { reason, itemId, amount } = req.body;
      const userId = req.user.id;

      logger.info('코인 소모 요청', { 
        userId, 
        reason, 
        itemId, 
        amount 
      });

      const result = await coinService.spendCoins(userId, {
        reason,
        itemId,
        amount,
        metadata: {
          timestamp: new Date(),
          ip: req.ip
        }
      });

      logger.info('코인 소모 성공', { 
        userId, 
        itemId, 
        amount,
        newBalance: result.newBalance
      });

      res.json({
        success: true,
        message: `${amount}개 코인을 사용했습니다.`,
        coinSpent: amount,
        newBalance: result.newBalance,
        item: result.item
      });

    } catch (error) {
      logger.error('코인 소모 오류:', error);

      if (error.message === 'INSUFFICIENT_COINS') {
        return res.status(400).json({
          success: false,
          error: 'INSUFFICIENT_COINS',
          message: '코인이 부족합니다.'
        });
      }

      if (error.message === 'ITEM_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'ITEM_NOT_FOUND',
          message: '존재하지 않는 아이템입니다.'
        });
      }

      if (error.message === 'ITEM_ALREADY_OWNED') {
        return res.status(409).json({
          success: false,
          error: 'ITEM_ALREADY_OWNED',
          message: '이미 보유하고 있는 아이템입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'COIN_SPEND_FAILED',
        message: '코인 소모 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/coins/stats:
 *   get:
 *     summary: 코인 통계 조회
 *     tags: [Coins]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [week, month, year]
 *           default: month
 *         description: 통계 기간
 *     responses:
 *       200:
 *         description: 코인 통계 조회 성공
 */
router.get('/stats',
  authenticateToken,
  requirePremiumFeature(PREMIUM_FEATURES.COINS),
  [
    query('period')
      .optional()
      .isIn(['week', 'month', 'year'])
      .withMessage('올바른 통계 기간을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = 'month' } = req.query;

      logger.info('코인 통계 조회', { userId, period });

      const stats = await coinService.getCoinStats(userId, period);

      res.json({
        success: true,
        period,
        stats: {
          totalEarned: stats.totalEarned,
          totalSpent: stats.totalSpent,
          netGain: stats.totalEarned - stats.totalSpent,
          dailyAverage: stats.dailyAverage,
          topEarningSources: stats.topEarningSources,
          spendingBreakdown: stats.spendingBreakdown,
          trends: stats.trends
        }
      });

    } catch (error) {
      logger.error('코인 통계 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: 'COIN_STATS_FAILED',
        message: '코인 통계 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

module.exports = router;

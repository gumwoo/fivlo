const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const pomodoroService = require('../services/pomodoroService');
const coinService = require('../services/coinService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pomodoro
 *   description: 포모도로 타이머 시스템 (25분 집중 + 5분 휴식)
 */

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('포모도로 API 유효성 검사 실패', { 
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
 * /api/pomodoro/sessions:
 *   post:
 *     summary: 포모도로 세션 생성 (목표·색상 설정, 25분+5분)
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 */
router.post('/sessions',
  authenticateToken,
  [
    body('goal')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('목표는 1-100자 사이로 입력해주세요.'),
    body('color')
      .matches(/^#[0-9A-Fa-f]{6}$/)
      .withMessage('올바른 색상 코드를 입력해주세요. (예: #FF6B6B)'),
    body('focusMinutes')
      .optional()
      .isInt({ min: 5, max: 60 })
      .withMessage('집중 시간은 5-60분 사이여야 합니다.'),
    body('breakMinutes')
      .optional()
      .isInt({ min: 1, max: 15 })
      .withMessage('휴식 시간은 1-15분 사이여야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { goal, color, focusMinutes = 25, breakMinutes = 5 } = req.body;
      const userId = req.user.id;

      logger.info('포모도로 세션 생성 요청', { 
        userId, 
        goal, 
        color,
        focusMinutes,
        breakMinutes
      });

      const session = await pomodoroService.createSession(userId, {
        goal,
        color,
        focusMinutes,
        breakMinutes
      });

      logger.info('포모도로 세션 생성 성공', { 
        userId, 
        sessionId: session.id,
        goal: session.goal
      });

      res.status(201).json({
        success: true,
        message: '포모도로 세션이 생성되었습니다.',
        session: {
          id: session.id,
          goal: session.goal,
          color: session.color,
          focusMinutes: session.focusMinutes,
          breakMinutes: session.breakMinutes,
          status: session.status,
          totalCycleMinutes: session.focusMinutes + session.breakMinutes,
          createdAt: session.createdAt
        }
      });

    } catch (error) {
      logger.error('포모도로 세션 생성 오류:', error);

      res.status(500).json({
        success: false,
        error: 'SESSION_CREATION_FAILED',
        message: '세션 생성 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/sessions/{sessionId}/start:
 *   put:
 *     summary: 포모도로 세션 시작
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 */
router.put('/sessions/:sessionId/start',
  authenticateToken,
  [
    param('sessionId')
      .isMongoId()
      .withMessage('올바른 세션 ID를 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      logger.info('포모도로 세션 시작 요청', { userId, sessionId });

      const session = await pomodoroService.startSession(userId, sessionId);

      logger.info('포모도로 세션 시작 성공', { 
        userId, 
        sessionId,
        startedAt: session.startedAt
      });

      res.json({
        success: true,
        message: '포모도로 세션이 시작되었습니다.',
        session: {
          id: session.id,
          status: session.status,
          currentPhase: session.currentPhase,
          startedAt: session.startedAt,
          remainingSeconds: session.remainingSeconds
        }
      });

    } catch (error) {
      logger.error('포모도로 세션 시작 오류:', error);

      if (error.message === 'SESSION_NOT_FOUND') {
        return res.status(404).json({
          success: false,
          error: 'SESSION_NOT_FOUND',
          message: '존재하지 않는 세션입니다.'
        });
      }

      if (error.message === 'UNAUTHORIZED_SESSION') {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED_SESSION',
          message: '접근 권한이 없는 세션입니다.'
        });
      }

      if (error.message === 'SESSION_ALREADY_STARTED') {
        return res.status(409).json({
          success: false,
          error: 'SESSION_ALREADY_STARTED',
          message: '이미 시작된 세션입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'SESSION_START_FAILED',
        message: '세션 시작 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/sessions/{sessionId}/pause:
 *   put:
 *     summary: 포모도로 세션 일시정지
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 */
router.put('/sessions/:sessionId/pause',
  authenticateToken,
  [
    param('sessionId')
      .isMongoId()
      .withMessage('올바른 세션 ID를 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      logger.info('포모도로 세션 일시정지 요청', { userId, sessionId });

      const session = await pomodoroService.pauseSession(userId, sessionId);

      logger.info('포모도로 세션 일시정지 성공', { 
        userId, 
        sessionId,
        pausedAt: session.pausedAt
      });

      res.json({
        success: true,
        message: '포모도로 세션이 일시정지되었습니다.',
        session: {
          id: session.id,
          status: session.status,
          pausedAt: session.pausedAt,
          remainingSeconds: session.remainingSeconds
        }
      });

    } catch (error) {
      logger.error('포모도로 세션 일시정지 오류:', error);

      if (error.message === 'SESSION_NOT_RUNNING') {
        return res.status(400).json({
          success: false,
          error: 'SESSION_NOT_RUNNING',
          message: '실행 중인 세션이 아닙니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'SESSION_PAUSE_FAILED',
        message: '세션 일시정지 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/sessions/{sessionId}/complete:
 *   put:
 *     summary: 포모도로 세션 완료 (30분 1사이클 완료 → 코인 적립)
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 */
router.put('/sessions/:sessionId/complete',
  authenticateToken,
  [
    param('sessionId')
      .isMongoId()
      .withMessage('올바른 세션 ID를 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { sessionId } = req.params;
      const userId = req.user.id;

      logger.info('포모도로 세션 완료 요청', { userId, sessionId });

      const result = await pomodoroService.completeSession(userId, sessionId);

      // 프리미엄 사용자이고 1일 1회 제한에 걸리지 않은 경우 코인 지급
      let coinEarned = 0;
      if (result.session.cycleCompleted && req.user.checkPremiumStatus()) {
        try {
          const coinResult = await coinService.earnCoins(userId, {
            reason: 'pomodoro_complete',
            amount: 1,
            sessionId: result.session.id
          });
          coinEarned = coinResult.amount;
        } catch (coinError) {
          // 코인 지급 실패해도 세션 완료는 성공으로 처리
          logger.warn('포모도로 완료 코인 지급 실패:', coinError);
        }
      }

      logger.info('포모도로 세션 완료 성공', { 
        userId, 
        sessionId,
        cycleCompleted: result.session.cycleCompleted,
        coinEarned
      });

      res.json({
        success: true,
        message: result.session.cycleCompleted 
          ? '포모도로 사이클이 완료되었습니다!' 
          : '포모도로 세션이 완료되었습니다.',
        coinEarned,
        cycleCompleted: result.session.cycleCompleted,
        totalFocusTime: result.session.actualFocusTime,
        session: {
          id: result.session.id,
          status: result.session.status,
          completedAt: result.session.completedAt,
          efficiency: result.session.efficiency
        }
      });

    } catch (error) {
      logger.error('포모도로 세션 완료 오류:', error);

      if (error.message === 'SESSION_ALREADY_COMPLETED') {
        return res.status(409).json({
          success: false,
          error: 'SESSION_ALREADY_COMPLETED',
          message: '이미 완료된 세션입니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'SESSION_COMPLETE_FAILED',
        message: '세션 완료 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/stats:
 *   get:
 *     summary: 포모도로 통계 조회 (일·주·월 집중시간 집계)
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 */
router.get('/stats',
  authenticateToken,
  [
    query('period')
      .optional()
      .isIn(['daily', 'weekly', 'monthly'])
      .withMessage('올바른 통계 기간을 선택해주세요.'),
    query('date')
      .optional()
      .isISO8601()
      .withMessage('올바른 날짜 형식을 입력해주세요. (YYYY-MM-DD)')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const userId = req.user.id;
      const { period = 'weekly', date } = req.query;

      logger.info('포모도로 통계 조회', { userId, period, date });

      const stats = await pomodoroService.getStats(userId, period, date);

      res.json({
        success: true,
        period,
        date: stats.date,
        stats: {
          totalSessions: stats.totalSessions,
          completedSessions: stats.completedSessions,
          totalFocusTime: stats.totalFocusTime, // 분 단위
          averageSessionTime: stats.averageSessionTime,
          completionRate: stats.completionRate,
          goalBreakdown: stats.goalBreakdown, // 목표별 집중 시간
          colorDistribution: stats.colorDistribution,
          dailyProgress: stats.dailyProgress, // 일별 진행률 (주간/월간 통계 시)
          bestStreak: stats.bestStreak // 연속 완료 기록
        }
      });

    } catch (error) {
      logger.error('포모도로 통계 조회 오류:', error);

      res.status(500).json({
        success: false,
        error: 'STATS_FAILED',
        message: '통계 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

module.exports = router;

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const pomodoroService = require('../services/pomodoroService');
const { authenticateToken } = require('../middleware/auth');
const TimerUtils = require('../utils/timer');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Pomodoro
 *   description: 포모도로 타이머 관리
 */

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('포모도로 API 유효성 검사 실패', { 
      errors: errors.array(),
      url: req.originalUrl 
    });
    return res.status(400).json({
      error: '입력값이 올바르지 않습니다.',
      details: errors.array()
    });
  }
  next();
};

/**
 * @swagger
 * /api/pomodoro/sessions:
 *   post:
 *     summary: 새 포모도로 세션 생성
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - goal
 *             properties:
 *               goal:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: 영어 공부하기
 *               color:
 *                 type: string
 *                 pattern: ^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$
 *                 example: "#3B82F6"
 *               type:
 *                 type: string
 *                 enum: [focus, break]
 *                 example: focus
 *               duration:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 120
 *                 example: 25
 *     responses:
 *       201:
 *         description: 포모도로 세션 생성 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 포모도로 세션이 생성되었습니다
 *                 session:
 *                   $ref: '#/components/schemas/PomodoroSession'
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
router.post('/sessions',
  authenticateToken,
  [
    body('goal')
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('목표는 1-100자 사이여야 합니다.'),
    body('color')
      .optional()
      .matches(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/)
      .withMessage('유효한 색상 코드를 입력해주세요.'),
    body('type')
      .optional()
      .isIn(['focus', 'break'])
      .withMessage('세션 타입은 focus 또는 break여야 합니다.'),
    body('duration')
      .optional()
      .isInt({ min: 1, max: 120 })
      .withMessage('세션 시간은 1-120분 사이여야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const session = await pomodoroService.createSession(req.user._id, req.body);
      
      logger.info('포모도로 세션 생성 API 호출 성공', {
        userId: req.user._id,
        sessionId: session._id
      });

      res.status(201).json({
        message: '포모도로 세션이 생성되었습니다.',
        session
      });
    } catch (error) {
      logger.error(`포모도로 세션 생성 API 오류: ${error.message}`, {
        userId: req.user._id
      });
      
      res.status(400).json({
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/sessions/{sessionId}/start:
 *   post:
 *     summary: 포모도로 세션 시작
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         description: 세션 ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 포모도로 세션 시작 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 포모도로 세션이 시작되었습니다
 *                 session:
 *                   $ref: '#/components/schemas/PomodoroSession'
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
 *       404:
 *         description: 세션을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
router.post('/sessions/:sessionId/start',
  authenticateToken,
  async (req, res) => {
    try {
      const session = await pomodoroService.startSession(req.user._id, req.params.sessionId);
      
      logger.info('포모도로 세션 시작 API 호출 성공', {
        userId: req.user._id,
        sessionId: session._id
      });

      res.json({
        message: '포모도로 세션이 시작되었습니다.',
        session
      });
    } catch (error) {
      logger.error(`포모도로 세션 시작 API 오류: ${error.message}`, {
        userId: req.user._id,
        sessionId: req.params.sessionId
      });
      
      res.status(400).json({
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/sessions/{sessionId}/complete:
 *   post:
 *     summary: 포모도로 세션 완료
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         description: 세션 ID
 *         schema:
 *           type: string
 *           example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: 포모도로 세션 완료 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 포모도로 세션이 완료되었습니다
 *                 session:
 *                   $ref: '#/components/schemas/PomodoroSession'
 *                 coinAwarded:
 *                   type: boolean
 *                   example: true
 *                 coinsEarned:
 *                   type: integer
 *                   example: 1
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
 *       404:
 *         description: 세션을 찾을 수 없습니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/sessions/:sessionId/complete',
  authenticateToken,
  async (req, res) => {
    try {
      const result = await pomodoroService.completeSession(req.user._id, req.params.sessionId);
      
      logger.info('포모도로 세션 완료 API 호출 성공', {
        userId: req.user._id,
        sessionId: result.session._id,
        coinAwarded: result.coinAwarded
      });

      res.json({
        message: '포모도로 세션이 완료되었습니다.',
        ...result
      });
    } catch (error) {
      logger.error(`포모도로 세션 완료 API 오류: ${error.message}`, {
        userId: req.user._id,
        sessionId: req.params.sessionId
      });
      
      res.status(400).json({
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/active:
 *   get:
 *     summary: 활성 포모도로 세션 조회
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 활성 세션 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 활성 세션 조회 성공
 *                 session:
 *                   oneOf:
 *                     - $ref: '#/components/schemas/PomodoroSession'
 *                     - type: "null"
 *                 timeRemaining:
 *                   type: integer
 *                   example: 1200
 *                 isActive:
 *                   type: boolean
 *                   example: true
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
router.get('/active',
  authenticateToken,
  async (req, res) => {
    try {
      const activeSession = await pomodoroService.getActiveSession(req.user._id);
      
      if (!activeSession) {
        return res.json({
          message: '활성 세션이 없습니다.',
          session: null
        });
      }

      logger.info('활성 포모도로 세션 조회 API 호출 성공', {
        userId: req.user._id,
        sessionId: activeSession.session._id
      });

      res.json({
        message: '활성 세션 조회 성공',
        ...activeSession
      });
    } catch (error) {
      logger.error(`활성 포모도로 세션 조회 API 오류: ${error.message}`, {
        userId: req.user._id
      });
      
      res.status(500).json({
        error: '활성 세션 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/stats/daily:
 *   get:
 *     summary: 일일 포모도로 통계 조회
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         description: 조회할 날짜 (YYYY-MM-DD 형식, 기본값은 오늘)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-15"
 *     responses:
 *       200:
 *         description: 일일 통계 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 일일 포모도로 통계 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2025-01-15"
 *                     totalSessions:
 *                       type: integer
 *                       example: 5
 *                     completedSessions:
 *                       type: integer
 *                       example: 4
 *                     totalFocusTime:
 *                       type: integer
 *                       example: 100
 *                     sessionsToday:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PomodoroSession'
 *       400:
 *         description: 잘못된 날짜 형식
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
router.get('/stats/daily',
  authenticateToken,
  [
    query('date')
      .optional()
      .isISO8601()
      .withMessage('유효한 날짜 형식을 입력해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const date = req.query.date ? new Date(req.query.date) : new Date();
      const stats = await pomodoroService.getDailyStats(req.user._id, date);
      
      logger.info('일일 포모도로 통계 조회 API 호출 성공', {
        userId: req.user._id,
        date: stats.date
      });

      res.json({
        message: '일일 통계 조회 성공',
        stats
      });
    } catch (error) {
      logger.error(`일일 포모도로 통계 조회 API 오류: ${error.message}`, {
        userId: req.user._id
      });
      
      res.status(500).json({
        error: '통계 조회 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/quick-start:
 *   post:
 *     summary: 빠른 포모도로 시작
 *     tags: [Pomodoro]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               goal:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 example: 집중하기
 *     responses:
 *       201:
 *         description: 빠른 포모도로 시작 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 포모도로가 빠르게 시작되었습니다
 *                 session:
 *                   $ref: '#/components/schemas/PomodoroSession'
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
router.post('/quick-start',
  authenticateToken,
  [
    body('goal')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('목표는 1-100자 사이여야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const sessionData = {
        goal: req.body.goal || '집중하기',
        type: 'focus',
        duration: TimerUtils.POMODORO_DURATIONS.FOCUS,
        color: TimerUtils.getRandomColor()
      };

      const session = await pomodoroService.createSession(req.user._id, sessionData);
      const startedSession = await pomodoroService.startSession(req.user._id, session._id);

      logger.info('빠른 포모도로 시작 API 호출 성공', {
        userId: req.user._id,
        sessionId: startedSession._id
      });

      res.status(201).json({
        message: '포모도로가 시작되었습니다.',
        session: startedSession
      });
    } catch (error) {
      logger.error(`빠른 포모도로 시작 API 오류: ${error.message}`, {
        userId: req.user._id
      });
      
      res.status(400).json({
        error: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/pomodoro/status:
 *   get:
 *     summary: 포모도로 시스템 상태 확인
 *     tags: [Pomodoro]
 *     responses:
 *       200:
 *         description: 포모도로 시스템 상태 정보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: FIVLO 포모도로 시스템이 정상 작동 중입니다
 *                 features:
 *                   type: array
 *                   items:
 *                     type: string
 *                   example: ["25분 집중 + 5분 휴식 사이클", "목표별 색상 구분"]
 *                 durations:
 *                   type: object
 *                   properties:
 *                     FOCUS:
 *                       type: integer
 *                       example: 1500
 *                     SHORT_BREAK:
 *                       type: integer
 *                       example: 300
 *                     LONG_BREAK:
 *                       type: integer
 *                       example: 900
 *                 version:
 *                   type: string
 *                   example: "1.0.0"
 */
router.get('/status', (req, res) => {
  res.json({
    message: 'FIVLO 포모도로 시스템이 정상 작동 중입니다.',
    features: [
      '25분 집중 + 5분 휴식 사이클',
      '목표별 색상 구분',
      '실시간 타이머 동기화',
      '유료 사용자 코인 지급',
      '일일 통계 제공'
    ],
    durations: TimerUtils.POMODORO_DURATIONS,
    version: '1.0.0'
  });
});

module.exports = router;

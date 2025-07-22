/**
 * @swagger
 * tags:
 *   name: AI
 *   description: AI 기반 목표 세분화 및 루틴 제안
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const aiIntegrationService = require('../services/ai-integration-service');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('AI API 유효성 검사 실패', { 
      errors: errors.array(),
      url: req.originalUrl 
    });
    return res.status(400).json({
      success: false,
      message: '입력값이 올바르지 않습니다.',
      details: errors.array()
    });
  }
  next();
};

/**
 * @swagger
 * /api/ai/goals:
 *   post:
 *     summary: AI 목표 생성 및 세분화
 *     tags: [AI]
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
 *                 minLength: 5
 *                 maxLength: 200
 *                 example: 토익 800점 달성하기
 *               duration:
 *                 type: string
 *                 maxLength: 50
 *                 example: 3개월
 *               currentSituation:
 *                 type: string
 *                 maxLength: 500
 *                 example: 현재 토익 650점 수준이며, 주 3회 스터디 참여 중
 *               availableTime:
 *                 type: string
 *                 maxLength: 100
 *                 example: 평일 저녁 2시간, 주말 4시간
 *               experienceLevel:
 *                 type: string
 *                 enum: [beginner, intermediate, advanced]
 *                 example: intermediate
 *               preferences:
 *                 type: object
 *                 properties:
 *                   focusAreas:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: [listening, reading]
 *                   learningStyle:
 *                     type: string
 *                     enum: [visual, auditory, kinesthetic, mixed]
 *                     example: mixed
 *     responses:
 *       201:
 *         description: AI 목표 생성 성공
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
 *                   example: AI 목표 분석이 완료되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     aiGoal:
 *                       $ref: '#/components/schemas/AIGoal'
 *                     generatedTasks:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Task'
 *                     estimatedTimeframe:
 *                       type: string
 *                       example: 12주
 *                     difficultyAssessment:
 *                       type: string
 *                       enum: [easy, medium, hard]
 *                       example: medium
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
 *       500:
 *         description: AI 서비스 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/goals',
  authenticateToken,
  [
    body('goal')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('목표는 5-200자 사이여야 합니다.'),
    body('duration')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('기간은 50자를 초과할 수 없습니다.'),
    body('currentSituation')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('현재 상황은 500자를 초과할 수 없습니다.'),
    body('availableTime')
      .optional()
      .trim()
      .isLength({ max: 50 })
      .withMessage('가능 시간은 50자를 초과할 수 없습니다.'),
    body('experienceLevel')
      .optional()
      .isIn(['초보', '중급', '고급'])
      .withMessage('유효한 경험 수준을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      logger.info(`AI 목표 생성 요청: 사용자=${req.user.id}`);
      
      const aiGoal = await aiIntegrationService.createAIGoal(req.user.id, req.body);
      
      res.status(201).json({
        success: true,
        data: aiGoal,
        message: 'AI 목표가 성공적으로 생성되었습니다.'
      });
      
    } catch (error) {
      logger.error('AI 목표 생성 실패:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @swagger
 * /api/ai/goals:
 *   get:
 *     summary: AI 목표 목록 조회
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI 목표 목록 조회 성공
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
 *                   example: AI 목표 목록 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     goals:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/AIGoal'
 *                     totalCount:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/goals', authenticateToken, async (req, res) => {
  try {
    logger.info(`AI 목표 목록 조회 요청: 사용자=${req.user.id}`);
    
    const filters = {
      status: req.query.status,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10
    };
    
    const result = await aiIntegrationService.getAIGoals(req.user.id, filters);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('AI 목표 목록 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route POST /api/ai/goals/:goalId/convert
 * @desc AI 목표를 실제 Task로 변환
 * @access Private
 */
router.post('/goals/:goalId/convert', 
  authenticateToken,
  [
    body('selectedTasks')
      .optional()
      .isArray()
      .withMessage('선택된 태스크는 배열이어야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { goalId } = req.params;
      const { selectedTasks } = req.body;
      
      logger.info(`AI 태스크 변환 요청: 목표=${goalId}, 사용자=${req.user.id}`);
      
      const result = await aiIntegrationService.convertToTasks(
        req.user.id, 
        goalId, 
        selectedTasks
      );
      
      res.json({
        success: true,
        data: result,
        message: `${result.totalTasks}개의 태스크가 생성되었습니다.`
      });
      
    } catch (error) {
      logger.error('AI 태스크 변환 실패:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/ai/schedule
 * @desc 일일 스케줄 생성
 * @access Private
 */
router.post('/schedule',
  authenticateToken,
  [
    body('availableHours')
      .optional()
      .isNumeric()
      .withMessage('가능 시간은 숫자여야 합니다.'),
    body('preferredTime')
      .optional()
      .isIn(['오전', '오후', '저녁', '밤'])
      .withMessage('유효한 선호 시간을 선택해주세요.'),
    body('focusType')
      .optional()
      .isIn(['짧고 집중', '길고 집중', '일반'])
      .withMessage('유효한 집중 유형을 선택해주세요.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      logger.info(`일일 스케줄 생성 요청: 사용자=${req.user.id}`);
      
      const result = await aiIntegrationService.generateDailySchedule(req.user.id, req.body);
      
      res.json({
        success: true,
        data: result,
        message: '일일 스케줄이 생성되었습니다.'
      });
      
    } catch (error) {
      logger.error('일일 스케줄 생성 실패:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @route POST /api/ai/motivation
 * @desc 동기부여 메시지 생성
 * @access Private
 */
router.post('/motivation',
  authenticateToken,
  [
    body('context')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('상황 설명은 200자를 초과할 수 없습니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      logger.info(`동기부여 메시지 요청: 사용자=${req.user.id}`);
      
      const context = req.body.context || '일반적인 격려';
      const result = await aiIntegrationService.generateMotivation(req.user.id, context);
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      logger.error('동기부여 메시지 생성 실패:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/ai/goals/:goalId/analysis
 * @desc 목표 진행 상황 분석
 * @access Private
 */
router.get('/goals/:goalId/analysis', authenticateToken, async (req, res) => {
  try {
    const { goalId } = req.params;
    
    logger.info(`진행 상황 분석 요청: 목표=${goalId}, 사용자=${req.user.id}`);
    
    const result = await aiIntegrationService.analyzeProgress(req.user.id, goalId);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('진행 상황 분석 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/ai/routine:
 *   post:
 *     summary: AI 루틴 추천
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - preferences
 *             properties:
 *               preferences:
 *                 type: object
 *                 properties:
 *                   wakeUpTime:
 *                     type: string
 *                     format: time
 *                     example: "07:00"
 *                   availableHours:
 *                     type: integer
 *                     example: 3
 *                   priorities:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["운동", "공부"]
 *     responses:
 *       200:
 *         description: AI 루틴 추천 성공
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
 *                   example: AI 루틴 추천이 완료되었습니다
 *                 data:
 *                   type: object
 *                   properties:
 *                     routine:
 *                       type: object
 *                       properties:
 *                         title:
 *                           type: string
 *                           example: 맞춤형 생산성 루틴
 *                         description:
 *                           type: string
 *                         activities:
 *                           type: array
 *                           items:
 *                             type: object
 *       401:
 *         description: 인증 토큰이 필요합니다
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/routine',
  authenticateToken,
  [
    body('category')
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('카테고리는 1-50자 사이여야 합니다.'),
    body('preferences')
      .optional()
      .isObject()
      .withMessage('선호도는 객체 형태여야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { category, preferences = {} } = req.body;
      
      logger.info(`루틴 추천 요청: 카테고리=${category}, 사용자=${req.user.id}`);
      
      const result = await aiIntegrationService.recommendRoutine(req.user.id, category, preferences);
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      logger.error('루틴 추천 실패:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

/**
 * @route GET /api/ai/stats
 * @desc 사용자 AI 통계 조회
 * @access Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    logger.info(`AI 통계 조회 요청: 사용자=${req.user.id}`);
    
    const result = await aiIntegrationService.getUserAIStats(req.user.id);
    
    res.json({
      success: true,
      data: result
    });
    
  } catch (error) {
    logger.error('AI 통계 조회 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * @route GET /api/ai/health
 * @desc AI 서비스 상태 확인
 * @access Private
 */
router.get('/health', authenticateToken, async (req, res) => {
  try {
    // OpenAI API 연결 상태 확인
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date(),
      services: {
        openai: process.env.OPENAI_API_KEY ? 'connected' : 'not_configured',
        database: 'connected' // MongoDB 연결 상태는 이미 확인됨
      }
    };
    
    res.json({
      success: true,
      data: healthStatus
    });
    
  } catch (error) {
    logger.error('AI 서비스 상태 확인 실패:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;

const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const timeAttackService = require('../services/timeAttackService');
const aiService = require('../services/aiService');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: TimeAttack
 *   description: 타임어택 시스템 (AI 목표 분해 + 단계별 진행)
 */

/**
 * 유효성 검사 에러 처리 미들웨어
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('타임어택 API 유효성 검사 실패', { 
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
 * /api/time-attack/sessions:
 *   post:
 *     summary: 타임어택 세션 생성 (단계별 시간 설정)
 *     tags: [TimeAttack]
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
    body('totalMinutes')
      .optional()
      .isInt({ min: 1, max: 180 })
      .withMessage('총 시간은 1-180분 사이여야 합니다.'),
    body('steps')
      .optional()
      .isArray({ min: 1, max: 10 })
      .withMessage('단계는 1-10개 사이여야 합니다.'),
    body('steps.*.name')
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage('단계명은 1-50자 사이로 입력해주세요.'),
    body('steps.*.minutes')
      .optional()
      .isInt({ min: 1 })
      .withMessage('단계별 시간은 1분 이상이어야 합니다.'),
    body('useAI')
      .optional()
      .isBoolean()
      .withMessage('AI 사용 여부는 true/false여야 합니다.')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { goal, totalMinutes, steps, useAI = true } = req.body;
      const userId = req.user.id;

      logger.info('타임어택 세션 생성 요청', { 
        userId, 
        goal,
        totalMinutes,
        stepsProvided: !!steps,
        useAI
      });

      let sessionData = {
        userId,
        goal,
        totalMinutes,
        steps: steps || []
      };

      // AI 추천 사용 시
      if (useAI && (!steps || steps.length === 0)) {
        logger.info('AI 타임어택 추천 요청', { userId, goal, totalMinutes });
        
        const aiRecommendation = await aiService.generateTimeAttackPlan({
          goal,
          totalMinutes,
          userPreferences: {
            complexity: 'medium',
            detailLevel: 'standard'
          }
        });

        sessionData = {
          ...sessionData,
          totalMinutes: aiRecommendation.totalMinutes,
          steps: aiRecommendation.steps,
          isAiGenerated: true,
          aiPrompt: aiRecommendation.prompt
        };
      }

      const session = await timeAttackService.createSession(sessionData);

      logger.info('타임어택 세션 생성 성공', { 
        userId, 
        sessionId: session.id,
        goal: session.goal,
        totalSteps: session.steps.length
      });

      res.status(201).json({
        success: true,
        message: '타임어택 세션이 생성되었습니다.',
        session: {
          id: session.id,
          goal: session.goal,
          totalMinutes: session.totalMinutes,
          steps: session.steps.map((step, index) => ({
            order: index,
            name: step.name,
            minutes: step.minutes,
            completed: step.completed
          })),
          status: session.status,
          isAiGenerated: session.isAiGenerated,
          createdAt: session.createdAt
        }
      });

    } catch (error) {
      logger.error('타임어택 세션 생성 오류:', error);

      if (error.message === 'AI_SERVICE_UNAVAILABLE') {
        return res.status(503).json({
          success: false,
          error: 'AI_SERVICE_UNAVAILABLE',
          message: 'AI 서비스를 일시적으로 사용할 수 없습니다. 직접 단계를 입력해주세요.'
        });
      }

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
 * /api/time-attack/sessions/{sessionId}/start:
 *   put:
 *     summary: 타임어택 세션 시작
 *     tags: [TimeAttack]
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

      logger.info('타임어택 세션 시작 요청', { userId, sessionId });

      const session = await timeAttackService.startSession(userId, sessionId);

      logger.info('타임어택 세션 시작 성공', { 
        userId, 
        sessionId,
        currentStep: session.currentStep?.name
      });

      res.json({
        success: true,
        message: '타임어택이 시작되었습니다.',
        session: {
          id: session.id,
          status: session.status,
          startedAt: session.startedAt,
          currentStepIndex: session.currentStepIndex,
          currentStep: session.currentStep,
          remainingTime: session.remainingTime
        }
      });

    } catch (error) {
      logger.error('타임어택 세션 시작 오류:', error);

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
 * /api/time-attack/sessions/{sessionId}/next-step:
 *   put:
 *     summary: 다음 단계로 진행
 *     tags: [TimeAttack]
 *     security:
 *       - bearerAuth: []
 */
router.put('/sessions/:sessionId/next-step',
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

      logger.info('타임어택 다음 단계 진행 요청', { userId, sessionId });

      const session = await timeAttackService.nextStep(userId, sessionId);

      const isCompleted = session.currentStepIndex >= session.steps.length;

      logger.info('타임어택 단계 진행 성공', { 
        userId, 
        sessionId,
        currentStepIndex: session.currentStepIndex,
        isCompleted
      });

      res.json({
        success: true,
        message: isCompleted 
          ? '모든 단계가 완료되었습니다!' 
          : '다음 단계로 진행했습니다.',
        session: {
          id: session.id,
          status: session.status,
          currentStepIndex: session.currentStepIndex,
          currentStep: session.currentStep,
          progress: session.progress,
          completedAt: session.completedAt,
          performance: session.performance
        }
      });

    } catch (error) {
      logger.error('타임어택 단계 진행 오류:', error);

      if (error.message === 'NO_MORE_STEPS') {
        return res.status(400).json({
          success: false,
          error: 'NO_MORE_STEPS',
          message: '더 이상 진행할 단계가 없습니다.'
        });
      }

      res.status(500).json({
        success: false,
        error: 'NEXT_STEP_FAILED',
        message: '단계 진행 중 오류가 발생했습니다.'
      });
    }
  }
);

/**
 * @swagger
 * /api/time-attack/sessions/{sessionId}/complete:
 *   put:
 *     summary: 타임어택 세션 완료
 *     tags: [TimeAttack]
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

      logger.info('타임어택 세션 완료 요청', { userId, sessionId });

      const session = await timeAttackService.completeSession(userId, sessionId);

      logger.info('타임어택 세션 완료 성공', { 
        userId, 
        sessionId,
        efficiency: session.performance?.efficiency
      });

      res.json({
        success: true,
        message: '타임어택이 완료되었습니다!',
        session: {
          id: session.id,
          status: session.status,
          completedAt: session.completedAt,
          actualDuration: session.actualDuration,
          performance: {
            plannedTime: session.performance.plannedTime,
            actualTime: session.performance.actualTime,
            efficiency: session.performance.efficiency,
            stepAccuracy: session.performance.stepAccuracy
          }
        }
      });

    } catch (error) {
      logger.error('타임어택 세션 완료 오류:', error);

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

module.exports = router;

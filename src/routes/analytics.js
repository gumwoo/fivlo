/**
 * 집중도 분석 API 라우터 v2.0
 * PDF 기획서 기반 새로운 API 명세 구현
 */

const express = require('express');
const router = express.Router();
const { authenticateToken, premiumMiddleware } = require('../middleware/auth');
const analysisService = require('../services/analysisService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');

/**
 * @swagger
 * tags:
 *   name: Analytics
 *   description: 집중도 분석 시스템
 */

// =========================
// 9.1 일간 분석
// =========================

/**
 * @swagger
 * /api/analytics/daily:
 *   get:
 *     summary: 일간 집중도 분석
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         example: "2024-07-21"
 *         description: 분석할 날짜 (기본값은 오늘)
 *     responses:
 *       200:
 *         description: 일간 분석 조회 성공
 */
router.get('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    logger.info(`일간 집중도 분석 조회 요청`, { userId, date });

    const dailyAnalysis = await analysisService.getDailyAnalysis(userId, date);
    
    logger.info(`일간 집중도 분석 조회 완료`, { 
      userId, 
      date, 
      totalFocusTime: dailyAnalysis.totalFocusTime 
    });

    res.json(dailyAnalysis);

  } catch (error) {
    logger.error('일간 집중도 분석 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      date: req.query.date 
    });
    
    res.status(500).json({
      error: '일간 분석 데이터를 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 9.2 주간 분석
// =========================

/**
 * @swagger
 * /api/analytics/weekly:
 *   get:
 *     summary: 주간 집중도 분석
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: week
 *         schema:
 *           type: string
 *         example: "2024-W30"
 *         description: 분석할 주 (기본값은 이번 주)
 *     responses:
 *       200:
 *         description: 주간 분석 조회 성공
 */
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const week = req.query.week || getCurrentWeek();
    
    logger.info(`주간 집중도 분석 조회 요청`, { userId, week });

    const weeklyAnalysis = await analysisService.getWeeklyAnalysis(userId, week);
    
    logger.info(`주간 집중도 분석 조회 완료`, { 
      userId, 
      week, 
      totalFocusTime: weeklyAnalysis.totalFocusTime 
    });

    res.json(weeklyAnalysis);

  } catch (error) {
    logger.error('주간 집중도 분석 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      week: req.query.week 
    });
    
    res.status(500).json({
      error: '주간 분석 데이터를 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 9.3 월간 분석
// =========================

/**
 * @swagger
 * /api/analytics/monthly:
 *   get:
 *     summary: 월간 집중도 분석
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: string
 *         example: "2024-07"
 *         description: 분석할 월 (기본값은 이번 달)
 *     responses:
 *       200:
 *         description: 월간 분석 조회 성공
 */
router.get('/monthly', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const month = req.query.month || getCurrentMonth();
    
    logger.info(`월간 집중도 분석 조회 요청`, { userId, month });

    const monthlyAnalysis = await analysisService.getMonthlyAnalysis(userId, month);
    
    logger.info(`월간 집중도 분석 조회 완료`, { 
      userId, 
      month, 
      totalFocusTime: monthlyAnalysis.totalFocusTime 
    });

    res.json(monthlyAnalysis);

  } catch (error) {
    logger.error('월간 집중도 분석 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      month: req.query.month 
    });
    
    res.status(500).json({
      error: '월간 분석 데이터를 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 9.4 D-Day 목표 관리 (Premium 기능)
// =========================

/**
 * @swagger
 * /api/analytics/dday:
 *   get:
 *     summary: D-Day 목표 조회 (Premium)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: D-Day 목표 조회 성공
 *       402:
 *         description: Premium 기능 필요
 */
router.get('/dday', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`D-Day 목표 조회 요청`, { userId });

    const ddayGoals = await analysisService.getDDayGoals(userId);
    
    logger.info(`D-Day 목표 조회 완료`, { userId, goalCount: ddayGoals.length });

    res.json({
      goals: ddayGoals
    });

  } catch (error) {
    logger.error('D-Day 목표 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'D-Day 목표 데이터를 불러오는데 실패했습니다.'
    });
  }
});

/**
 * @swagger
 * /api/analytics/dday:
 *   post:
 *     summary: D-Day 목표 생성 (Premium)
 *     tags: [Analytics]
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
 *               - targetDate
 *               - dailyTarget
 *             properties:
 *               goal:
 *                 type: string
 *                 example: "토익 900점 달성"
 *               targetDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-12-31"
 *               dailyTarget:
 *                 type: number
 *                 example: 60
 *     responses:
 *       201:
 *         description: D-Day 목표 생성 성공
 */
router.post('/dday', authenticateToken, premiumMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goal, targetDate, dailyTarget } = req.body;
    
    logger.info(`D-Day 목표 생성 요청`, { userId, goal, targetDate, dailyTarget });

    // 필수 필드 검증
    if (!goal || !targetDate || !dailyTarget) {
      return res.status(400).json({
        error: '목표, 목표 날짜, 일일 목표는 필수 항목입니다.'
      });
    }

    const ddayGoal = await analysisService.createDDayGoal(userId, {
      goal,
      targetDate,
      dailyTarget
    });
    
    logger.info(`D-Day 목표 생성 완료`, { userId, goalId: ddayGoal._id });

    res.status(201).json({
      id: ddayGoal._id,
      goal: ddayGoal.goal,
      targetDate: ddayGoal.targetDate,
      dailyTarget: ddayGoal.dailyTarget,
      daysLeft: ddayGoal.daysLeft,
      progress: ddayGoal.progress,
      onTrack: ddayGoal.onTrack,
      recommendation: ddayGoal.recommendation,
      createdAt: ddayGoal.createdAt
    });

  } catch (error) {
    logger.error('D-Day 목표 생성 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'D-Day 목표 생성에 실패했습니다.'
    });
  }
});

// =========================
// 9.5 원본 세션 로그
// =========================

/**
 * @swagger
 * /api/analytics/sessions:
 *   get:
 *     summary: 원본 세션 로그 조회
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: 조회할 날짜
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *         description: 조회할 세션 수
 *     responses:
 *       200:
 *         description: 세션 로그 조회 성공
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date, limit = 50 } = req.query;
    
    logger.info(`원본 세션 로그 조회 요청`, { userId, date, limit });

    const sessions = await analysisService.getSessionLogs(userId, { date, limit });
    
    logger.info(`원본 세션 로그 조회 완료`, { userId, sessionCount: sessions.length });

    res.json({
      sessions,
      totalCount: sessions.length
    });

  } catch (error) {
    logger.error('원본 세션 로그 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: '세션 로그를 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 9.6 AI 루틴 제안
// =========================

/**
 * @swagger
 * /api/analytics/insights:
 *   get:
 *     summary: AI 루틴 제안
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI 인사이트 조회 성공
 */
router.get('/insights', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`AI 루틴 제안 조회 요청`, { userId });

    const insights = await aiService.generateFocusInsights(userId);
    
    logger.info(`AI 루틴 제안 조회 완료`, { userId });

    res.json({
      aiRecommendation: {
        available: true,
        message: "오분이가 루틴을 분석하고 있어요"
      },
      insights: insights || [
        "더 많은 데이터가 쌓이면 맞춤 분석을 제공해드려요",
        "꾸준한 집중 습관을 만들어보세요"
      ]
    });

  } catch (error) {
    logger.error('AI 루틴 제안 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId 
    });
    
    res.status(500).json({
      error: 'AI 인사이트를 불러오는데 실패했습니다.'
    });
  }
});

// =========================
// 유틸리티 함수들
// =========================

function getCurrentWeek() {
  const now = new Date();
  const year = now.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const days = Math.floor((now - startOfYear) / (24 * 60 * 60 * 1000));
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return `${year}-W${weekNumber.toString().padStart(2, '0')}`;
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  return `${year}-${month}`;
}

module.exports = router;

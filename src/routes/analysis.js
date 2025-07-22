/**
 * 집중도 분석 및 통계 API 라우터
 * 포모도로 데이터 기반 일/주/월/D-Day 통계 제공
 */

/**
 * @swagger
 * tags:
 *   name: Analysis
 *   description: 집중도 분석 및 통계
 */

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const analysisService = require('../services/analysisService');
const aiService = require('../services/aiService');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

// =========================
// 통계 조회 라우터
// =========================

/**
 * @swagger
 * /api/analysis/daily:
 *   get:
 *     summary: 일간 집중도 분석
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         description: 분석할 날짜 (YYYY-MM-DD 형식, 기본값은 오늘)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-15"
 *     responses:
 *       200:
 *         description: 일간 집중도 분석 조회 성공
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
 *                   example: 일간 집중도 분석 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                       format: date
 *                       example: "2025-01-15"
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalSessions:
 *                           type: integer
 *                           example: 8
 *                         completedSessions:
 *                           type: integer
 *                           example: 6
 *                         totalFocusTime:
 *                           type: integer
 *                           example: 150
 *                         averageSessionLength:
 *                           type: number
 *                           example: 25.5
 *                         focusEfficiency:
 *                           type: number
 *                           example: 75.0
 *                     hourlyBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           hour:
 *                             type: integer
 *                             example: 9
 *                           sessions:
 *                             type: integer
 *                             example: 2
 *                           focusTime:
 *                             type: integer
 *                             example: 50
 *                     goalProgress:
 *                       type: object
 *                       properties:
 *                         dailyGoal:
 *                           type: integer
 *                           example: 120
 *                         achieved:
 *                           type: integer
 *                           example: 150
 *                         percentage:
 *                           type: number
 *                           example: 125.0
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
router.get('/daily', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    
    const targetDate = date ? new Date(date) : new Date();
    
    logger.info(`일간 분석 요청`, { 
      userId, 
      date: targetDate.toISOString().split('T')[0]
    });

    const analysis = await analysisService.getDailyStats(userId, targetDate);
    
    logger.info(`일간 분석 완료`, { 
      userId, 
      totalSessions: analysis.stats.totalSessions,
      totalFocusTime: analysis.stats.totalFocusTime
    });

    res.status(200).json({
      success: true,
      message: '일간 집중도 분석 조회 성공',
      data: analysis
    });

  } catch (error) {
    logger.error('일간 분석 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: '일간 분석 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/analysis/weekly:
 *   get:
 *     summary: 주간 집중도 분석
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         description: 분석할 주의 아무 날짜 (YYYY-MM-DD 형식, 기본값은 이번주)
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-15"
 *     responses:
 *       200:
 *         description: 주간 집중도 분석 조회 성공
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
 *                   example: 주간 집중도 분석 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     weekInfo:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                           example: "2025-01-13"
 *                         endDate:
 *                           type: string
 *                           format: date
 *                           example: "2025-01-19"
 *                         weekNumber:
 *                           type: integer
 *                           example: 3
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalSessions:
 *                           type: integer
 *                           example: 35
 *                         totalFocusTime:
 *                           type: integer
 *                           example: 875
 *                         averageDailyFocus:
 *                           type: number
 *                           example: 125.0
 *                         bestDay:
 *                           type: string
 *                           example: "2025-01-15"
 *                         worstDay:
 *                           type: string
 *                           example: "2025-01-13"
 *                     dailyBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           dayOfWeek:
 *                             type: string
 *                             example: "월요일"
 *                           sessions:
 *                             type: integer
 *                           focusTime:
 *                             type: integer
 *                     weeklyTrend:
 *                       type: object
 *                       properties:
 *                         trend:
 *                           type: string
 *                           enum: [increasing, decreasing, stable]
 *                           example: increasing
 *                         changePercent:
 *                           type: number
 *                           example: 15.5
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
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { date } = req.query;
    
    const targetDate = date ? new Date(date) : new Date();
    
    logger.info(`주간 분석 요청`, { 
      userId, 
      date: targetDate.toISOString().split('T')[0]
    });

    const analysis = await analysisService.getWeeklyStats(userId, targetDate);
    
    logger.info(`주간 분석 완료`, { 
      userId, 
      totalSessions: analysis.stats.totalSessions,
      activeDays: analysis.weeklyData.filter(day => day.minutes > 0).length
    });

    res.status(200).json({
      success: true,
      message: '주간 집중도 분석 조회 성공',
      data: analysis
    });

  } catch (error) {
    logger.error('주간 분석 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: '주간 분석 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @swagger
 * /api/analysis/monthly/{year}/{month}:
 *   get:
 *     summary: 월간 집중도 분석
 *     tags: [Analysis]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         description: 분석할 연도 (4자리)
 *         schema:
 *           type: integer
 *           example: 2025
 *       - in: path
 *         name: month
 *         required: true
 *         description: 분석할 월 (1-12)
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *           example: 1
 *     responses:
 *       200:
 *         description: 월간 집중도 분석 조회 성공
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
 *                   example: 월간 집중도 분석 조회 성공
 *                 data:
 *                   type: object
 *                   properties:
 *                     monthInfo:
 *                       type: object
 *                       properties:
 *                         year:
 *                           type: integer
 *                           example: 2025
 *                         month:
 *                           type: integer
 *                           example: 1
 *                         totalDays:
 *                           type: integer
 *                           example: 31
 *                         activeDays:
 *                           type: integer
 *                           example: 25
 *                     stats:
 *                       type: object
 *                       properties:
 *                         totalSessions:
 *                           type: integer
 *                           example: 150
 *                         totalFocusTime:
 *                           type: integer
 *                           example: 3750
 *                         averageDailyFocus:
 *                           type: number
 *                           example: 150.0
 *                         longestStreak:
 *                           type: integer
 *                           example: 7
 *                         currentStreak:
 *                           type: integer
 *                           example: 3
 *                     categoryBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                             example: 공부
 *                           focusTime:
 *                             type: integer
 *                             example: 1200
 *                           percentage:
 *                             type: number
 *                             example: 32.0
 *                           color:
 *                             type: string
 *                             example: "#3B82F6"
 *                     calendarHeatmap:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           date:
 *                             type: string
 *                             format: date
 *                           focusTime:
 *                             type: integer
 *                           intensity:
 *                             type: integer
 *                             minimum: 0
 *                             maximum: 4
 *                     monthlyGoals:
 *                       type: object
 *                       properties:
 *                         targetHours:
 *                           type: integer
 *                           example: 60
 *                         achievedHours:
 *                           type: number
 *                           example: 62.5
 *                         achievementRate:
 *                           type: number
 *                           example: 104.2
 *       400:
 *         description: 잘못된 연도/월 파라미터
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
router.get('/monthly/:year/:month', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { year, month } = req.params;
    
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    // 입력값 검증
    if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: '올바른 년도와 월을 입력해주세요. (월: 1-12)'
      });
    }

    logger.info(`월간 분석 요청`, { userId, year: yearNum, month: monthNum });

    const analysis = await analysisService.getMonthlyStats(userId, yearNum, monthNum);
    
    logger.info(`월간 분석 완료`, { 
      userId, 
      year: yearNum, 
      month: monthNum,
      totalSessions: analysis.stats.totalSessions,
      activeDays: analysis.activeDays
    });

    res.status(200).json({
      success: true,
      message: `${yearNum}년 ${monthNum}월 집중도 분석 조회 성공`,
      data: analysis
    });

  } catch (error) {
    logger.error('월간 분석 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      params: req.params
    });
    
    res.status(500).json({
      success: false,
      message: '월간 분석 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// D-Day 목표 관리 (유료 기능)
// =========================

/**
 * D-Day 목표 통계 조회
 * GET /api/analysis/dday/:goalTitle
 */
router.get('/dday/:goalTitle', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const { goalTitle } = req.params;
    
    logger.info(`D-Day 분석 요청`, { userId, goalTitle });

    const analysis = await analysisService.getDDayStats(userId, goalTitle);
    
    logger.info(`D-Day 분석 완료`, { 
      userId, 
      goalTitle,
      progress: analysis.progress.percentage,
      remainingDays: analysis.goal.remainingDays
    });

    res.status(200).json({
      success: true,
      message: 'D-Day 목표 분석 조회 성공',
      data: analysis
    });

  } catch (error) {
    logger.error('D-Day 분석 실패', { 
      error: error.message, 
      userId: req.user?.userId,
      goalTitle: req.params.goalTitle
    });
    
    const statusCode = error.message.includes('유료 사용자만') ? 403 : 500;
    
    res.status(statusCode).json({
      success: false,
      message: error.message || 'D-Day 분석 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// AI 루틴 제안
// =========================

/**
 * AI 기반 루틴 제안
 * GET /api/analysis/ai-recommendation
 */
router.get('/ai-recommendation', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    logger.info(`AI 루틴 제안 요청`, { userId });

    const recommendation = await analysisService.generateAIRecommendation(userId);
    
    logger.info(`AI 루틴 제안 완료`, { 
      userId, 
      success: recommendation.success,
      type: recommendation.type,
      confidence: recommendation.confidence
    });

    res.status(200).json({
      success: true,
      message: recommendation.success 
        ? 'AI 루틴 제안 생성 완료' 
        : recommendation.message,
      data: recommendation
    });

  } catch (error) {
    logger.error('AI 루틴 제안 실패', { 
      error: error.message, 
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: 'AI 루틴 제안 생성에 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * AI 서비스 상태 조회
 * GET /api/analysis/ai-status
 */
router.get('/ai-status', authenticateToken, async (req, res) => {
  try {
    const status = aiService.getServiceStatus();
    
    res.status(200).json({
      success: true,
      message: 'AI 서비스 상태 조회 성공',
      data: status
    });

  } catch (error) {
    logger.error('AI 서비스 상태 조회 실패', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'AI 서비스 상태를 확인할 수 없습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// =========================
// 종합 대시보드 데이터
// =========================

/**
 * 대시보드용 종합 통계
 * GET /api/analysis/dashboard
 */
router.get('/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date();
    
    logger.info(`대시보드 데이터 요청`, { userId });

    // 병렬로 데이터 조회
    const [dailyStats, weeklyStats, monthlyStats] = await Promise.all([
      analysisService.getDailyStats(userId, today),
      analysisService.getWeeklyStats(userId, today),
      analysisService.getMonthlyStats(userId, today.getFullYear(), today.getMonth() + 1)
    ]);

    // 요약 통계 생성
    const summary = {
      today: {
        focusTime: dailyStats.stats.totalFocusTime,
        sessions: dailyStats.stats.totalSessions,
        completionRate: dailyStats.stats.completionRate
      },
      thisWeek: {
        focusTime: weeklyStats.stats.totalFocusTime,
        sessions: weeklyStats.stats.totalSessions,
        activeDays: weeklyStats.weeklyData.filter(day => day.minutes > 0).length
      },
      thisMonth: {
        focusTime: monthlyStats.stats.totalFocusTime,
        sessions: monthlyStats.stats.totalSessions,
        activeDays: monthlyStats.activeDays
      }
    };

    logger.info(`대시보드 데이터 완료`, { 
      userId,
      todaySessions: summary.today.sessions,
      weekSessions: summary.thisWeek.sessions,
      monthSessions: summary.thisMonth.sessions
    });

    res.status(200).json({
      success: true,
      message: '대시보드 데이터 조회 성공',
      data: {
        summary,
        daily: dailyStats,
        weekly: weeklyStats,
        monthly: monthlyStats,
        generatedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('대시보드 데이터 조회 실패', { 
      error: error.message, 
      userId: req.user?.userId
    });
    
    res.status(500).json({
      success: false,
      message: '대시보드 데이터를 불러오는데 실패했습니다.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;

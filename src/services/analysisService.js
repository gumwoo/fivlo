const PomodoroSession = require('../models/PomodoroSession');
const User = require('../models/User');
const statisticsHelper = require('../utils/statistics');
const aiService = require('./aiService');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

class AnalysisService {
  constructor() {
    this.timezone = 'Asia/Seoul';
  }

  /**
   * 일간 통계 조회
   */
  async getDailyStats(userId, date = new Date()) {
    try {
      const dateRange = statisticsHelper.getDateRange('daily', date);
      
      const sessions = await PomodoroSession.find({
        userId,
        startTime: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      }).sort({ startTime: 1 });

      const stats = statisticsHelper.calculatePeriodStats(sessions);
      const hourlyData = statisticsHelper.generateHourlyData(sessions);
      const goalStats = statisticsHelper.calculateGoalStats(sessions);
      const optimalTime = statisticsHelper.findOptimalFocusTime(hourlyData);

      logger.info('일간 통계 조회 완료', {
        userId,
        date: dateRange.label,
        sessionCount: sessions.length
      });

      return {
        period: {
          type: 'daily',
          date: dateRange.label,
          start: dateRange.start,
          end: dateRange.end
        },
        stats,
        hourlyData,
        goalStats,
        optimalTime
      };

    } catch (error) {
      logger.error(`일간 통계 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 주간 통계 조회
   */
  async getWeeklyStats(userId, date = new Date()) {
    try {
      const dateRange = statisticsHelper.getDateRange('weekly', date);
      
      const sessions = await PomodoroSession.find({
        userId,
        startTime: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      }).sort({ startTime: 1 });

      const stats = statisticsHelper.calculatePeriodStats(sessions);
      const weeklyData = statisticsHelper.generateWeeklyData(sessions, dateRange.start);
      const goalStats = statisticsHelper.calculateGoalStats(sessions);

      logger.info('주간 통계 조회 완료', {
        userId,
        weekRange: dateRange.label,
        sessionCount: sessions.length
      });

      return {
        period: {
          type: 'weekly',
          label: dateRange.label,
          start: dateRange.start,
          end: dateRange.end
        },
        stats,
        weeklyData,
        goalStats,
        bestDay: weeklyData.reduce((best, current) => 
          current.minutes > best.minutes ? current : best, weeklyData[0]
        )
      };

    } catch (error) {
      logger.error(`주간 통계 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 월간 통계 조회
   */
  async getMonthlyStats(userId, year, month) {
    try {
      const dateRange = statisticsHelper.getDateRange('monthly', new Date(year, month - 1, 1));
      
      const sessions = await PomodoroSession.find({
        userId,
        startTime: {
          $gte: dateRange.start,
          $lte: dateRange.end
        }
      }).sort({ startTime: 1 });

      const stats = statisticsHelper.calculatePeriodStats(sessions);
      const monthlyData = statisticsHelper.generateMonthlyData(sessions, year, month);
      const goalStats = statisticsHelper.calculateGoalStats(sessions);
      const calendarHeatmap = statisticsHelper.generateCalendarHeatmap(sessions, year, month);

      logger.info('월간 통계 조회 완료', {
        userId,
        year,
        month,
        sessionCount: sessions.length
      });

      return {
        period: {
          type: 'monthly',
          year,
          month,
          label: dateRange.label,
          start: dateRange.start,
          end: dateRange.end
        },
        stats,
        monthlyData,
        goalStats,
        calendarHeatmap,
        activeDays: monthlyData.filter(day => day.minutes > 0).length
      };

    } catch (error) {
      logger.error(`월간 통계 조회 실패: ${error.message}`, { userId, year, month });
      throw error;
    }
  }

  /**
   * D-Day 목표 관리 (유료 기능)
   */
  async getDDayStats(userId, goalTitle) {
    try {
      const user = await User.findById(userId);
      
      if (!user || !user.isPremium) {
        throw new Error('D-Day 기능은 유료 사용자만 이용할 수 있습니다.');
      }

      const goalSessions = await PomodoroSession.find({
        userId,
        goal: { $regex: goalTitle, $options: 'i' }
      }).sort({ startTime: 1 });

      if (goalSessions.length === 0) {
        throw new Error('해당 목표에 대한 데이터를 찾을 수 없습니다.');
      }

      const startDate = goalSessions[0].startTime;
      const currentDate = new Date();
      const totalDays = Math.ceil((currentDate - startDate) / (1000 * 60 * 60 * 24));
      const remainingDays = Math.max(0, 30 - totalDays);

      const stats = statisticsHelper.calculatePeriodStats(goalSessions);
      const targetFocusTime = 30 * 120; // 30일 * 2시간 목표
      const progressPercentage = Math.min(100, Math.round((stats.totalFocusTime / targetFocusTime) * 100));

      logger.info('D-Day 통계 조회 완료', {
        userId,
        goalTitle,
        sessionCount: goalSessions.length,
        progressPercentage
      });

      return {
        goal: {
          title: goalTitle,
          startDate,
          targetDate: moment(startDate).add(30, 'days').toDate(),
          remainingDays,
          totalDays: 30
        },
        progress: {
          percentage: progressPercentage,
          currentFocusTime: stats.totalFocusTime,
          targetFocusTime,
          dailyAverage: Math.round(stats.totalFocusTime / totalDays)
        },
        stats
      };

    } catch (error) {
      logger.error(`D-Day 통계 조회 실패: ${error.message}`, { userId, goalTitle });
      throw error;
    }
  }

  /**
   * AI 루틴 제안 생성
   */
  async generateAIRecommendation(userId) {
    try {
      const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
      
      const sessions = await PomodoroSession.find({
        userId,
        startTime: { $gte: thirtyDaysAgo }
      }).sort({ startTime: 1 });

      if (sessions.length === 0) {
        return {
          success: false,
          message: '루틴 제안을 위한 충분한 데이터가 없습니다. 더 많은 포모도로 세션을 진행해보세요.'
        };
      }

      const stats = statisticsHelper.calculatePeriodStats(sessions);
      const hourlyData = statisticsHelper.generateHourlyData(sessions);
      const goalStats = statisticsHelper.calculateGoalStats(sessions);
      const optimalTime = statisticsHelper.findOptimalFocusTime(hourlyData);

      const patterns = {
        optimalTime: optimalTime.peak,
        productiveHours: optimalTime.productiveHours,
        averageSessionLength: stats.averageFocusTime,
        preferredGoals: goalStats.slice(0, 3)
      };

      const userData = {
        userId,
        stats,
        patterns,
        goals: goalStats
      };

      const recommendation = await aiService.generateRoutineRecommendation(userData);

      logger.info('AI 루틴 제안 생성 완료', {
        userId,
        sessionCount: sessions.length,
        confidence: recommendation.confidence
      });

      return recommendation;

    } catch (error) {
      logger.error(`AI 루틴 제안 생성 실패: ${error.message}`, { userId });
      throw error;
    }
  }
}

module.exports = new AnalysisService();

const PomodoroSession = require('../models/PomodoroSession');
const User = require('../models/User');
const TimerUtils = require('../utils/timer');
const logger = require('../utils/logger');

class PomodoroService {
  /**
   * 새 포모도로 세션 생성
   */
  async createSession(userId, sessionData) {
    try {
      const { goal, color, type = 'focus', duration, cycleId } = sessionData;

      // 기존 활성 세션 확인
      const activeSession = await PomodoroSession.findActiveSession(userId);
      if (activeSession) {
        throw new Error('이미 진행 중인 세션이 있습니다. 먼저 완료하거나 취소해주세요.');
      }

      // 세션 시간 설정
      const sessionDuration = duration || TimerUtils.getSessionDuration(type);
      
      // 색상 검증
      const sessionColor = color && TimerUtils.isValidColor(color) 
        ? color 
        : TimerUtils.getRandomColor();

      // 사이클 ID 생성
      const sessionCycleId = cycleId || TimerUtils.generateCycleId(userId);

      // 사이클 내 위치 계산
      const existingSessions = await PomodoroSession.find({ cycleId: sessionCycleId }).countDocuments();
      const cyclePosition = existingSessions + 1;

      // 새 세션 생성
      const session = new PomodoroSession({
        userId,
        goal: goal.trim(),
        color: sessionColor,
        type,
        duration: sessionDuration,
        cycleId: sessionCycleId,
        cyclePosition,
        status: 'pending'
      });

      await session.save();

      logger.info('포모도로 세션 생성', {
        userId,
        sessionId: session._id,
        goal: session.goal,
        type: session.type,
        duration: session.duration
      });

      return session;
    } catch (error) {
      logger.error(`포모도로 세션 생성 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 세션 시작
   */
  async startSession(userId, sessionId) {
    try {
      const session = await PomodoroSession.findOne({ _id: sessionId, userId });
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      await session.start();

      logger.info('포모도로 세션 시작', {
        userId,
        sessionId: session._id,
        goal: session.goal,
        type: session.type
      });

      return session;
    } catch (error) {
      logger.error(`포모도로 세션 시작 실패: ${error.message}`, { userId, sessionId });
      throw error;
    }
  }

  /**
   * 세션 완료
   */
  async completeSession(userId, sessionId) {
    try {
      const session = await PomodoroSession.findOne({ _id: sessionId, userId });
      if (!session) {
        throw new Error('세션을 찾을 수 없습니다.');
      }

      await session.complete();

      const result = {
        session,
        coinAwarded: 0,
        nextSession: null,
        cycleCompleted: false
      };

      // 코인 지급 (집중 세션이고 유료 사용자인 경우)
      if (session.type === 'focus') {
        const coinResult = await this.awardCoins(userId, session);
        result.coinAwarded = coinResult.coinAwarded;
      }

      // 다음 세션 추천
      const nextSessionType = TimerUtils.getNextSessionType(session.type);
      result.nextSession = {
        type: nextSessionType,
        duration: TimerUtils.getSessionDuration(nextSessionType),
        goal: nextSessionType === 'focus' ? '' : '휴식 시간'
      };

      logger.info('포모도로 세션 완료', {
        userId,
        sessionId: session._id,
        type: session.type,
        coinAwarded: result.coinAwarded
      });

      return result;
    } catch (error) {
      logger.error(`포모도로 세션 완료 실패: ${error.message}`, { userId, sessionId });
      throw error;
    }
  }

  /**
   * 활성 세션 조회
   */
  async getActiveSession(userId) {
    try {
      const session = await PomodoroSession.findActiveSession(userId);
      if (!session) {
        return null;
      }

      // 세션 상태 검증 및 업데이트
      const stateInfo = TimerUtils.validateSessionState(session);
      
      return {
        session,
        ...stateInfo
      };
    } catch (error) {
      logger.error(`활성 세션 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 코인 지급
   */
  async awardCoins(userId, session) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.isPremium) {
        return { coinAwarded: 0, reason: 'not_premium' };
      }

      // 이미 코인을 받은 세션인지 확인
      if (session.coinAwarded) {
        return { coinAwarded: 0, reason: 'already_awarded' };
      }

      // 오늘 이미 코인을 받았는지 확인 (1일 1회 제한)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const todaySession = await PomodoroSession.findOne({
        userId,
        type: 'focus',
        isCompleted: true,
        coinAwarded: true,
        completedAt: { $gte: today }
      });

      if (todaySession) {
        return { coinAwarded: 0, reason: 'daily_limit_reached' };
      }

      // 코인 지급 (집중 세션 완료 시 1코인)
      const coinAmount = 1;
      await user.addCoins(coinAmount, `포모도로 집중 세션 완료: ${session.goal}`);

      // 세션에 코인 지급 기록
      session.coinAwarded = true;
      session.coinAmount = coinAmount;
      await session.save();

      logger.info('포모도로 코인 지급', {
        userId,
        sessionId: session._id,
        coinAmount
      });

      return { 
        coinAwarded: coinAmount, 
        reason: 'success',
        totalCoins: user.coins + coinAmount
      };
    } catch (error) {
      logger.error(`코인 지급 실패: ${error.message}`, { userId, sessionId: session._id });
      return { coinAwarded: 0, reason: 'error', error: error.message };
    }
  }

  /**
   * 일일 통계 조회
   */
  async getDailyStats(userId, date = new Date()) {
    try {
      const stats = await PomodoroSession.getDailyStats(userId, date);
      
      const result = {
        date: date.toISOString().split('T')[0],
        focus: { count: 0, totalMinutes: 0 },
        break: { count: 0, totalMinutes: 0 },
        total: { count: 0, totalMinutes: 0 }
      };

      stats.forEach(stat => {
        const minutes = Math.floor(stat.totalDuration / 60);
        
        if (stat._id === 'focus') {
          result.focus = {
            count: stat.count,
            totalMinutes: minutes
          };
        } else if (stat._id === 'break') {
          result.break = {
            count: stat.count,
            totalMinutes: minutes
          };
        }
      });

      result.total = {
        count: result.focus.count + result.break.count,
        totalMinutes: result.focus.totalMinutes + result.break.totalMinutes
      };

      return result;
    } catch (error) {
      logger.error(`일일 통계 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 포모도로 통계 조회
   */
  async getStats(userId, period = 'weekly', date = null) {
    try {
      const targetDate = date ? new Date(date) : new Date();
      let startDate, endDate;

      // 기간별 날짜 계산
      switch (period) {
        case 'daily':
          startDate = new Date(targetDate);
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(targetDate);
          endDate.setHours(23, 59, 59, 999);
          break;
        
        case 'weekly':
          startDate = new Date(targetDate);
          startDate.setDate(targetDate.getDate() - targetDate.getDay());
          startDate.setHours(0, 0, 0, 0);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          endDate.setHours(23, 59, 59, 999);
          break;
        
        case 'monthly':
          startDate = new Date(targetDate.getFullYear(), targetDate.getMonth(), 1);
          endDate = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0);
          endDate.setHours(23, 59, 59, 999);
          break;
        
        default:
          throw new Error('올바르지 않은 기간입니다.');
      }

      // 해당 기간의 세션 조회
      const sessions = await PomodoroSession.find({
        userId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).sort({ createdAt: -1 });

      // 통계 계산
      const totalSessions = sessions.length;
      const completedSessions = sessions.filter(s => s.status === 'completed').length;
      const totalFocusTime = sessions.reduce((total, session) => {
        return total + (session.actualDuration || 0);
      }, 0);

      const averageSessionTime = totalSessions > 0 ? Math.round(totalFocusTime / totalSessions) : 0;
      const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;

      // 목표별 분류
      const goalBreakdown = sessions.reduce((acc, session) => {
        const goal = session.goal || '기타';
        if (!acc[goal]) {
          acc[goal] = { count: 0, totalTime: 0 };
        }
        acc[goal].count++;
        acc[goal].totalTime += session.actualDuration || 0;
        return acc;
      }, {});

      // 색상별 분류
      const colorDistribution = sessions.reduce((acc, session) => {
        const color = session.color || '#FF6B6B';
        acc[color] = (acc[color] || 0) + 1;
        return acc;
      }, {});

      // 일별 진행률 (주간/월간만)
      let dailyProgress = [];
      if (period !== 'daily') {
        const days = period === 'weekly' ? 7 : new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
        
        for (let i = 0; i < days; i++) {
          const currentDate = new Date(startDate);
          currentDate.setDate(startDate.getDate() + i);
          
          const daySessions = sessions.filter(session => {
            const sessionDate = new Date(session.createdAt);
            return sessionDate.toDateString() === currentDate.toDateString();
          });

          dailyProgress.push({
            date: currentDate.toISOString().split('T')[0],
            sessions: daySessions.length,
            completedSessions: daySessions.filter(s => s.status === 'completed').length,
            totalTime: daySessions.reduce((total, s) => total + (s.actualDuration || 0), 0)
          });
        }
      }

      logger.info('포모도로 통계 조회 성공', { 
        userId, 
        period, 
        totalSessions,
        completedSessions 
      });

      return {
        date: targetDate.toISOString().split('T')[0],
        totalSessions,
        completedSessions,
        totalFocusTime, // 분 단위
        averageSessionTime,
        completionRate,
        goalBreakdown,
        colorDistribution,
        dailyProgress,
        bestStreak: await this.calculateBestStreak(userId, targetDate)
      };

    } catch (error) {
      logger.error('포모도로 통계 조회 실패:', error);
      throw error;
    }
  }

  /**
   * 최고 연속 완료 기록 계산
   */
  async calculateBestStreak(userId, referenceDate) {
    try {
      // 최근 30일간의 완료된 세션들을 날짜별로 그룹화
      const thirtyDaysAgo = new Date(referenceDate);
      thirtyDaysAgo.setDate(referenceDate.getDate() - 30);

      const completedSessions = await PomodoroSession.find({
        userId,
        status: 'completed',
        createdAt: { $gte: thirtyDaysAgo, $lte: referenceDate }
      }).sort({ createdAt: 1 });

      if (completedSessions.length === 0) return 0;

      // 날짜별로 그룹화
      const dailyCompletions = {};
      completedSessions.forEach(session => {
        const dateKey = session.createdAt.toISOString().split('T')[0];
        dailyCompletions[dateKey] = true;
      });

      // 연속 일수 계산
      let currentStreak = 0;
      let bestStreak = 0;
      
      const checkDate = new Date(referenceDate);
      for (let i = 0; i < 30; i++) {
        const dateKey = checkDate.toISOString().split('T')[0];
        
        if (dailyCompletions[dateKey]) {
          currentStreak++;
          bestStreak = Math.max(bestStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
        
        checkDate.setDate(checkDate.getDate() - 1);
      }

      return bestStreak;
    } catch (error) {
      logger.error('연속 완료 기록 계산 실패:', error);
      return 0;
    }
  }
}

module.exports = new PomodoroService();

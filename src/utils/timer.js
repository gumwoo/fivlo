const logger = require('./logger');

/**
 * 시간 포맷팅 유틸리티
 */
class TimerUtils {
  /**
   * 초를 MM:SS 형식으로 변환
   * @param {Number} seconds - 초 단위 시간
   * @returns {String} MM:SS 형식 문자열
   */
  static formatTime(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) {
      return '00:00';
    }
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * 초를 HH:MM:SS 형식으로 변환
   * @param {Number} seconds - 초 단위 시간
   * @returns {String} HH:MM:SS 형식 문자열
   */
  static formatLongTime(seconds) {
    if (typeof seconds !== 'number' || seconds < 0) {
      return '00:00:00';
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  /**
   * 분을 초로 변환
   * @param {Number} minutes - 분 단위 시간
   * @returns {Number} 초 단위 시간
   */
  static minutesToSeconds(minutes) {
    return Math.floor(minutes * 60);
  }

  /**
   * 초를 분으로 변환
   * @param {Number} seconds - 초 단위 시간
   * @returns {Number} 분 단위 시간 (소수점 2자리)
   */
  static secondsToMinutes(seconds) {
    return Math.round((seconds / 60) * 100) / 100;
  }

  /**
   * 포모도로 기본 시간 설정
   */
  static get POMODORO_DURATIONS() {
    return {
      FOCUS: 25, // 분
      SHORT_BREAK: 5, // 분
      LONG_BREAK: 15, // 분
      MAX_DURATION: 120 // 분 (최대 허용 시간)
    };
  }

  /**
   * 포모도로 사이클 ID 생성
   * @param {String} userId - 사용자 ID
   * @returns {String} 고유한 사이클 ID
   */
  static generateCycleId(userId) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `cycle_${userId}_${timestamp}_${random}`;
  }

  /**
   * 세션 진행률 계산
   * @param {Number} elapsedSeconds - 경과 시간 (초)
   * @param {Number} totalSeconds - 전체 시간 (초)
   * @returns {Number} 진행률 (0-100)
   */
  static calculateProgress(elapsedSeconds, totalSeconds) {
    if (totalSeconds <= 0) return 0;
    const progress = (elapsedSeconds / totalSeconds) * 100;
    return Math.min(100, Math.max(0, Math.round(progress)));
  }

  /**
   * 남은 시간 계산
   * @param {Date} startTime - 시작 시간
   * @param {Number} durationMinutes - 총 시간 (분)
   * @param {Number} pausedSeconds - 일시정지된 시간 (초)
   * @returns {Object} { remainingSeconds, isExpired }
   */
  static calculateRemainingTime(startTime, durationMinutes, pausedSeconds = 0) {
    if (!startTime) {
      return { 
        remainingSeconds: this.minutesToSeconds(durationMinutes), 
        isExpired: false 
      };
    }

    const now = new Date();
    const elapsedMs = now.getTime() - startTime.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000) - pausedSeconds;
    const totalSeconds = this.minutesToSeconds(durationMinutes);
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    
    return {
      remainingSeconds,
      isExpired: remainingSeconds === 0,
      elapsedSeconds: Math.max(0, elapsedSeconds)
    };
  }

  /**
   * 세션 상태 검증
   * @param {Object} session - 포모도로 세션 객체
   * @returns {Object} 검증된 상태 정보
   */
  static validateSessionState(session) {
    try {
      const timeInfo = this.calculateRemainingTime(
        session.startTime,
        session.duration,
        session.totalPausedTime
      );

      return {
        isValid: true,
        status: session.status,
        timeInfo,
        formattedRemaining: this.formatTime(timeInfo.remainingSeconds),
        formattedElapsed: this.formatTime(timeInfo.elapsedSeconds),
        progress: this.calculateProgress(timeInfo.elapsedSeconds, this.minutesToSeconds(session.duration))
      };
    } catch (error) {
      logger.error(`세션 상태 검증 실패: ${error.message}`, { 
        sessionId: session._id 
      });
      
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * 다음 세션 유형 결정
   * @param {String} currentType - 현재 세션 유형
   * @param {Number} completedFocusSessions - 완료된 집중 세션 수
   * @returns {String} 다음 세션 유형
   */
  static getNextSessionType(currentType, completedFocusSessions = 0) {
    if (currentType === 'focus') {
      // 집중 세션 후에는 휴식
      // 4번째 집중 세션 후에는 긴 휴식
      return (completedFocusSessions % 4 === 0) ? 'long_break' : 'break';
    } else {
      // 휴식 세션 후에는 집중
      return 'focus';
    }
  }

  /**
   * 다음 세션 시간 결정
   * @param {String} sessionType - 세션 유형
   * @param {Number} customDuration - 사용자 지정 시간 (분)
   * @returns {Number} 세션 시간 (분)
   */
  static getSessionDuration(sessionType, customDuration = null) {
    if (customDuration && customDuration > 0 && customDuration <= this.POMODORO_DURATIONS.MAX_DURATION) {
      return customDuration;
    }

    switch (sessionType) {
      case 'focus':
        return this.POMODORO_DURATIONS.FOCUS;
      case 'break':
        return this.POMODORO_DURATIONS.SHORT_BREAK;
      case 'long_break':
        return this.POMODORO_DURATIONS.LONG_BREAK;
      default:
        return this.POMODORO_DURATIONS.FOCUS;
    }
  }

  /**
   * 세션 통계 계산
   * @param {Array} sessions - 세션 배열
   * @returns {Object} 통계 정보
   */
  static calculateSessionStats(sessions) {
    const stats = {
      total: sessions.length,
      completed: 0,
      totalFocusTime: 0, // 분
      totalBreakTime: 0, // 분
      averageFocusTime: 0,
      completionRate: 0,
      focusSessions: 0,
      breakSessions: 0
    };

    sessions.forEach(session => {
      if (session.isCompleted) {
        stats.completed++;
        const minutes = this.secondsToMinutes(session.actualDuration || 0);
        
        if (session.type === 'focus') {
          stats.totalFocusTime += minutes;
          stats.focusSessions++;
        } else {
          stats.totalBreakTime += minutes;
          stats.breakSessions++;
        }
      }
    });

    stats.completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    stats.averageFocusTime = stats.focusSessions > 0 ? Math.round(stats.totalFocusTime / stats.focusSessions) : 0;

    return stats;
  }

  /**
   * 색상 코드 검증
   * @param {String} color - 색상 코드
   * @returns {Boolean} 유효 여부
   */
  static isValidColor(color) {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
  }

  /**
   * 기본 색상 팔레트
   */
  static get DEFAULT_COLORS() {
    return [
      '#FF6B6B', // 빨강
      '#4ECDC4', // 청록
      '#45B7D1', // 파랑
      '#96CEB4', // 초록
      '#FFEAA7', // 노랑
      '#DDA0DD', // 보라
      '#98D8C8', // 민트
      '#F7DC6F', // 골드
      '#BB8FCE', // 라벤더
      '#85C1E9', // 하늘
      '#F8C471', // 오렌지
      '#82E0AA'  // 라임
    ];
  }

  /**
   * 무작위 색상 선택
   * @returns {String} 색상 코드
   */
  static getRandomColor() {
    const colors = this.DEFAULT_COLORS;
    return colors[Math.floor(Math.random() * colors.length)];
  }
}

module.exports = TimerUtils;

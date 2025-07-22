const moment = require('moment-timezone');
const logger = require('./logger');

class StatisticsHelper {
  constructor() {
    this.timezone = 'Asia/Seoul';
  }

  /**
   * 날짜 범위 생성
   */
  getDateRange(type, date = new Date()) {
    const momentDate = moment(date).tz(this.timezone);
    
    switch (type) {
      case 'daily':
        return {
          start: momentDate.clone().startOf('day').toDate(),
          end: momentDate.clone().endOf('day').toDate(),
          label: momentDate.format('YYYY-MM-DD')
        };
        
      case 'weekly':
        return {
          start: momentDate.clone().startOf('week').toDate(),
          end: momentDate.clone().endOf('week').toDate(),
          label: `${momentDate.clone().startOf('week').format('YYYY-MM-DD')} ~ ${momentDate.clone().endOf('week').format('YYYY-MM-DD')}`
        };
        
      case 'monthly':
        return {
          start: momentDate.clone().startOf('month').toDate(),
          end: momentDate.clone().endOf('month').toDate(),
          label: momentDate.format('YYYY-MM')
        };
        
      default:
        throw new Error('유효하지 않은 날짜 범위 타입입니다.');
    }
  }

  /**
   * 시간대별 데이터 생성 (0-23시간)
   */
  generateHourlyData(sessions) {
    const hourlyData = Array(24).fill(0);
    
    sessions.forEach(session => {
      if (session.startTime) {
        const hour = moment(session.startTime).tz(this.timezone).hour();
        hourlyData[hour] += session.focusTime || 0;
      }
    });

    return hourlyData.map((minutes, hour) => ({
      hour,
      minutes,
      label: `${hour.toString().padStart(2, '0')}:00`
    }));
  }

  /**
   * 요일별 데이터 생성 (0=일요일, 6=토요일)
   */
  generateWeeklyData(sessions, weekStart) {
    const weekDays = ['일', '월', '화', '수', '목', '금', '토'];
    const weeklyData = Array(7).fill(0);
    
    sessions.forEach(session => {
      if (session.startTime) {
        const dayOfWeek = moment(session.startTime).tz(this.timezone).day();
        weeklyData[dayOfWeek] += session.focusTime || 0;
      }
    });

    return weeklyData.map((minutes, dayIndex) => {
      const date = moment(weekStart).tz(this.timezone).add(dayIndex, 'days');
      return {
        day: dayIndex,
        dayName: weekDays[dayIndex],
        date: date.format('YYYY-MM-DD'),
        minutes,
        hours: Math.round(minutes / 60 * 10) / 10
      };
    });
  }

  /**
   * 월별 일일 데이터 생성
   */
  generateMonthlyData(sessions, year, month) {
    const daysInMonth = moment(`${year}-${month}`, 'YYYY-MM').daysInMonth();
    const monthlyData = {};
    
    // 월의 모든 날짜 초기화
    for (let day = 1; day <= daysInMonth; day++) {
      const dateKey = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD').format('YYYY-MM-DD');
      monthlyData[dateKey] = {
        date: dateKey,
        day,
        minutes: 0,
        sessions: 0,
        goals: []
      };
    }

    // 세션 데이터 매핑
    sessions.forEach(session => {
      if (session.startTime) {
        const dateKey = moment(session.startTime).tz(this.timezone).format('YYYY-MM-DD');
        if (monthlyData[dateKey]) {
          monthlyData[dateKey].minutes += session.focusTime || 0;
          monthlyData[dateKey].sessions += 1;
          
          if (session.goal && !monthlyData[dateKey].goals.includes(session.goal)) {
            monthlyData[dateKey].goals.push(session.goal);
          }
        }
      }
    });

    return Object.values(monthlyData);
  }

  /**
   * 집중도 등급 계산
   */
  calculateFocusLevel(minutes) {
    if (minutes >= 240) return { level: 'excellent', label: '매우 좋음', color: '#22c55e' };
    if (minutes >= 180) return { level: 'good', label: '좋음', color: '#3b82f6' };
    if (minutes >= 120) return { level: 'average', label: '보통', color: '#f59e0b' };
    if (minutes >= 60) return { level: 'below_average', label: '부족', color: '#ef4444' };
    return { level: 'poor', label: '매우 부족', color: '#6b7280' };
  }

  /**
   * 목표별 통계 계산
   */
  calculateGoalStats(sessions) {
    const goalStats = {};
    
    sessions.forEach(session => {
      const goal = session.goal || ' 기타';
      
      if (!goalStats[goal]) {
        goalStats[goal] = {
          goal,
          totalSessions: 0,
          totalFocusTime: 0,
          totalBreakTime: 0,
          averageFocusTime: 0,
          completionRate: 0,
          color: session.color || '#3b82f6'
        };
      }
      
      goalStats[goal].totalSessions += 1;
      goalStats[goal].totalFocusTime += session.focusTime || 0;
      goalStats[goal].totalBreakTime += session.breakTime || 0;
      
      if (session.status === 'completed') {
        goalStats[goal].completedSessions = (goalStats[goal].completedSessions || 0) + 1;
      }
    });

    // 평균 및 완료율 계산
    Object.values(goalStats).forEach(stats => {
      stats.averageFocusTime = Math.round(stats.totalFocusTime / stats.totalSessions);
      stats.completionRate = Math.round((stats.completedSessions || 0) / stats.totalSessions * 100);
    });

    return Object.values(goalStats).sort((a, b) => b.totalFocusTime - a.totalFocusTime);
  }

  /**
   * 성과 분석
   */
  analyzePerformance(currentPeriod, previousPeriod) {
    const current = this.calculatePeriodStats(currentPeriod);
    const previous = this.calculatePeriodStats(previousPeriod);
    
    const focusTimeChange = this.calculateChange(current.totalFocusTime, previous.totalFocusTime);
    const sessionChange = this.calculateChange(current.totalSessions, previous.totalSessions);
    const completionRateChange = this.calculateChange(current.completionRate, previous.completionRate);
    
    return {
      current,
      previous,
      changes: {
        focusTime: focusTimeChange,
        sessions: sessionChange,
        completionRate: completionRateChange
      },
      trend: this.determineTrend(focusTimeChange.percentage)
    };
  }

  /**
   * 기간별 통계 계산
   */
  calculatePeriodStats(sessions) {
    if (!sessions || sessions.length === 0) {
      return {
        totalSessions: 0,
        totalFocusTime: 0,
        averageFocusTime: 0,
        completionRate: 0,
        totalDays: 0
      };
    }

    const totalSessions = sessions.length;
    const totalFocusTime = sessions.reduce((sum, session) => sum + (session.focusTime || 0), 0);
    const completedSessions = sessions.filter(session => session.status === 'completed').length;
    
    // 활동한 날짜 수 계산
    const uniqueDates = new Set(
      sessions.map(session => 
        moment(session.startTime).tz(this.timezone).format('YYYY-MM-DD')
      )
    );

    return {
      totalSessions,
      totalFocusTime,
      averageFocusTime: totalSessions > 0 ? Math.round(totalFocusTime / totalSessions) : 0,
      completionRate: totalSessions > 0 ? Math.round(completedSessions / totalSessions * 100) : 0,
      totalDays: uniqueDates.size
    };
  }

  /**
   * 변화율 계산
   */
  calculateChange(current, previous) {
    if (previous === 0) {
      return {
        absolute: current,
        percentage: current > 0 ? 100 : 0,
        direction: current > 0 ? 'increase' : 'stable'
      };
    }

    const absolute = current - previous;
    const percentage = Math.round((absolute / previous) * 100);
    
    return {
      absolute,
      percentage: Math.abs(percentage),
      direction: absolute > 0 ? 'increase' : absolute < 0 ? 'decrease' : 'stable'
    };
  }

  /**
   * 트렌드 판정
   */
  determineTrend(changePercentage) {
    if (changePercentage >= 20) return 'excellent';
    if (changePercentage >= 10) return 'good';
    if (changePercentage >= 0) return 'stable';
    if (changePercentage >= -10) return 'declining';
    return 'poor';
  }

  /**
   * 최적 집중 시간대 찾기
   */
  findOptimalFocusTime(hourlyData) {
    const productiveHours = hourlyData
      .filter(data => data.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 3);

    if (productiveHours.length === 0) {
      return {
        peak: null,
        recommendation: '데이터가 부족합니다. 더 많은 포모도로 세션을 진행해보세요.'
      };
    }

    const peakHour = productiveHours[0];
    
    return {
      peak: peakHour,
      productiveHours,
      recommendation: this.generateTimeRecommendation(peakHour.hour)
    };
  }

  /**
   * 시간대 추천 메시지 생성
   */
  generateTimeRecommendation(hour) {
    if (hour >= 6 && hour < 9) {
      return '아침 시간대가 가장 집중이 잘 되네요! 이른 아침 시간을 활용해보세요.';
    } else if (hour >= 9 && hour < 12) {
      return '오전 시간대에 집중력이 높습니다. 오전에 중요한 작업을 계획해보세요.';
    } else if (hour >= 14 && hour < 17) {
      return '오후 시간대가 집중에 적합합니다. 점심 후 업무에 집중해보세요.';
    } else if (hour >= 19 && hour < 22) {
      return '저녁 시간대에 집중이 잘 됩니다. 하루를 마무리하며 학습해보세요.';
    } else {
      return '자신만의 집중 패턴을 찾으셨네요! 이 시간대를 더 활용해보세요.';
    }
  }

  /**
   * 캘린더 히트맵 데이터 생성
   */
  generateCalendarHeatmap(sessions, year, month) {
    const monthlyData = this.generateMonthlyData(sessions, year, month);
    
    return monthlyData.map(dayData => {
      const focusLevel = this.calculateFocusLevel(dayData.minutes);
      
      return {
        ...dayData,
        focusLevel: focusLevel.level,
        focusLevelLabel: focusLevel.label,
        color: focusLevel.color,
        intensity: Math.min(dayData.minutes / 60, 4) // 0-4 강도
      };
    });
  }
}

module.exports = new StatisticsHelper();

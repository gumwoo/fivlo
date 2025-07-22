const cron = require('node-cron');
const reminderService = require('../services/reminderService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.isRunning = false;
    this.cronJobs = new Map();
  }

  /**
   * 스케줄러 시작
   */
  async start() {
    try {
      if (this.isRunning) {
        logger.warn('스케줄러가 이미 실행 중입니다.');
        return;
      }

      // 알림 서비스 초기화
      await notificationService.initialize();

      // 매분마다 알림 체크 (실제 운영에서는 매분)
      this.cronJobs.set('reminder-check', cron.schedule('* * * * *', async () => {
        await this.checkReminders();
      }, {
        scheduled: false
      }));

      // 매일 자정에 통계 정리 (00:00)
      this.cronJobs.set('daily-cleanup', cron.schedule('0 0 * * *', async () => {
        await this.dailyCleanup();
      }, {
        scheduled: false
      }));

      // 매주 일요일 자정에 주간 통계 생성 (00:00 on Sunday)
      this.cronJobs.set('weekly-stats', cron.schedule('0 0 * * 0', async () => {
        await this.generateWeeklyStats();
      }, {
        scheduled: false
      }));

      // 모든 cron job 시작
      this.cronJobs.forEach((job, name) => {
        job.start();
        logger.info(`Cron job 시작: ${name}`);
      });

      this.isRunning = true;
      logger.info('⏰ 스케줄러 시작 완료');

    } catch (error) {
      logger.error(`스케줄러 시작 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 스케줄러 종료
   */
  stop() {
    try {
      this.cronJobs.forEach((job, name) => {
        job.stop();
        logger.info(`Cron job 종료: ${name}`);
      });

      this.isRunning = false;
      logger.info('스케줄러 종료 완료');

    } catch (error) {
      logger.error(`스케줄러 종료 실패: ${error.message}`);
    }
  }

  /**
   * 현재 시간의 알림 체크 및 발송
   */
  async checkReminders() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      const dayOfWeek = now.getDay();

      // 현재 시간에 설정된 알림들 조회
      const reminders = await reminderService.getRemindersByTime(hour, minute, dayOfWeek);

      if (reminders.length === 0) {
        return;
      }

      logger.info(`⏰ ${hour}:${minute.toString().padStart(2, '0')} 알림 체크`, {
        reminderCount: reminders.length,
        dayOfWeek
      });

      const notifications = [];

      for (const reminder of reminders) {
        try {
          // 오늘 이미 완료된 알림은 건너뛰기
          if (reminder.isCompletedToday()) {
            continue;
          }

          // 알림 발송 기록
          await reminder.recordNotification();

          // 푸시 알림 준비
          if (notificationService.isNotificationEnabled(reminder.userId, 'reminder')) {
            const notification = notificationService.createReminderNotification(reminder, reminder.userId);
            
            notifications.push({
              user: reminder.userId,
              message: notification
            });
          }

          logger.info('알림 발송 준비 완료', {
            reminderId: reminder._id,
            userId: reminder.userId._id,
            title: reminder.title,
            time: `${hour}:${minute.toString().padStart(2, '0')}`
          });

        } catch (error) {
          logger.error('개별 알림 처리 실패', {
            reminderId: reminder._id,
            error: error.message
          });
        }
      }

      // 대량 푸시 알림 발송
      if (notifications.length > 0) {
        await notificationService.sendBulkNotifications(notifications);
      }

    } catch (error) {
      logger.error(`알림 체크 실패: ${error.message}`);
    }
  }

  /**
   * 일일 정리 작업
   */
  async dailyCleanup() {
    try {
      logger.info('일일 정리 작업 시작');

      // TODO: 일일 통계 정리, 오래된 로그 삭제 등
      // 1. 오래된 알림 완료 기록 정리 (30일 이상)
      // 2. 일일 통계 업데이트
      // 3. 로그 파일 정리

      logger.info('일일 정리 작업 완료');

    } catch (error) {
      logger.error(`일일 정리 작업 실패: ${error.message}`);
    }
  }

  /**
   * 주간 통계 생성
   */
  async generateWeeklyStats() {
    try {
      logger.info('주간 통계 생성 시작');

      // TODO: 주간 통계 데이터 생성
      // 1. 사용자별 주간 알림 완료율
      // 2. 가장 많이 사용되는 알림 시간대
      // 3. 위치 기반 알림 효과 분석

      logger.info('주간 통계 생성 완료');

    } catch (error) {
      logger.error(`주간 통계 생성 실패: ${error.message}`);
    }
  }

  /**
   * 특정 시간에 실행될 작업 추가
   */
  addScheduledTask(name, cronExpression, task) {
    try {
      if (this.cronJobs.has(name)) {
        logger.warn(`이미 존재하는 스케줄 작업: ${name}`);
        return false;
      }

      const job = cron.schedule(cronExpression, task, {
        scheduled: this.isRunning
      });

      this.cronJobs.set(name, job);
      
      if (this.isRunning) {
        job.start();
      }

      logger.info(`스케줄 작업 추가: ${name} (${cronExpression})`);
      return true;

    } catch (error) {
      logger.error(`스케줄 작업 추가 실패: ${error.message}`, { name, cronExpression });
      return false;
    }
  }

  /**
   * 스케줄 작업 제거
   */
  removeScheduledTask(name) {
    try {
      const job = this.cronJobs.get(name);
      if (!job) {
        logger.warn(`존재하지 않는 스케줄 작업: ${name}`);
        return false;
      }

      job.stop();
      this.cronJobs.delete(name);

      logger.info(`스케줄 작업 제거: ${name}`);
      return true;

    } catch (error) {
      logger.error(`스케줄 작업 제거 실패: ${error.message}`, { name });
      return false;
    }
  }

  /**
   * 실행 중인 스케줄 작업 목록 조회
   */
  getScheduledTasks() {
    const tasks = [];
    
    this.cronJobs.forEach((job, name) => {
      tasks.push({
        name,
        running: job.running || false
      });
    });

    return tasks;
  }

  /**
   * 스케줄러 상태 조회
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalTasks: this.cronJobs.size,
      tasks: this.getScheduledTasks()
    };
  }

  /**
   * 수동으로 알림 체크 실행 (테스트용)
   */
  async manualReminderCheck() {
    try {
      logger.info('수동 알림 체크 실행');
      await this.checkReminders();
      logger.info('수동 알림 체크 완료');
    } catch (error) {
      logger.error(`수동 알림 체크 실패: ${error.message}`);
      throw error;
    }
  }
}

// 싱글톤 인스턴스 생성
const schedulerService = new SchedulerService();

// 서버 종료 시 스케줄러도 정리
process.on('SIGTERM', () => {
  logger.info('SIGTERM 신호 수신, 스케줄러 종료 중...');
  schedulerService.stop();
});

process.on('SIGINT', () => {
  logger.info('SIGINT 신호 수신, 스케줄러 종료 중...');
  schedulerService.stop();
});

module.exports = schedulerService;

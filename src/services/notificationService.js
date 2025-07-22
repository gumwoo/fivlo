const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    // FCM 또는 다른 푸시 서비스 초기화는 향후 구현
    this.isInitialized = false;
  }

  /**
   * 푸시 알림 초기화 (FCM 등)
   */
  async initialize() {
    try {
      // TODO: Firebase Admin SDK 또는 다른 푸시 서비스 초기화
      this.isInitialized = true;
      logger.info('알림 서비스 초기화 완료');
    } catch (error) {
      logger.error(`알림 서비스 초기화 실패: ${error.message}`);
      throw error;
    }
  }

  /**
   * 단일 사용자에게 푸시 알림 발송
   */
  async sendPushNotification(user, notification) {
    try {
      const { title, body, data = {} } = notification;

      // 사용자가 푸시 알림을 허용했는지 확인
      if (!user.notificationSettings?.push) {
        logger.debug('푸시 알림이 비활성화된 사용자', { userId: user._id });
        return { success: false, reason: 'push_disabled' };
      }

      // 디바이스 토큰이 있는지 확인
      if (!user.deviceTokens || user.deviceTokens.length === 0) {
        logger.debug('디바이스 토큰이 없는 사용자', { userId: user._id });
        return { success: false, reason: 'no_device_tokens' };
      }

      const results = [];

      // 각 디바이스에 알림 발송
      for (const device of user.deviceTokens) {
        try {
          const result = await this.sendToDevice(device.token, {
            title,
            body,
            data: {
              ...data,
              platform: device.platform,
              timestamp: new Date().toISOString()
            }
          });

          results.push({
            deviceId: device._id,
            platform: device.platform,
            success: result.success,
            error: result.error
          });

        } catch (error) {
          results.push({
            deviceId: device._id,
            platform: device.platform,
            success: false,
            error: error.message
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      
      logger.info('푸시 알림 발송 완료', {
        userId: user._id,
        title,
        totalDevices: results.length,
        successCount
      });

      return {
        success: successCount > 0,
        results,
        successCount,
        totalDevices: results.length
      };

    } catch (error) {
      logger.error(`푸시 알림 발송 실패: ${error.message}`, { 
        userId: user._id,
        title: notification.title 
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * 특정 디바이스에 알림 발송
   */
  async sendToDevice(deviceToken, notification) {
    try {
      // 개발 환경에서는 로그만 출력
      if (process.env.NODE_ENV === 'development') {
        logger.info('🔔 [DEV] 푸시 알림 시뮬레이션', {
          deviceToken: deviceToken.substring(0, 20) + '...',
          title: notification.title,
          body: notification.body,
          data: notification.data
        });

        return { 
          success: true, 
          messageId: `dev_${Date.now()}`,
          simulation: true 
        };
      }

      // TODO: 실제 푸시 서비스 구현
      return { 
        success: true, 
        messageId: `temp_${Date.now()}` 
      };

    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
   * 알림 템플릿 생성
   */
  createReminderNotification(reminder, user) {
    const title = reminder.title;
    let body = `⏰ ${reminder.timeString}에 예정된 알림입니다.`;
    
    if (reminder.hasLocation && reminder.location.name) {
      body += ` 📍 ${reminder.location.name}`;
    }

    return {
      title,
      body,
      data: {
        type: 'reminder',
        reminderId: reminder._id.toString(),
        userId: user._id.toString(),
        hasLocation: reminder.hasLocation.toString(),
        time: reminder.timeString
      }
    };
  }

  /**
   * 위치 기반 알림 템플릿 생성
   */
  createLocationReminderNotification(reminder, user) {
    const title = '📍 위치 알림';
    const locationName = reminder.location.name || '지정된 장소';
    const body = `${locationName}을(를) 벗어났습니다. ${reminder.title} 잊으신 건 없나요?`;

    return {
      title,
      body,
      data: {
        type: 'location_reminder',
        reminderId: reminder._id.toString(),
        userId: user._id.toString(),
        locationName,
        latitude: reminder.location.latitude.toString(),
        longitude: reminder.location.longitude.toString()
      }
    };
  }

  /**
   * 코인 지급 알림 템플릿 생성
   */
  createCoinRewardNotification(coinReward) {
    return {
      title: '🪙 코인 획득!',
      body: `모든 알림을 완료하여 ${coinReward.amount}코인을 받았습니다!`,
      data: {
        type: 'coin_reward',
        amount: coinReward.amount.toString(),
        totalCoins: coinReward.totalCoins.toString(),
        reason: 'reminder_completion'
      }
    };
  }

  /**
   * 알림 발송 가능 여부 확인
   */
  isNotificationEnabled(user, type = 'reminder') {
    if (!user.notificationSettings) {
      return false;
    }

    switch (type) {
      case 'reminder':
        return user.notificationSettings.reminder && user.notificationSettings.push;
      case 'pomodoro':
        return user.notificationSettings.pomodoro && user.notificationSettings.push;
      default:
        return user.notificationSettings.push;
    }
  }
}

module.exports = new NotificationService();

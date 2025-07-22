const Reminder = require('../models/Reminder');
const User = require('../models/User');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

class ReminderService {
  /**
   * 사용자의 알림 목록 조회
   */
  async getUserReminders(userId) {
    try {
      const reminders = await Reminder.find({ userId, isActive: true })
        .sort({ 'time.hour': 1, 'time.minute': 1 })
        .lean();

      logger.info('사용자 알림 목록 조회 완료', { 
        userId, 
        reminderCount: reminders.length 
      });

      return reminders;
    } catch (error) {
      logger.error(`알림 목록 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 새 알림 생성
   */
  async createReminder(userId, reminderData) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      // 위치 설정이 있는 경우 유료 사용자인지 확인
      if (reminderData.location && reminderData.location.latitude && !user.isPremium) {
        throw new Error('위치 기반 알림은 유료 사용자만 이용할 수 있습니다.');
      }

      // 알림 타입 결정
      const hasLocation = reminderData.location && 
                         reminderData.location.latitude && 
                         reminderData.location.longitude;
      
      const reminderType = hasLocation ? 'time_and_location' : 'time_only';

      const reminder = new Reminder({
        userId,
        title: reminderData.title,
        time: {
          hour: reminderData.time.hour,
          minute: reminderData.time.minute
        },
        days: reminderData.days || [],
        location: hasLocation ? {
          name: reminderData.location.name || '',
          address: reminderData.location.address || '',
          latitude: reminderData.location.latitude,
          longitude: reminderData.location.longitude,
          radius: reminderData.location.radius || 100
        } : {},
        type: reminderType,
        isActive: true
      });

      await reminder.save();

      logger.info('알림 생성 완료', {
        userId,
        reminderId: reminder._id,
        title: reminder.title,
        type: reminderType,
        hasLocation
      });

      return reminder;
    } catch (error) {
      logger.error(`알림 생성 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 알림 수정
   */
  async updateReminder(userId, reminderId, updateData) {
    try {
      const reminder = await Reminder.findOne({ _id: reminderId, userId });
      if (!reminder) {
        throw new Error('알림을 찾을 수 없습니다.');
      }

      const user = await User.findById(userId);
      
      // 위치 설정 업데이트 시 유료 사용자 확인
      if (updateData.location && updateData.location.latitude && !user.isPremium) {
        throw new Error('위치 기반 알림은 유료 사용자만 이용할 수 있습니다.');
      }

      // 업데이트 적용
      if (updateData.title) reminder.title = updateData.title;
      if (updateData.time) {
        reminder.time.hour = updateData.time.hour;
        reminder.time.minute = updateData.time.minute;
      }
      if (updateData.days !== undefined) reminder.days = updateData.days;
      if (updateData.isActive !== undefined) reminder.isActive = updateData.isActive;

      // 위치 정보 업데이트
      if (updateData.location) {
        const hasLocation = updateData.location.latitude && updateData.location.longitude;
        
        if (hasLocation) {
          reminder.location = {
            name: updateData.location.name || '',
            address: updateData.location.address || '',
            latitude: updateData.location.latitude,
            longitude: updateData.location.longitude,
            radius: updateData.location.radius || 100
          };
          reminder.type = 'time_and_location';
        } else {
          reminder.location = {};
          reminder.type = 'time_only';
        }
      }

      await reminder.save();

      logger.info('알림 수정 완료', {
        userId,
        reminderId: reminder._id,
        title: reminder.title
      });

      return reminder;
    } catch (error) {
      logger.error(`알림 수정 실패: ${error.message}`, { userId, reminderId });
      throw error;
    }
  }

  /**
   * 알림 삭제
   */
  async deleteReminder(userId, reminderId) {
    try {
      const reminder = await Reminder.findOne({ _id: reminderId, userId });
      if (!reminder) {
        throw new Error('알림을 찾을 수 없습니다.');
      }

      await reminder.deleteOne();

      logger.info('알림 삭제 완료', {
        userId,
        reminderId,
        title: reminder.title
      });

      return { success: true };
    } catch (error) {
      logger.error(`알림 삭제 실패: ${error.message}`, { userId, reminderId });
      throw error;
    }
  }

  /**
   * 알림 완료 처리
   */
  async completeReminder(userId, reminderId) {
    try {
      const reminder = await Reminder.findOne({ _id: reminderId, userId });
      if (!reminder) {
        throw new Error('알림을 찾을 수 없습니다.');
      }

      // 이미 오늘 완료했는지 확인
      if (reminder.isCompletedToday()) {
        return {
          reminder,
          alreadyCompleted: true,
          coinReward: null
        };
      }

      // 알림 완료 처리
      await reminder.markCompleted();

      // 오늘 모든 알림이 완료되었는지 확인하고 코인 지급
      const coinReward = await this.checkDailyReminderCompletion(userId);

      logger.info('알림 완료 처리', {
        userId,
        reminderId,
        title: reminder.title,
        coinReward
      });

      return {
        reminder,
        alreadyCompleted: false,
        coinReward
      };
    } catch (error) {
      logger.error(`알림 완료 처리 실패: ${error.message}`, { userId, reminderId });
      throw error;
    }
  }

  /**
   * 일일 알림 완료 체크 및 코인 지급
   */
  async checkDailyReminderCompletion(userId) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.isPremium) {
        return null; // 무료 사용자는 코인 지급 없음
      }

      const today = new Date();
      const dayOfWeek = today.getDay();

      // 오늘 알림이 설정된 모든 활성 알림 조회
      const todayReminders = await Reminder.find({
        userId,
        isActive: true,
        days: dayOfWeek
      });

      if (todayReminders.length === 0) {
        return null;
      }

      // 모든 알림이 완료되었는지 확인
      const allCompleted = todayReminders.every(reminder => 
        reminder.isCompletedToday()
      );

      if (allCompleted) {
        // 오늘 이미 코인을 지급받았는지 확인
        const todayString = today.toISOString().split('T')[0];
        const alreadyRewarded = user.dailyRewards.some(
          reward => reward.date.toISOString().split('T')[0] === todayString && 
                   reward.type === 'reminder_completion'
        );

        if (!alreadyRewarded) {
          // 코인 지급
          const rewardAmount = 1;
          user.coins += rewardAmount;
          user.dailyRewards.push({
            type: 'reminder_completion',
            amount: rewardAmount,
            date: new Date(),
            description: '모든 알림 완료'
          });

          await user.save();

          logger.info('알림 완료 코인 지급', {
            userId,
            rewardAmount,
            totalCoins: user.coins,
            completedReminders: todayReminders.length
          });

          return {
            rewarded: true,
            amount: rewardAmount,
            totalCoins: user.coins,
            message: '모든 알림을 완료하여 코인을 받았습니다!'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error(`일일 알림 완료 체크 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 특정 시간의 알림 조회 (스케줄러용)
   */
  async getRemindersByTime(hour, minute, dayOfWeek) {
    try {
      return await Reminder.getRemindersByTime(hour, minute, dayOfWeek);
    } catch (error) {
      logger.error(`시간별 알림 조회 실패: ${error.message}`, { hour, minute, dayOfWeek });
      throw error;
    }
  }

  /**
   * 알림 통계 조회
   */
  async getReminderStats(userId, days = 30) {
    try {
      const stats = await Reminder.getUserStats(userId, days);
      
      // 전체 통계 계산
      const totalStats = await Reminder.aggregate([
        {
          $match: { userId: new mongoose.Types.ObjectId(userId) }
        },
        {
          $group: {
            _id: null,
            totalReminders: { $sum: 1 },
            averageCompletionRate: { $avg: '$stats.completionRate' },
            totalSent: { $sum: '$stats.totalSent' },
            totalCompleted: { $sum: '$stats.totalCompleted' }
          }
        }
      ]);

      logger.info('알림 통계 조회 완료', { userId, days });

      return {
        daily: stats,
        total: totalStats[0] || {
          totalReminders: 0,
          averageCompletionRate: 0,
          totalSent: 0,
          totalCompleted: 0
        }
      };
    } catch (error) {
      logger.error(`알림 통계 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }
}

module.exports = new ReminderService();

/**
 * 코인 시스템 서비스
 * Premium 사용자의 코인 적립/소모 관리
 * 
 * 코인 지급 조건:
 * - 포모도로 1 사이클 완료 (1일 1회)
 * - 하루 모든 Task 완료
 * - 망각방지 알림 전체 완료
 */

const CoinTransaction = require('../models/CoinTransaction');
const User = require('../models/User');
const logger = require('../utils/logger');

class CoinService {
  /**
   * 코인 지급 (Premium 전용)
   */
  async awardCoins(userId, reason, description = '', amount = 1) {
    try {
      // 사용자 확인 (Premium 전용)
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      if (user.subscriptionType !== 'premium') {
        throw new Error('Premium 구독이 필요한 기능입니다.');
      }

      // 중복 지급 방지 (하루 1회 제한이 있는 경우)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dailyLimitReasons = ['pomodoro_cycle', 'daily_tasks', 'reminder_complete'];
      
      if (dailyLimitReasons.includes(reason)) {
        const existingTransaction = await CoinTransaction.findOne({
          userId,
          reason,
          createdAt: {
            $gte: today,
            $lt: tomorrow
          }
        });

        if (existingTransaction) {
          logger.warn('이미 오늘 코인을 지급받았습니다', { 
            userId, 
            reason, 
            existingAmount: existingTransaction.amount 
          });
          return null; // 중복 지급 방지
        }
      }

      // 코인 거래 생성
      const transaction = new CoinTransaction({
        userId,
        type: 'earn',
        amount,
        reason,
        description,
        balanceAfter: user.coins + amount
      });

      await transaction.save();

      // 사용자 코인 잔액 업데이트
      user.coins += amount;
      await user.save();

      logger.info('코인 지급 완료', { 
        userId, 
        reason, 
        amount, 
        newBalance: user.coins 
      });

      return {
        amount,
        reason,
        description,
        newBalance: user.coins,
        transaction: transaction._id
      };

    } catch (error) {
      logger.error('코인 지급 실패', { 
        error: error.message, 
        userId, 
        reason, 
        amount 
      });
      throw error;
    }
  }

  /**
   * 코인 소모 (아이템 구매 등)
   */
  async spendCoins(userId, amount, reason, description = '') {
    try {
      // 사용자 확인
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      if (user.subscriptionType !== 'premium') {
        throw new Error('Premium 구독이 필요한 기능입니다.');
      }

      // 잔액 확인
      if (user.coins < amount) {
        throw new Error(`코인이 부족합니다. (보유: ${user.coins}, 필요: ${amount})`);
      }

      // 코인 거래 생성
      const transaction = new CoinTransaction({
        userId,
        type: 'spend',
        amount,
        reason,
        description,
        balanceAfter: user.coins - amount
      });

      await transaction.save();

      // 사용자 코인 잔액 업데이트
      user.coins -= amount;
      await user.save();

      logger.info('코인 소모 완료', { 
        userId, 
        reason, 
        amount, 
        newBalance: user.coins 
      });

      return {
        amount,
        reason,
        description,
        newBalance: user.coins,
        transaction: transaction._id
      };

    } catch (error) {
      logger.error('코인 소모 실패', { 
        error: error.message, 
        userId, 
        reason, 
        amount 
      });
      throw error;
    }
  }

  /**
   * 코인 잔액 조회
   */
  async getBalance(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      if (user.subscriptionType !== 'premium') {
        return { balance: 0, isPremium: false };
      }

      return { 
        balance: user.coins, 
        isPremium: true 
      };

    } catch (error) {
      logger.error('코인 잔액 조회 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * 코인 거래 내역 조회
   */
  async getTransactions(userId, limit = 20, page = 1) {
    try {
      const skip = (page - 1) * limit;

      const transactions = await CoinTransaction.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip)
        .select('type amount reason description balanceAfter createdAt');

      const totalCount = await CoinTransaction.countDocuments({ userId });

      return {
        transactions,
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalCount,
        hasNextPage: page < Math.ceil(totalCount / limit)
      };

    } catch (error) {
      logger.error('코인 거래 내역 조회 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * 코인 통계 조회 (월별)
   */
  async getMonthlyStats(userId, year, month) {
    try {
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

      const stats = await CoinTransaction.aggregate([
        {
          $match: {
            userId: userId,
            createdAt: {
              $gte: startOfMonth,
              $lte: endOfMonth
            }
          }
        },
        {
          $group: {
            _id: '$type',
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 },
            transactions: {
              $push: {
                amount: '$amount',
                reason: '$reason',
                description: '$description',
                createdAt: '$createdAt'
              }
            }
          }
        }
      ]);

      const earned = stats.find(s => s._id === 'earn') || { totalAmount: 0, count: 0, transactions: [] };
      const spent = stats.find(s => s._id === 'spend') || { totalAmount: 0, count: 0, transactions: [] };

      return {
        year,
        month,
        earned: {
          total: earned.totalAmount,
          count: earned.count,
          transactions: earned.transactions
        },
        spent: {
          total: spent.totalAmount,
          count: spent.count,
          transactions: spent.transactions
        },
        netGain: earned.totalAmount - spent.totalAmount
      };

    } catch (error) {
      logger.error('코인 월간 통계 조회 실패', { 
        error: error.message, 
        userId, 
        year, 
        month 
      });
      throw error;
    }
  }

  /**
   * 코인 획득 가능 여부 확인 (일일 제한)
   */
  async canEarnToday(userId, reason) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const dailyLimitReasons = ['pomodoro_cycle', 'daily_tasks', 'reminder_complete'];
      
      if (!dailyLimitReasons.includes(reason)) {
        return true; // 제한 없는 코인은 항상 획득 가능
      }

      const existingTransaction = await CoinTransaction.findOne({
        userId,
        reason,
        createdAt: {
          $gte: today,
          $lt: tomorrow
        }
      });

      return !existingTransaction;

    } catch (error) {
      logger.error('코인 획득 가능 여부 확인 실패', { 
        error: error.message, 
        userId, 
        reason 
      });
      throw error;
    }
  }
}

module.exports = new CoinService();

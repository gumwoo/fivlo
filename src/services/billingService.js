/**
 * 결제 및 구독 관리 서비스
 * Premium 구독 결제 세션 생성 및 웹훅 처리
 */

const User = require('../models/User');
const logger = require('../utils/logger');

class BillingService {
  /**
   * 구독 결제 세션 생성
   * POST /api/billing/checkout
   */
  async createCheckoutSession(userId, plan = 'premium') {
    try {
      logger.info('구독 결제 세션 생성 요청', { userId, plan });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      if (user.subscriptionType === 'premium') {
        throw new Error('이미 Premium 구독 중입니다.');
      }

      // 실제 결제 시스템 연동 시 구현 (Stripe, 아임포트 등)
      // 현재는 더미 데이터 반환
      const checkoutSession = {
        sessionId: `cs_test_${Date.now()}`,
        url: `https://checkout.fivlo.com/pay/${userId}`,
        plan,
        amount: 4900, // 월 4,900원
        currency: 'KRW'
      };

      logger.info('구독 결제 세션 생성 완료', { 
        userId, 
        sessionId: checkoutSession.sessionId,
        plan,
        amount: checkoutSession.amount
      });

      return checkoutSession;
    } catch (error) {
      logger.error('구독 결제 세션 생성 실패', { 
        error: error.message, 
        userId, 
        plan 
      });
      throw error;
    }
  }

  /**
   * 결제 웹훅 처리 (결제 성공 시 Premium 승격)
   * POST /api/billing/webhook
   */
  async handlePaymentWebhook(webhookData) {
    try {
      logger.info('결제 웹훅 수신', { webhookData });

      const { userId, sessionId, status, plan } = webhookData;

      if (status !== 'completed') {
        logger.warn('결제 미완료 상태', { userId, sessionId, status });
        return { success: false, message: '결제가 완료되지 않았습니다.' };
      }

      // 사용자 Premium 승격
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      // Premium 구독 활성화
      user.subscriptionType = 'premium';
      user.subscriptionStartDate = new Date();
      
      // 1개월 후 만료 (실제로는 결제 시스템에서 관리)
      const subscriptionEndDate = new Date();
      subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
      user.subscriptionEndDate = subscriptionEndDate;
      
      // 초기 코인 지급 (Premium 가입 보너스)
      user.coins += 10;

      await user.save();

      logger.info('Premium 구독 활성화 완료', { 
        userId, 
        sessionId,
        subscriptionEndDate: user.subscriptionEndDate,
        bonusCoins: 10
      });

      return { 
        success: true, 
        message: 'Premium 구독이 활성화되었습니다.',
        subscriptionEndDate: user.subscriptionEndDate,
        bonusCoins: 10
      };
    } catch (error) {
      logger.error('결제 웹훅 처리 실패', { 
        error: error.message, 
        webhookData 
      });
      throw error;
    }
  }

  /**
   * 구독 상태 조회
   * GET /api/users/me/subscription
   */
  async getSubscriptionStatus(userId) {
    try {
      logger.info('구독 상태 조회', { userId });

      const user = await User.findById(userId).select('subscriptionType subscriptionEndDate coins');
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      const subscription = {
        type: user.subscriptionType,
        isActive: user.subscriptionType === 'premium',
        endDate: user.subscriptionEndDate,
        coins: user.coins || 0
      };

      // Premium 구독 만료 확인
      if (user.subscriptionType === 'premium' && user.subscriptionEndDate) {
        const now = new Date();
        if (now > user.subscriptionEndDate) {
          // 구독 만료 처리
          user.subscriptionType = 'free';
          user.subscriptionEndDate = null;
          await user.save();
          
          subscription.type = 'free';
          subscription.isActive = false;
          subscription.endDate = null;

          logger.info('Premium 구독 만료 처리', { userId });
        }
      }

      logger.info('구독 상태 조회 완료', { 
        userId, 
        subscriptionType: subscription.type,
        isActive: subscription.isActive
      });

      return subscription;
    } catch (error) {
      logger.error('구독 상태 조회 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }

  /**
   * 구독 취소 (테스트용)
   */
  async cancelSubscription(userId) {
    try {
      logger.info('구독 취소 요청', { userId });

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('사용자를 찾을 수 없습니다.');
      }

      if (user.subscriptionType !== 'premium') {
        throw new Error('Premium 구독 중이 아닙니다.');
      }

      // 구독 취소 처리
      user.subscriptionType = 'free';
      user.subscriptionEndDate = null;
      await user.save();

      logger.info('구독 취소 완료', { userId });

      return { 
        success: true, 
        message: '구독이 취소되었습니다.' 
      };
    } catch (error) {
      logger.error('구독 취소 실패', { 
        error: error.message, 
        userId 
      });
      throw error;
    }
  }
}

module.exports = new BillingService();

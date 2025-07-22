const mongoose = require('mongoose');

const coinTransactionSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 거래 타입
  type: {
    type: String,
    enum: ['earn', 'spend'],
    required: true
  },

  // 거래 금액 (항상 양수)
  amount: {
    type: Number,
    required: true,
    min: 1
  },

  // 거래 이유 코드
  reason: {
    type: String,
    enum: [
      // 코인 적립 이유
      'pomodoro_cycle',      // 포모도로 1 사이클 완료
      'daily_tasks',         // 하루 모든 Task 완료
      'reminder_complete',   // 망각방지 알림 전체 완료
      'daily_login',         // 일일 로그인 보상
      'special_event',       // 특별 이벤트
      // 코인 소모 이유
      'item_purchase',       // 아이템 구매
      'customization',       // 커스터마이징
      'admin_adjustment'     // 관리자 조정
    ],
    required: true
  },

  // 거래 설명
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  // 거래 후 잔액
  balanceAfter: {
    type: Number,
    required: true,
    min: 0
  },

  // 관련 엔티티 ID (Task, 아이템 등)
  relatedId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  // 관련 엔티티 타입
  relatedType: {
    type: String,
    enum: ['task', 'pomodoro', 'reminder', 'shop_item', 'other'],
    default: 'other'
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
coinTransactionSchema.index({ userId: 1, createdAt: -1 });
coinTransactionSchema.index({ userId: 1, type: 1 });
coinTransactionSchema.index({ userId: 1, reason: 1, createdAt: -1 });

// 가상 필드
coinTransactionSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toISOString().split('T')[0];
});

// 정적 메서드: 사용자별 거래 내역
coinTransactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const {
    type = null,
    limit = 20,
    page = 1
  } = options;

  const query = { userId };
  if (type) query.type = type;

  const skip = (page - 1) * limit;

  return this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .select('type amount reason description balanceAfter createdAt');
};

// 정적 메서드: 월간 통계
coinTransactionSchema.statics.getMonthlyStats = async function(userId, year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
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
        count: { $sum: 1 }
      }
    }
  ]);
};

const CoinTransaction = mongoose.model('CoinTransaction', coinTransactionSchema);

module.exports = CoinTransaction;

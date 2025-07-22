const mongoose = require('mongoose');

const coinTransactionSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 거래 금액 (양수: 적립, 음수: 차감)
  amount: {
    type: Number,
    required: true
  },

  // 거래 후 잔액
  balanceAfter: {
    type: Number,
    required: true,
    min: 0
  },

  // 거래 타입
  type: {
    type: String,
    enum: [
      'earned_task_completion',      // Task 완료 보상
      'earned_pomodoro_completion',  // 포모도로 완료 보상
      'earned_reminder_completion',  // 알림 완료 보상
      'earned_daily_login',          // 일일 로그인 보상
      'earned_special_event',        // 특별 이벤트 보상
      'spent_item_purchase',         // 아이템 구매
      'spent_customization',         // 커스터마이징
      'refund_item_return',          // 아이템 환불
      'admin_adjustment'             // 관리자 조정
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

  // 관련 아이템 ID (아이템 구매 시)
  relatedItemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ShopItem',
    default: null
  },

  // 관련 참조 ID (Task, Pomodoro 등)
  relatedEntityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },

  // 관련 엔티티 타입
  relatedEntityType: {
    type: String,
    enum: ['task', 'pomodoro', 'reminder', 'shop_item', 'other'],
    default: 'other'
  },

  // 거래 상태
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'completed'
  },

  // 거래 메타데이터
  metadata: {
    userAgent: String,
    ipAddress: String,
    platform: String,
    version: String
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
coinTransactionSchema.index({ userId: 1, createdAt: -1 });
coinTransactionSchema.index({ userId: 1, type: 1 });
coinTransactionSchema.index({ type: 1, createdAt: -1 });
coinTransactionSchema.index({ status: 1 });

// 가상 필드
coinTransactionSchema.virtual('isEarned').get(function() {
  return this.amount > 0;
});

coinTransactionSchema.virtual('isSpent').get(function() {
  return this.amount < 0;
});

coinTransactionSchema.virtual('absoluteAmount').get(function() {
  return Math.abs(this.amount);
});

coinTransactionSchema.virtual('formattedDate').get(function() {
  return this.createdAt.toISOString().split('T')[0];
});

// 정적 메서드: 사용자별 코인 거래 내역 조회
coinTransactionSchema.statics.getUserTransactions = function(userId, options = {}) {
  const {
    type = null,
    startDate = null,
    endDate = null,
    limit = 50,
    skip = 0
  } = options;

  const query = { userId };

  if (type) {
    query.type = type;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  return this.find(query)
    .populate('relatedItemId', 'name imageUrl category')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// 정적 메서드: 사용자별 코인 통계
coinTransactionSchema.statics.getUserCoinStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  const summary = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalEarned: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        totalSpent: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
          }
        },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);

  return {
    byType: stats,
    summary: summary[0] || { totalEarned: 0, totalSpent: 0, totalTransactions: 0 }
  };
};

// 정적 메서드: 일별 코인 활동 조회
coinTransactionSchema.statics.getDailyCoinActivity = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        earned: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        spent: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
          }
        },
        transactions: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);
};

// 인스턴스 메서드: 거래 취소
coinTransactionSchema.methods.cancel = function(reason = '') {
  if (this.status !== 'pending') {
    throw new Error('완료된 거래는 취소할 수 없습니다.');
  }

  this.status = 'cancelled';
  this.description += ` (취소됨: ${reason})`;
  
  return this.save();
};

// 인스턴스 메서드: 거래 완료 처리
coinTransactionSchema.methods.complete = function() {
  if (this.status !== 'pending') {
    throw new Error('이미 처리된 거래입니다.');
  }

  this.status = 'completed';
  return this.save();
};

// 미들웨어: 거래 생성 전 유효성 검사
coinTransactionSchema.pre('save', function(next) {
  // 잔액이 음수가 되지 않도록 체크
  if (this.balanceAfter < 0) {
    const error = new Error('잔액이 부족합니다.');
    error.code = 'INSUFFICIENT_BALANCE';
    return next(error);
  }

  // 거래 금액이 0이 아닌지 체크
  if (this.amount === 0) {
    return next(new Error('거래 금액이 0일 수 없습니다.'));
  }

  next();
});

const CoinTransaction = mongoose.model('CoinTransaction', coinTransactionSchema);

module.exports = CoinTransaction;1 },
        avgAmount: { $avg: '$amount' }
}
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  const summary = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: null,
        totalEarned: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        totalSpent: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
          }
        },
        totalTransactions: { $sum: 1 }
      }
    }
  ]);

  return {
    byType: stats,
    summary: summary[0] || { totalEarned: 0, totalSpent: 0, totalTransactions: 0 }
  };
};

// 정적 메서드: 일별 코인 활동 조회
coinTransactionSchema.statics.getDailyCoinActivity = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate },
        status: 'completed'
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        },
        earned: {
          $sum: {
            $cond: [{ $gt: ['$amount', 0] }, '$amount', 0]
          }
        },
        spent: {
          $sum: {
            $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0]
          }
        },
        transactions: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);
};

// 인스턴스 메서드: 거래 취소
coinTransactionSchema.methods.cancel = function(reason = '') {
  if (this.status !== 'pending') {
    throw new Error('완료된 거래는 취소할 수 없습니다.');
  }

  this.status = 'cancelled';
  this.description += ` (취소됨: ${reason})`;
  
  return this.save();
};

// 인스턴스 메서드: 거래 완료 처리
coinTransactionSchema.methods.complete = function() {
  if (this.status !== 'pending') {
    throw new Error('이미 처리된 거래입니다.');
  }

  this.status = 'completed';
  return this.save();
};

// 미들웨어: 거래 생성 전 유효성 검사
coinTransactionSchema.pre('save', function(next) {
  // 잔액이 음수가 되지 않도록 체크
  if (this.balanceAfter < 0) {
    const error = new Error('잔액이 부족합니다.');
    error.code = 'INSUFFICIENT_BALANCE';
    return next(error);
  }

  // 거래 금액이 0이 아닌지 체크
  if (this.amount === 0) {
    return next(new Error('거래 금액이 0일 수 없습니다.'));
  }

  next();
});

const CoinTransaction = mongoose.model('CoinTransaction', coinTransactionSchema);

module.exports = CoinTransaction;

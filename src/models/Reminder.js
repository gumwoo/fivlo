const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 알림 제목
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  // 시간 설정
  time: {
    hour: {
      type: Number,
      required: true,
      min: 0,
      max: 23
    },
    minute: {
      type: Number,
      required: true,
      min: 0,
      max: 59
    }
  },

  // 요일 설정 (0: 일요일, 1: 월요일, ..., 6: 토요일)
  days: [{
    type: Number,
    min: 0,
    max: 6
  }],

  // 위치 설정 (유료 사용자만)
  location: {
    name: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null
    },
    address: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    },
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    radius: {
      type: Number, // 미터 단위
      default: 100,
      min: 50,
      max: 1000
    }
  },

  // 알림 활성 상태
  isActive: {
    type: Boolean,
    default: true
  },

  // 알림 타입
  type: {
    type: String,
    enum: ['time_only', 'time_and_location'],
    default: 'time_only'
  },

  // 마지막 알림 발송 시간
  lastNotifiedAt: {
    type: Date,
    default: null
  },

  // 알림 완료 기록
  completionHistory: [{
    date: {
      type: Date,
      required: true
    },
    completed: {
      type: Boolean,
      required: true
    },
    completedAt: {
      type: Date,
      default: null
    }
  }],

  // 통계 정보
  stats: {
    totalSent: {
      type: Number,
      default: 0
    },
    totalCompleted: {
      type: Number,
      default: 0
    },
    completionRate: {
      type: Number,
      default: 0
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
reminderSchema.index({ userId: 1, isActive: 1 });
reminderSchema.index({ userId: 1, createdAt: -1 });
reminderSchema.index({ 'time.hour': 1, 'time.minute': 1 });
reminderSchema.index({ days: 1 });

// 가상 필드
reminderSchema.virtual('timeString').get(function() {
  const hour = this.time.hour.toString().padStart(2, '0');
  const minute = this.time.minute.toString().padStart(2, '0');
  return `${hour}:${minute}`;
});

reminderSchema.virtual('hasLocation').get(function() {
  return this.location.latitude !== null && this.location.longitude !== null;
});

reminderSchema.virtual('isTimeOnly').get(function() {
  return this.type === 'time_only' || !this.hasLocation;
});

// 인스턴스 메서드: 오늘 알림이 이미 완료되었는지 확인
reminderSchema.methods.isCompletedToday = function() {
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  
  return this.completionHistory.some(record => {
    const recordDate = record.date.toISOString().split('T')[0];
    return recordDate === todayString && record.completed;
  });
};

// 인스턴스 메서드: 알림 완료 처리
reminderSchema.methods.markCompleted = function() {
  const today = new Date();
  const todayString = today.toISOString().split('T')[0];
  
  // 오늘 기록이 있는지 확인
  const existingRecord = this.completionHistory.find(record => {
    const recordDate = record.date.toISOString().split('T')[0];
    return recordDate === todayString;
  });

  if (existingRecord) {
    existingRecord.completed = true;
    existingRecord.completedAt = new Date();
  } else {
    this.completionHistory.push({
      date: new Date(),
      completed: true,
      completedAt: new Date()
    });
  }

  // 통계 업데이트
  this.stats.totalCompleted += 1;
  this.updateCompletionRate();

  return this.save();
};

// 인스턴스 메서드: 완료율 업데이트
reminderSchema.methods.updateCompletionRate = function() {
  if (this.stats.totalSent === 0) {
    this.stats.completionRate = 0;
  } else {
    this.stats.completionRate = Math.round((this.stats.totalCompleted / this.stats.totalSent) * 100);
  }
};

// 인스턴스 메서드: 알림 발송 기록
reminderSchema.methods.recordNotification = function() {
  this.lastNotifiedAt = new Date();
  this.stats.totalSent += 1;
  this.updateCompletionRate();
  return this.save();
};

// 정적 메서드: 활성 알림 조회
reminderSchema.statics.getActiveReminders = function(userId = null) {
  const query = { isActive: true };
  if (userId) {
    query.userId = userId;
  }
  
  return this.find(query)
    .populate('userId', 'isPremium deviceTokens')
    .sort({ 'time.hour': 1, 'time.minute': 1 });
};

// 정적 메서드: 특정 시간의 알림 조회
reminderSchema.statics.getRemindersByTime = function(hour, minute, dayOfWeek) {
  return this.find({
    isActive: true,
    'time.hour': hour,
    'time.minute': minute,
    days: dayOfWeek
  }).populate('userId', 'isPremium deviceTokens');
};

// 정적 메서드: 사용자별 알림 통계
reminderSchema.statics.getUserStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate }
      }
    },
    {
      $unwind: '$completionHistory'
    },
    {
      $match: {
        'completionHistory.date': { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$completionHistory.date' },
          month: { $month: '$completionHistory.date' },
          day: { $dayOfMonth: '$completionHistory.date' }
        },
        completed: {
          $sum: {
            $cond: [{ $eq: ['$completionHistory.completed', true] }, 1, 0]
          }
        },
        total: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);

  return stats;
};

const Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = Reminder;

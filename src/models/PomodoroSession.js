const mongoose = require('mongoose');

const pomodoroSessionSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 세션 기본 정보
  goal: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  color: {
    type: String,
    required: true,
    validate: {
      validator: function(color) {
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
      },
      message: '유효한 색상 코드를 입력해주세요. (예: #FF5733)'
    }
  },

  // 세션 타입
  type: {
    type: String,
    enum: ['focus', 'break'],
    required: true
  },

  // 세션 시간 (분 단위)
  duration: {
    type: Number,
    required: true,
    min: 1,
    max: 120 // 최대 2시간
  },

  // 실제 진행 시간 (초 단위)
  actualDuration: {
    type: Number,
    default: 0,
    min: 0
  },

  // 세션 상태
  status: {
    type: String,
    enum: ['pending', 'running', 'paused', 'completed', 'cancelled'],
    default: 'pending'
  },

  // 시간 정보
  startTime: {
    type: Date,
    default: null
  },

  endTime: {
    type: Date,
    default: null
  },

  pausedAt: {
    type: Date,
    default: null
  },

  // 일시정지 총 시간 (초 단위)
  totalPausedTime: {
    type: Number,
    default: 0
  },

  // 포모도로 사이클 정보
  cycleId: {
    type: String,
    index: true // 같은 사이클 그룹핑용
  },

  cyclePosition: {
    type: Number,
    default: 1 // 사이클 내 순서 (1: 첫 집중, 2: 첫 휴식, 3: 두번째 집중...)
  },

  // 완료 관련
  isCompleted: {
    type: Boolean,
    default: false
  },

  completedAt: {
    type: Date,
    default: null
  },

  // 코인 지급 여부
  coinAwarded: {
    type: Boolean,
    default: false
  },

  coinAmount: {
    type: Number,
    default: 0
  },

  // 통계 정보
  focusScore: {
    type: Number,
    min: 0,
    max: 100,
    default: null // 세션 완료 후 계산
  },

  // 메모/노트
  notes: {
    type: String,
    trim: true,
    maxlength: 500
  },

  // 디바이스 정보
  deviceInfo: {
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      default: 'web'
    },
    userAgent: String
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
pomodoroSessionSchema.index({ userId: 1, createdAt: -1 });
pomodoroSessionSchema.index({ userId: 1, status: 1 });
pomodoroSessionSchema.index({ userId: 1, type: 1, createdAt: -1 });
pomodoroSessionSchema.index({ cycleId: 1, cyclePosition: 1 });
pomodoroSessionSchema.index({ createdAt: -1 });
pomodoroSessionSchema.index({ completedAt: -1 });

// 가상 필드
pomodoroSessionSchema.virtual('remainingTime').get(function() {
  if (this.status !== 'running') return 0;
  
  const now = new Date();
  const elapsed = Math.floor((now - this.startTime) / 1000) - this.totalPausedTime;
  const target = this.duration * 60; // 분을 초로 변환
  
  return Math.max(0, target - elapsed);
});

pomodoroSessionSchema.virtual('progress').get(function() {
  if (this.status === 'pending') return 0;
  if (this.status === 'completed') return 100;
  
  const target = this.duration * 60;
  const progress = (this.actualDuration / target) * 100;
  
  return Math.min(100, Math.max(0, progress));
});

pomodoroSessionSchema.virtual('elapsedTime').get(function() {
  if (!this.startTime) return 0;
  
  const endTime = this.endTime || new Date();
  const elapsed = Math.floor((endTime - this.startTime) / 1000) - this.totalPausedTime;
  
  return Math.max(0, elapsed);
});

// 미들웨어: 세션 완료 시 통계 업데이트
pomodoroSessionSchema.pre('save', function(next) {
  // 세션이 완료되었고 아직 완료 처리되지 않은 경우
  if (this.isCompleted && !this.completedAt) {
    this.completedAt = new Date();
    this.status = 'completed';
    
    // 실제 소요 시간 계산
    if (this.startTime) {
      this.actualDuration = this.elapsedTime;
    }
  }
  
  next();
});

// 미들웨어: 세션 완료 후 사용자 통계 업데이트
pomodoroSessionSchema.post('save', async function(doc) {
  if (doc.isCompleted && doc.type === 'focus' && !doc.coinAwarded) {
    try {
      const User = mongoose.model('User');
      const user = await User.findById(doc.userId);
      
      if (user) {
        // 총 포모도로 세션 수 증가
        user.totalPomodoroSessions = (user.totalPomodoroSessions || 0) + 1;
        
        // 총 집중 시간 증가 (분 단위)
        const focusMinutes = Math.floor(doc.actualDuration / 60);
        user.totalFocusTime = (user.totalFocusTime || 0) + focusMinutes;
        
        await user.save();
      }
    } catch (error) {
      console.error('사용자 통계 업데이트 실패:', error);
    }
  }
});

// 정적 메서드: 활성 세션 조회
pomodoroSessionSchema.statics.findActiveSession = function(userId) {
  return this.findOne({
    userId,
    status: { $in: ['running', 'paused'] }
  }).sort({ createdAt: -1 });
};

// 정적 메서드: 일일 통계 조회
pomodoroSessionSchema.statics.getDailyStats = function(userId, date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        completedAt: {
          $gte: startOfDay,
          $lte: endOfDay
        },
        isCompleted: true
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalDuration: { $sum: '$actualDuration' },
        totalTargetDuration: { $sum: { $multiply: ['$duration', 60] } }
      }
    }
  ]);
};

// 정적 메서드: 사이클 완료 확인
pomodoroSessionSchema.statics.checkCycleCompletion = async function(cycleId) {
  const sessions = await this.find({ cycleId }).sort({ cyclePosition: 1 });
  
  // 최소 포모도로 사이클: 집중(25분) + 휴식(5분)
  if (sessions.length < 2) return false;
  
  const focusSession = sessions.find(s => s.type === 'focus');
  const breakSession = sessions.find(s => s.type === 'break');
  
  return focusSession?.isCompleted && breakSession?.isCompleted;
};

// 인스턴스 메서드: 세션 시작
pomodoroSessionSchema.methods.start = function() {
  if (this.status !== 'pending' && this.status !== 'paused') {
    throw new Error('세션을 시작할 수 없는 상태입니다.');
  }
  
  this.status = 'running';
  
  if (!this.startTime) {
    this.startTime = new Date();
  }
  
  if (this.pausedAt) {
    // 일시정지에서 재개하는 경우
    const pauseDuration = Math.floor((new Date() - this.pausedAt) / 1000);
    this.totalPausedTime += pauseDuration;
    this.pausedAt = null;
  }
  
  return this.save();
};

// 인스턴스 메서드: 세션 일시정지
pomodoroSessionSchema.methods.pause = function() {
  if (this.status !== 'running') {
    throw new Error('진행 중인 세션만 일시정지할 수 있습니다.');
  }
  
  this.status = 'paused';
  this.pausedAt = new Date();
  
  return this.save();
};

// 인스턴스 메서드: 세션 완료
pomodoroSessionSchema.methods.complete = function() {
  this.isCompleted = true;
  this.endTime = new Date();
  
  return this.save();
};

// 인스턴스 메서드: 세션 취소
pomodoroSessionSchema.methods.cancel = function() {
  this.status = 'cancelled';
  this.endTime = new Date();
  
  return this.save();
};

const PomodoroSession = mongoose.model('PomodoroSession', pomodoroSessionSchema);

module.exports = PomodoroSession;

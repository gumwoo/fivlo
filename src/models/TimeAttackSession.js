const mongoose = require('mongoose');

const timeAttackSessionSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // 목표 정보
  goal: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },

  // 총 소요 시간 (분)
  totalMinutes: {
    type: Number,
    required: true,
    min: 1,
    max: 180 // 최대 3시간
  },

  // 단계별 설정
  steps: [{
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50
    },
    minutes: {
      type: Number,
      required: true,
      min: 1
    },
    order: {
      type: Number,
      required: true
    },
    completed: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date,
      default: null
    }
  }],

  // 세션 상태
  status: {
    type: String,
    enum: ['ready', 'in_progress', 'paused', 'completed', 'abandoned'],
    default: 'ready'
  },

  // 현재 단계
  currentStepIndex: {
    type: Number,
    default: 0
  },

  // 시작/종료 시간
  startedAt: {
    type: Date,
    default: null
  },

  pausedAt: {
    type: Date,
    default: null
  },

  completedAt: {
    type: Date,
    default: null
  },

  // 실제 소요 시간 추적
  actualDuration: {
    type: Number,
    default: 0 // 초 단위
  },

  pauseDuration: {
    type: Number,
    default: 0 // 일시정지된 총 시간 (초)
  },

  // AI 추천 여부
  isAiGenerated: {
    type: Boolean,
    default: false
  },

  aiPrompt: {
    type: String,
    default: null
  },

  // 사용자 수정 사항
  userModifications: [{
    field: String,
    originalValue: mongoose.Schema.Types.Mixed,
    newValue: mongoose.Schema.Types.Mixed,
    modifiedAt: {
      type: Date,
      default: Date.now
    }
  }],

  // 성과 기록
  performance: {
    plannedTime: Number, // 계획된 시간 (초)
    actualTime: Number,  // 실제 소요 시간 (초)
    efficiency: Number,  // 효율성 (계획 대비 실제)
    stepAccuracy: Number // 단계별 시간 정확도
  },

  // 메타데이터
  metadata: {
    platform: String,
    version: String,
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        default: [0, 0]
      }
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
timeAttackSessionSchema.index({ userId: 1, createdAt: -1 });
timeAttackSessionSchema.index({ status: 1 });
timeAttackSessionSchema.index({ startedAt: 1 });
timeAttackSessionSchema.index({ 'metadata.location': '2dsphere' });

// 가상 필드
timeAttackSessionSchema.virtual('remainingTime').get(function() {
  if (this.status !== 'in_progress') return 0;
  
  const now = new Date();
  const elapsed = Math.floor((now - this.startedAt) / 1000) - this.pauseDuration;
  const totalPlannedSeconds = this.totalMinutes * 60;
  
  return Math.max(0, totalPlannedSeconds - elapsed);
});

timeAttackSessionSchema.virtual('currentStep').get(function() {
  if (this.currentStepIndex >= this.steps.length) return null;
  return this.steps[this.currentStepIndex];
});

timeAttackSessionSchema.virtual('progress').get(function() {
  const completedSteps = this.steps.filter(step => step.completed).length;
  return (completedSteps / this.steps.length) * 100;
});

// 세션 시작 메서드
timeAttackSessionSchema.methods.start = function() {
  this.status = 'in_progress';
  this.startedAt = new Date();
  this.pausedAt = null;
  return this.save();
};

// 세션 일시정지 메서드
timeAttackSessionSchema.methods.pause = function() {
  if (this.status === 'in_progress') {
    this.status = 'paused';
    this.pausedAt = new Date();
    return this.save();
  }
  throw new Error('세션이 진행 중이 아닙니다.');
};

// 세션 재개 메서드
timeAttackSessionSchema.methods.resume = function() {
  if (this.status === 'paused' && this.pausedAt) {
    this.status = 'in_progress';
    this.pauseDuration += Math.floor((new Date() - this.pausedAt) / 1000);
    this.pausedAt = null;
    return this.save();
  }
  throw new Error('일시정지된 세션이 아닙니다.');
};

// 다음 단계 진행 메서드
timeAttackSessionSchema.methods.nextStep = function() {
  if (this.currentStepIndex < this.steps.length) {
    // 현재 단계 완료 처리
    this.steps[this.currentStepIndex].completed = true;
    this.steps[this.currentStepIndex].completedAt = new Date();
    
    // 다음 단계로 이동
    this.currentStepIndex += 1;
    
    // 모든 단계 완료 시 세션 완료
    if (this.currentStepIndex >= this.steps.length) {
      return this.complete();
    }
    
    return this.save();
  }
  throw new Error('더 이상 진행할 단계가 없습니다.');
};

// 세션 완료 메서드
timeAttackSessionSchema.methods.complete = function() {
  this.status = 'completed';
  this.completedAt = new Date();
  
  // 성과 계산
  this.actualDuration = Math.floor((this.completedAt - this.startedAt) / 1000) - this.pauseDuration;
  this.performance = {
    plannedTime: this.totalMinutes * 60,
    actualTime: this.actualDuration,
    efficiency: (this.totalMinutes * 60) / this.actualDuration,
    stepAccuracy: this.calculateStepAccuracy()
  };
  
  return this.save();
};

// 단계별 정확도 계산 메서드
timeAttackSessionSchema.methods.calculateStepAccuracy = function() {
  let totalAccuracy = 0;
  let completedSteps = 0;
  
  this.steps.forEach((step, index) => {
    if (step.completed && step.completedAt) {
      const plannedTime = step.minutes * 60;
      const actualTime = this.getStepActualTime(index);
      const accuracy = Math.min(1, plannedTime / actualTime);
      totalAccuracy += accuracy;
      completedSteps += 1;
    }
  });
  
  return completedSteps > 0 ? totalAccuracy / completedSteps : 0;
};

// 특정 단계의 실제 소요 시간 계산
timeAttackSessionSchema.methods.getStepActualTime = function(stepIndex) {
  // 실제 구현에서는 더 정교한 시간 추적이 필요
  // 현재는 단순하게 평균 시간으로 계산
  return this.actualDuration / this.steps.length;
};

// 정적 메서드: AI 추천 세션 생성
timeAttackSessionSchema.statics.createFromAI = async function(userId, aiRecommendation) {
  const session = new this({
    userId,
    goal: aiRecommendation.goal,
    totalMinutes: aiRecommendation.totalMinutes,
    steps: aiRecommendation.steps.map((step, index) => ({
      ...step,
      order: index,
      completed: false
    })),
    isAiGenerated: true,
    aiPrompt: aiRecommendation.prompt
  });
  
  return await session.save();
};

// 정적 메서드: 사용자별 통계 조회
timeAttackSessionSchema.statics.getUserStats = async function(userId, period = 'week') {
  const startDate = new Date();
  if (period === 'week') {
    startDate.setDate(startDate.getDate() - 7);
  } else if (period === 'month') {
    startDate.setMonth(startDate.getMonth() - 1);
  }
  
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
        _id: null,
        totalSessions: { $sum: 1 },
        totalTime: { $sum: '$actualDuration' },
        avgEfficiency: { $avg: '$performance.efficiency' },
        avgStepAccuracy: { $avg: '$performance.stepAccuracy' }
      }
    }
  ]);
  
  return stats[0] || {
    totalSessions: 0,
    totalTime: 0,
    avgEfficiency: 0,
    avgStepAccuracy: 0
  };
};

const TimeAttackSession = mongoose.model('TimeAttackSession', timeAttackSessionSchema);

module.exports = TimeAttackSession;

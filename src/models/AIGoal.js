const mongoose = require('mongoose');

/**
 * AI 생성 목표 스키마
 */
const aiGoalSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 원본 목표 정보
  originalGoal: {
    goal: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    duration: {
      type: String,
      trim: true
    },
    currentSituation: {
      type: String,
      trim: true
    },
    availableTime: {
      type: String,
      trim: true
    },
    experienceLevel: {
      type: String,
      enum: ['초보', '중급', '고급'],
      default: '초보'
    }
  },

  // AI 분석 결과
  aiAnalysis: {
    analysis: {
      type: String,
      required: true
    },
    timeline: {
      type: String,
      required: true
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true
    },
    tips: [{
      type: String,
      trim: true
    }],
    motivation: {
      type: String,
      trim: true
    }
  },

  // 생성된 태스크들
  generatedTasks: [{
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    estimatedTime: {
      type: String,
      trim: true
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      default: 'medium'
    },
    category: {
      type: String,
      enum: ['study', 'exercise', 'work', 'habit', 'other'],
      default: 'other'
    },
    week: {
      type: Number,
      min: 1,
      default: 1
    },
    isCompleted: {
      type: Boolean,
      default: false
    },
    completedAt: {
      type: Date
    },
    // 실제 Task 모델과 연결될 ID
    linkedTaskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task'
    }
  }],

  // 목표 상태
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'paused', 'cancelled'],
    default: 'draft'
  },

  // 진행 상황
  progress: {
    completedTasks: {
      type: Number,
      default: 0
    },
    totalTasks: {
      type: Number,
      default: 0
    },
    completionPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    timeSpent: {
      type: Number,
      default: 0 // 분 단위
    }
  },

  // 사용자 피드백
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5
    },
    comment: {
      type: String,
      trim: true
    },
    difficulty: {
      type: String,
      enum: ['too_easy', 'just_right', 'too_hard']
    },
    usefulness: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  // 일정 정보
  schedule: {
    startDate: {
      type: Date
    },
    endDate: {
      type: Date
    },
    estimatedDuration: {
      type: Number // 일 단위
    }
  },

  // 통계 정보
  stats: {
    aiGenerationTime: {
      type: Number // 밀리초
    },
    userEngagement: {
      type: Number,
      default: 0
    },
    tasksAdoptionRate: {
      type: Number,
      default: 0 // 생성된 태스크 중 실제 사용한 비율
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
aiGoalSchema.index({ userId: 1, status: 1 });
aiGoalSchema.index({ userId: 1, createdAt: -1 });
aiGoalSchema.index({ 'progress.completionPercentage': 1 });
aiGoalSchema.index({ 'aiAnalysis.difficulty': 1 });

// 가상 필드
aiGoalSchema.virtual('isActive').get(function() {
  return this.status === 'active';
});

aiGoalSchema.virtual('isCompleted').get(function() {
  return this.status === 'completed' || this.progress.completionPercentage >= 100;
});

aiGoalSchema.virtual('remainingTasks').get(function() {
  return this.progress.totalTasks - this.progress.completedTasks;
});

aiGoalSchema.virtual('averageTaskTime').get(function() {
  return this.progress.completedTasks > 0 ? 
    Math.round(this.progress.timeSpent / this.progress.completedTasks) : 0;
});

// 인스턴스 메서드: 진행률 업데이트
aiGoalSchema.methods.updateProgress = function() {
  const completedTasks = this.generatedTasks.filter(task => task.isCompleted).length;
  this.progress.completedTasks = completedTasks;
  this.progress.totalTasks = this.generatedTasks.length;
  this.progress.completionPercentage = this.progress.totalTasks > 0 ? 
    Math.round((completedTasks / this.progress.totalTasks) * 100) : 0;

  // 완료 상태 자동 업데이트
  if (this.progress.completionPercentage >= 100 && this.status === 'active') {
    this.status = 'completed';
  }

  return this.save();
};

// 인스턴스 메서드: 태스크 완료 처리
aiGoalSchema.methods.completeTask = function(taskIndex, timeSpent = 0) {
  if (taskIndex >= 0 && taskIndex < this.generatedTasks.length) {
    this.generatedTasks[taskIndex].isCompleted = true;
    this.generatedTasks[taskIndex].completedAt = new Date();
    this.progress.timeSpent += timeSpent;
    
    return this.updateProgress();
  }
  throw new Error('유효하지 않은 태스크 인덱스입니다');
};

// 인스턴스 메서드: 실제 Task와 연결
aiGoalSchema.methods.linkToTask = function(taskIndex, taskId) {
  if (taskIndex >= 0 && taskIndex < this.generatedTasks.length) {
    this.generatedTasks[taskIndex].linkedTaskId = taskId;
    return this.save();
  }
  throw new Error('유효하지 않은 태스크 인덱스입니다');
};

// 정적 메서드: 사용자별 활성 목표 조회
aiGoalSchema.statics.getActiveGoals = function(userId) {
  return this.find({ 
    userId, 
    status: { $in: ['active', 'draft'] } 
  }).sort({ createdAt: -1 });
};

// 정적 메서드: 완료된 목표 통계
aiGoalSchema.statics.getUserStats = async function(userId) {
  const stats = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalGoals: { $sum: 1 },
        completedGoals: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        totalTasks: { $sum: '$progress.totalTasks' },
        completedTasks: { $sum: '$progress.completedTasks' },
        totalTimeSpent: { $sum: '$progress.timeSpent' },
        avgRating: { $avg: '$feedback.rating' }
      }
    }
  ]);

  return stats[0] || {
    totalGoals: 0,
    completedGoals: 0,
    totalTasks: 0,
    completedTasks: 0,
    totalTimeSpent: 0,
    avgRating: 0
  };
};

// 정적 메서드: 난이도별 성공률 분석
aiGoalSchema.statics.getDifficultyAnalysis = async function() {
  return await this.aggregate([
    { $match: { status: { $in: ['completed', 'active'] } } },
    {
      $group: {
        _id: '$aiAnalysis.difficulty',
        totalGoals: { $sum: 1 },
        completedGoals: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        avgCompletionRate: { $avg: '$progress.completionPercentage' },
        avgRating: { $avg: '$feedback.rating' }
      }
    },
    {
      $addFields: {
        successRate: {
          $multiply: [
            { $divide: ['$completedGoals', '$totalGoals'] },
            100
          ]
        }
      }
    }
  ]);
};

const AIGoal = mongoose.model('AIGoal', aiGoalSchema);

module.exports = AIGoal;

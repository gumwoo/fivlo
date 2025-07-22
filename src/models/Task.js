const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 카테고리 정보
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
    index: true
  },

  // Task 기본 정보
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },

  // 날짜 및 시간
  date: {
    type: Date,
    required: true,
    index: true
  },

  time: {
    type: String, // HH:MM 형식
    default: null
  },

  // 완료 상태
  isCompleted: {
    type: Boolean,
    default: false,
    index: true
  },

  completedAt: {
    type: Date,
    default: null
  },

  // 반복 설정
  isRepeating: {
    type: Boolean,
    default: false
  },

  repeatType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: null
  },

  repeatDays: [{
    type: Number, // 0: 일요일, 1: 월요일, ..., 6: 토요일
    min: 0,
    max: 6
  }],

  repeatEndDate: {
    type: Date,
    default: null
  },

  // 성장앨범 연동
  hasGrowthAlbum: {
    type: Boolean,
    default: false
  },

  growthAlbumRequired: {
    type: Boolean,
    default: false // 완료 시 사진 촬영 필수 여부
  },

  // AI 생성 여부
  aiGenerated: {
    type: Boolean,
    default: false
  },

  // AI 목표 연결
  aiGoalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AIGoal',
    default: null
  },

  // AI 태스크 인덱스 (원본 AI 목표에서의 순서)
  aiTaskIndex: {
    type: Number,
    default: null
  },

  // 우선순위
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  // 색상 (카테고리에서 상속되지만 개별 설정 가능)
  color: {
    type: String,
    validate: {
      validator: function(color) {
        if (!color) return true; // null 허용
        return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
      },
      message: '유효한 색상 코드를 입력해주세요.'
    }
  },

  // 태그
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],

  // 메모
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },

  // 원본 Task (반복 Task의 경우)
  originalTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },

  // 예상 소요 시간 (분)
  estimatedMinutes: {
    type: Number,
    min: 0,
    default: null
  },

  // 실제 소요 시간 (분)
  actualMinutes: {
    type: Number,
    min: 0,
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
taskSchema.index({ userId: 1, date: 1 });
taskSchema.index({ userId: 1, isCompleted: 1, date: 1 });
taskSchema.index({ userId: 1, categoryId: 1, date: 1 });
taskSchema.index({ userId: 1, isRepeating: 1 });
taskSchema.index({ date: 1, isCompleted: 1 });

// 가상 필드
taskSchema.virtual('formattedDate').get(function() {
  return this.date.toISOString().split('T')[0]; // YYYY-MM-DD
});

taskSchema.virtual('isOverdue').get(function() {
  if (this.isCompleted) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(this.date);
  taskDate.setHours(0, 0, 0, 0);
  return taskDate < today;
});

taskSchema.virtual('isToday').get(function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const taskDate = new Date(this.date);
  taskDate.setHours(0, 0, 0, 0);
  return taskDate.getTime() === today.getTime();
});

// 미들웨어: Task 완료 시 카테고리 통계 업데이트
taskSchema.post('save', async function(doc) {
  if (doc.isModified('isCompleted')) {
    try {
      const Category = mongoose.model('Category');
      const category = await Category.findById(doc.categoryId);
      if (category) {
        await category.updateStats();
      }
    } catch (error) {
      console.error('카테고리 통계 업데이트 실패:', error);
    }
  }
});

// 미들웨어: Task 삭제 시 카테고리 통계 업데이트
taskSchema.post('deleteOne', { document: true, query: false }, async function() {
  try {
    const Category = mongoose.model('Category');
    const category = await Category.findById(this.categoryId);
    if (category) {
      await category.updateStats();
    }
  } catch (error) {
    console.error('카테고리 통계 업데이트 실패:', error);
  }
});

// 정적 메서드: 날짜별 Task 조회
taskSchema.statics.getTasksByDate = function(userId, date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return this.find({
    userId,
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  })
  .populate('categoryId', 'name color')
  .sort({ time: 1, createdAt: 1 });
};

// 정적 메서드: 월별 Task 조회 (캘린더용)
taskSchema.statics.getMonthlyTasks = function(userId, year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  return this.find({
    userId,
    date: {
      $gte: startOfMonth,
      $lte: endOfMonth
    }
  })
  .populate('categoryId', 'name color')
  .sort({ date: 1, time: 1 });
};

// 정적 메서드: 반복 Task 생성
taskSchema.statics.createRepeatingTasks = async function(originalTask, endDate) {
  const tasks = [];
  const currentDate = new Date(originalTask.date);
  currentDate.setDate(currentDate.getDate() + 1); // 다음 날부터 시작

  while (currentDate <= endDate) {
    let shouldCreate = false;

    switch (originalTask.repeatType) {
      case 'daily':
        shouldCreate = true;
        break;
      case 'weekly':
        if (originalTask.repeatDays.includes(currentDate.getDay())) {
          shouldCreate = true;
        }
        break;
      case 'monthly':
        if (currentDate.getDate() === originalTask.date.getDate()) {
          shouldCreate = true;
        }
        break;
    }

    if (shouldCreate) {
      const newTask = new this({
        ...originalTask.toObject(),
        _id: undefined,
        date: new Date(currentDate),
        isCompleted: false,
        completedAt: null,
        originalTaskId: originalTask._id,
        createdAt: undefined,
        updatedAt: undefined
      });

      tasks.push(newTask);
    }

    // 다음 날로 이동
    currentDate.setDate(currentDate.getDate() + 1);
  }

  if (tasks.length > 0) {
    return await this.insertMany(tasks);
  }

  return [];
};

// 인스턴스 메서드: Task 완료 처리
taskSchema.methods.complete = function(actualMinutes = null) {
  this.isCompleted = true;
  this.completedAt = new Date();
  if (actualMinutes !== null) {
    this.actualMinutes = actualMinutes;
  }
  return this.save();
};

// 인스턴스 메서드: Task 완료 취소
taskSchema.methods.uncomplete = function() {
  this.isCompleted = false;
  this.completedAt = null;
  return this.save();
};

// 인스턴스 메서드: 반복 Task 생성
taskSchema.methods.createRepeatingTasks = async function() {
  if (!this.isRepeating || !this.repeatEndDate) {
    return [];
  }

  return await this.constructor.createRepeatingTasks(this, this.repeatEndDate);
};

// 인스턴스 메서드: Task 복제
taskSchema.methods.duplicate = function(newDate) {
  const duplicatedTask = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    date: newDate,
    isCompleted: false,
    completedAt: null,
    originalTaskId: null,
    createdAt: undefined,
    updatedAt: undefined
  });

  return duplicatedTask.save();
};

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;

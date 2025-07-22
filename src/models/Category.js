const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 카테고리 기본 정보
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
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

  // 카테고리 설정
  isDefault: {
    type: Boolean,
    default: false // '일상' 카테고리만 true
  },

  isActive: {
    type: Boolean,
    default: true
  },

  // 아이콘 (향후 확장용)
  icon: {
    type: String,
    default: null
  },

  // 순서 (사용자 정의 순서)
  order: {
    type: Number,
    default: 0
  },

  // 통계 정보
  taskCount: {
    type: Number,
    default: 0
  },

  completedTaskCount: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
categorySchema.index({ userId: 1, name: 1 }, { unique: true }); // 사용자별 카테고리명 유일성
categorySchema.index({ userId: 1, order: 1 });
categorySchema.index({ userId: 1, isActive: 1 });

// 가상 필드
categorySchema.virtual('completionRate').get(function() {
  if (this.taskCount === 0) return 0;
  return Math.round((this.completedTaskCount / this.taskCount) * 100);
});

// 미들웨어: 카테고리 삭제 시 해당 카테고리의 Task들을 기본 카테고리로 이동
categorySchema.pre('deleteOne', { document: true, query: false }, async function() {
  try {
    if (this.isDefault) {
      throw new Error('기본 카테고리는 삭제할 수 없습니다.');
    }

    const Task = mongoose.model('Task');
    
    // 기본 카테고리 찾기
    const defaultCategory = await mongoose.model('Category').findOne({
      userId: this.userId,
      isDefault: true
    });

    if (defaultCategory) {
      // 해당 카테고리의 모든 Task를 기본 카테고리로 이동
      await Task.updateMany(
        { categoryId: this._id },
        { 
          categoryId: defaultCategory._id,
          color: defaultCategory.color 
        }
      );
    }
  } catch (error) {
    console.error('카테고리 삭제 전 처리 오류:', error);
    throw error;
  }
});

// 정적 메서드: 사용자의 기본 카테고리 생성
categorySchema.statics.createDefaultCategory = async function(userId) {
  try {
    const existingDefault = await this.findOne({
      userId,
      isDefault: true
    });

    if (existingDefault) {
      return existingDefault;
    }

    const defaultCategory = new this({
      userId,
      name: '일상',
      color: '#4ECDC4', // 기본 청록색
      isDefault: true,
      order: 0
    });

    return await defaultCategory.save();
  } catch (error) {
    console.error('기본 카테고리 생성 실패:', error);
    throw error;
  }
};

// 정적 메서드: 사용자 카테고리 목록 조회
categorySchema.statics.getUserCategories = function(userId) {
  return this.find({ 
    userId, 
    isActive: true 
  }).sort({ order: 1, createdAt: 1 });
};

// 인스턴스 메서드: 통계 업데이트
categorySchema.methods.updateStats = async function() {
  try {
    const Task = mongoose.model('Task');
    
    const stats = await Task.aggregate([
      {
        $match: { categoryId: this._id }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: {
              $cond: [{ $eq: ['$isCompleted', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    if (stats.length > 0) {
      this.taskCount = stats[0].total;
      this.completedTaskCount = stats[0].completed;
    } else {
      this.taskCount = 0;
      this.completedTaskCount = 0;
    }

    return await this.save();
  } catch (error) {
    console.error('카테고리 통계 업데이트 실패:', error);
    throw error;
  }
};

// 인스턴스 메서드: 카테고리 순서 변경
categorySchema.methods.updateOrder = async function(newOrder) {
  try {
    // 같은 사용자의 다른 카테고리들 순서 조정
    await mongoose.model('Category').updateMany(
      {
        userId: this.userId,
        order: { $gte: newOrder },
        _id: { $ne: this._id }
      },
      { $inc: { order: 1 } }
    );

    this.order = newOrder;
    return await this.save();
  } catch (error) {
    console.error('카테고리 순서 변경 실패:', error);
    throw error;
  }
};

const Category = mongoose.model('Category', categorySchema);

module.exports = Category;
